const redisStreamService = require("./redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");

// Cau truc: streamId -> { nextSeq, pending: Map<seq, event>, abortController, unsubscribe }
const streams = new Map(); // map lưu các streamId luồng của các conversationId đang trả lời chat

// BKAV HaiHS : ReorderBuffer - Bo dem sap xep lai thu tu token trong RAM - start
function flushPendingMessages(streamId) {
  // lấy luồng state từ map streams
  const state = streams.get(streamId);
  if (!state) return;

  // Kiểm tra xem có các chunk đang chờ xử lý trong pending không
  while (state.pending.has(state.nextSeq)) {
    const event = state.pending.get(state.nextSeq);
    state.pending.delete(state.nextSeq);
    state.nextSeq++;

    // phát sự kiện chunk xuống tất cả các client handler đang kết nối trực tiếp với server này
    for (const handler of state.clientHandlers) {
      try {
        handler(event);
      } catch (e) {
        // Bo qua neu client da dong ket noi
      }
    }
  }
}
// BKAV HaiHS : ReorderBuffer - Bo dem sap xep lai thu tu token trong RAM - end
class AIStreamManager {
  constructor() {}

  // BKAV HaiHS : Khởi chạy luồng AI - start
  async startBackgroundStream(streamId, chatModelPromise, modelName) {
    const abortController = new AbortController();

    // tạo một luồng mới và lưu vào map streams để quản lý
    streams.set(streamId, {
      nextSeq: 0, // Con tro tieu thu (consumer pointer) cho ReorderBuffer
      producerSeq: 0, // Con tro san xuat (producer pointer) cuc bo - tranh phu thuoc Redis
      pending: new Map(),
      clientHandlers: new Set(), // Tap hop cac callback client dang ket noi
      abortController,
      fullText: "",
      isFinished: false,
      modelName,
      startTime: Date.now(),
    });

    // xóa dữ liệu cũ trong Redis Stream (nếu có) và đánh dấu luồng này là đang active
    await redisStreamService.deleteStream(streamId);

    // Đánh dấu luồng này là đang active trong Redis để các server khác biết
    await redisStreamService.setStreamActive(streamId);

    (async () => {
      let unsubscribeControl;
      const state = streams.get(streamId);
      try {
        // BKAV HaiHS : Dang ky lang nghe tin hieu ABORT tu Redis Pub/Sub cheo may chu - start
        unsubscribeControl = await redisStreamService.subscribeToChannel(
          streamId,
          (event) => {
            if (event.type === "ABORT") {
              abortController.abort();
            }
          },
        );
        // BKAV HaiHS : Dang ky lang nghe tin hieu ABORT tu Redis Pub/Sub cheo may chu - end

        // Khởi tạo luồng AI từ model được cung cấp, truyền vào abortController.signal để có thể hủy bỏ khi cần
        const stream = await chatModelPromise(abortController.signal);

        // Đọc từng chunk từ luồng AI và xử lý
        for await (const chunk of stream) {
          // ngắt stream nếu có tín hiệu abort từ client hoặc server
          if (abortController.signal.aborted) break;

          // chuyển chunk sang chuỗi
          const chunkText = chunk.toString();
          // biến lưu nội dung đã được làm sạch từ chunkText
          let cleanText = "";

          //
          const lines = chunkText.split("\n");
          for (const line of lines) {
            const cleaned = line.trim();
            if (cleaned && cleaned.startsWith("data: ")) {
              const dataStr = cleaned.replace("data: ", "").trim();
              if (dataStr.startsWith("[DONE]")) {
                try {
                  const jsonStr = dataStr.replace("[DONE]", "").trim();
                  if (jsonStr) {
                    const parsedDone = JSON.parse(jsonStr);
                    if (parsedDone.usage) {
                      const currentState = streams.get(streamId);
                      if (currentState) {
                        currentState.usage = parsedDone.usage;
                      }
                    }
                  }
                } catch (e) {
                  // Bỏ qua lỗi parse
                }
              } else {
                try {
                  const parsed = JSON.parse(dataStr);
                  // lấy nội dung text từ các định dạng khác nhau của Flowise và LangChain
                  const text =
                    parsed.content || parsed.choices?.[0]?.delta?.content || "";
                  cleanText += text;
                } catch (e) {
                  // Bo qua dong loi parse thong tin
                }
              }
            }
          }

          // nếu cleanText không rỗng, tiến hành xử lý tiếp
          if (cleanText) {
            const currentState = streams.get(streamId);
            if (!currentState) break;

            // dừng luồng nếu có tín hiệu abort từ client hoặc server
            if (abortController.signal.aborted) break;

            // dùng biến cục bộ producerSeq để đánh số thứ tự cho các chunk được phát ra, tránh phụ thuộc vào Redis
            const seq = currentState.producerSeq++;

            // Tạo một sự kiện chunk với thông tin thứ tự và nội dung
            const event = { type: "chunk", seq, content: cleanText };

            // Cập nhật fullText của luồng trong state để lưu trữ toàn bộ nội dung đã nhận được
            currentState.fullText += cleanText;

            // ghi chunk vào redis stream để các server khác có thể nhận được
            await redisStreamService.appendChunk(streamId, event);

            // phát sự kiện chunk xuống tất cả các client handler đang kết nối trực tiếp với server này
            await redisStreamService.publishChunk(streamId, event);

            // đưa chunk vào ReorderBuffer của server này để các client đang kết nối trực tiếp với server A nhận ngay
            currentState.pending.set(seq, event);

            // gọi hàm flushPendingMessages để kiểm tra và phát các chunk theo đúng thứ tự
            flushPendingMessages(streamId);
          }
        }

        // phát tín hiệu done khi luồng kết thúc
        const currentStateDone = streams.get(streamId);
        const doneEvent = {
          type: "DONE",
          ...(currentStateDone &&
            currentStateDone.usage && { usage: currentStateDone.usage }),
        };
        await redisStreamService.publishChunk(streamId, doneEvent);

        // gửi tín hiệu DONE đến client
        if (currentStateDone) {
          for (const handler of currentStateDone.clientHandlers) {
            try {
              handler(doneEvent);
            } catch (e) {
              // Bỏ qua lỗi gửi
            }
          }
        }

        // gửi tin nhắn đến fe
        const finalState = streams.get(streamId);
        if (finalState && !finalState.isFinished) {
          const calculatedResponseTime = finalState.startTime
            ? ((Date.now() - finalState.startTime) / 1000).toFixed(1) + "s"
            : "1.2s";

          await conversationRepository.createMessage({
            role: "assistant",
            content: finalState.fullText,
            modelName: finalState.modelName || "flowise",
            conversationId: streamId,
            responseTime: calculatedResponseTime,
            promptTokens: finalState.usage?.prompt_tokens || 0,
            completionTokens: finalState.usage?.completion_tokens || 0,
            totalTokens: finalState.usage?.total_tokens || 0,
          });
        }
      } catch (err) {
        const currentState = streams.get(streamId);
        // kiểm tra xem có phải abort ko?
        const isAborted =
          err.name === "AbortError" ||
          err.message?.includes("aborted") ||
          err.message?.includes("canceled") ||
          abortController.signal.aborted;

        // lưu tin nhắn vào db khi người dùng bấm dừng
        if (isAborted) {
          if (
            currentState &&
            !currentState.isFinished &&
            currentState.fullText.trim()
          ) {
            currentState.isFinished = true; // Danh dau truoc de tranh double-save
            const calculatedResponseTime = currentState.startTime
              ? ((Date.now() - currentState.startTime) / 1000).toFixed(1) + "s"
              : "1.2s";

            await conversationRepository.createMessage({
              role: "assistant",
              content: currentState.fullText,
              modelName: currentState.modelName || "flowise",
              conversationId: streamId,
              responseTime: calculatedResponseTime,
              promptTokens: currentState.usage?.prompt_tokens || 0,
              completionTokens: currentState.usage?.completion_tokens || 0,
              totalTokens: currentState.usage?.total_tokens || 0,
            });
          }
          // Dong tat ca cac ket noi HTTP SSE cuc bo khi bi huy luong
          if (currentState) {
            if (!currentState.usage) {
              const completionTokens = Math.round(
                (currentState.fullText || "").length / 4,
              );
              currentState.usage = {
                prompt_tokens: 0,
                completion_tokens: completionTokens,
                total_tokens: completionTokens,
              };
            }
            const doneEvent = {
              type: "DONE",
              usage: currentState.usage,
            };
            for (const handler of currentState.clientHandlers) {
              try {
                handler(doneEvent);
              } catch (e) {
                // Bỏ qua lỗi gửi
              }
            }
          }
        } else {
          // gửi lỗi
          const errorEvent = { type: "ERROR", message: err.message };
          await redisStreamService.publishChunk(streamId, errorEvent);

          const currentStateErr = streams.get(streamId);
          if (currentStateErr) {
            for (const handler of currentStateErr.clientHandlers) {
              try {
                handler(errorEvent);
              } catch (e) {
                // Bỏ qua lỗi gửi
              }
            }
          }
          // BKAV HaiHS : Gui tin hieu ERROR toi cac client handler cuc bo cua Server A - end
        }
      } finally {
        const finalState = streams.get(streamId);
        if (finalState) finalState.isFinished = true;
        // BKAV HaiHS : Huy dang ky lang nghe tin hieu dieu khien khi stream ket thuc - start
        if (unsubscribeControl) {
          try {
            await unsubscribeControl();
          } catch (e) {
            // Im lang bo qua
          }
        }
        // BKAV HaiHS : Huy dang ky lang nghe tin hieu dieu khien khi stream ket thuc - end
        await redisStreamService.deleteStream(streamId);
        streams.delete(streamId);
      }
    })();
  }
  // BKAV HaiHS : Khởi chạy luồng AI - end

  // BKAV HaiHS : kết nối với client - start
  async connectClient(streamId, res) {
    const state = streams.get(streamId);

    if (!state) {
      // nếu ko có session thì kết nối với redis để resume tin nhắn
      return this.subscribeWithResume(streamId, res);
    }

    // nếu có session local, đăng ký clientHandler nhận chunk trực tiếp
    let connectionIsOpen = true;

    // nhận sự kiện từ client qua SSE và xử lý - start
    const onEvent = (event) => {
      // đóng nếu kết nối ko mở
      if (!connectionIsOpen) return;

      // nếu sự kiênj là "chunk" thì chuyển chunk thành JSON và gửi về FE
      if (event.type === "chunk") {
        const payload = { content: event.content };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
      // đóng kết nối nếu nhận được done
      else if (event.type === "DONE") {
        if (event.usage) {
          res.write(
            `data: [DONE] ${JSON.stringify({ usage: event.usage })}\n\n`,
          );
        } else {
          res.write("data: [DONE]\n\n");
        }
        res.end();
        connectionIsOpen = false;
        state.clientHandlers.delete(onEvent);
      }
      // đóng kết nối và gửi lỗi cho người dùng
      else if (event.type === "ERROR") {
        res.write(`data: ${JSON.stringify({ error: event.message })}\n\n`);
        res.end();
        connectionIsOpen = false;
        state.clientHandlers.delete(onEvent);
      }
    };
    // nhận sự kiện từ client qua SSE và xử lý - end

    // xử lý nếu client tắt trình duyệt
    res.on("close", () => {
      connectionIsOpen = false;
      state.clientHandlers.delete(onEvent);
    });

    // thêm hàm onEvent vào clientHandlers
    state.clientHandlers.add(onEvent);

    // nếu stream đã xong thì ngắt kết nối
    if (state.isFinished) {
      state.clientHandlers.delete(onEvent);
      if (state.usage) {
        res.write(`data: [DONE] ${JSON.stringify({ usage: state.usage })}\n\n`);
      } else {
        res.write("data: [DONE]\n\n");
      }
      res.end();
    }
  }
  // BKAV HaiHS : kết nối với client - end

  // BKAV HaiHS : kết nối lại khi vào stream (resume tin nhắn)- start
  async subscribeWithResume(streamId, res) {
    let connectionIsOpen = true;
    let isSynced = false; // false là giữ lại trong buffer chưa gửi xuống fe
    let syncedSeq = 0; // số thứ tự của chunk hiện tại
    const liveBuffer = [];

    // đăng ký lắng nghe kênh của stream
    const unsubscribe = await redisStreamService.subscribeToChannel(
      streamId,
      (event) => {
        if (!connectionIsOpen) return;
        if (!isSynced) {
          // giữ lại ko gửi xuống fe cho đến khi lấy lịch sử xong
          liveBuffer.push(event);
          return;
        }
        // gửi xuống fe nếu đã lấy lịch sử xong
        if (event.type === "DONE" || event.type === "ABORT") {
          if (event.usage) {
            res.write(
              `data: [DONE] ${JSON.stringify({ usage: event.usage })}\n\n`,
            );
          } else {
            res.write("data: [DONE]\n\n");
          }
          res.end();
          connectionIsOpen = false;
          return;
        }
        if (event.type === "chunk" && event.seq >= syncedSeq) {
          const payload = { content: event.content };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      },
    );

    // hủy luồng khi trang web tự đóng
    res.on("close", async () => {
      connectionIsOpen = false;
      await unsubscribe();
    });

    // resume tin nhắn từ redis stream
    let historyEvents = [];
    try {
      historyEvents = await redisStreamService.getChunks(streamId);
    } catch (e) {}

    // BKAV HaiHS : Kiểm tra xem luồng có đang hoạt động ko? nếu không thì hủy đăng ký redis và gửi done xuống fe- start
    if (historyEvents.length === 0 && liveBuffer.length === 0) {
      const stillActive = await redisStreamService.isStreamActive(streamId);
      if (!stillActive) {
        await unsubscribe();
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
    }

    // lấy ra mảng các chunk theo thứ tự
    const historyChunks = historyEvents
      .filter((e) => e.type === "chunk")
      .sort((a, b) => a.seq - b.seq);

    //  gộp các mảnh thành một đoạn văn bản hoàn chỉnh
    const fullHistoryText = historyChunks.map((e) => e.content).join("");

    // kiểm tra xem trong lịch sử đã có done chưa?
    const historyDone = historyEvents.some((e) => e.type === "DONE");

    // nếu có lịch sử và kết nối vẫn mở gửi toàn bộ về cho fe
    if (fullHistoryText && connectionIsOpen) {
      const syncPayload = {
        sync: true,
        content: fullHistoryText,
        resumeFromSeq: historyChunks.length,
      };
      res.write(`data: ${JSON.stringify(syncPayload)}\n\n`);
    }

    // Nếu trong lịch sử có tín hiệu done -> đóng kết nối luôn
    const historyDoneEvent = historyEvents.find((e) => e.type === "DONE");
    if (historyDoneEvent) {
      await unsubscribe();
      if (connectionIsOpen) {
        if (historyDoneEvent.usage) {
          res.write(
            `data: [DONE] ${JSON.stringify({ usage: historyDoneEvent.usage })}\n\n`,
          );
        } else {
          res.write("data: [DONE]\n\n");
        }
        res.end();
      }
      return;
    }

    // đặt syncedSeq bằng số lượng chunk lịch sử
    syncedSeq = historyChunks.length;

    // gửi các còn lại trong buffer
    for (const event of liveBuffer) {
      if (!connectionIsOpen) break;
      if (event.type === "DONE" || event.type === "ABORT") {
        await unsubscribe();
        if (event.usage) {
          res.write(
            `data: [DONE] ${JSON.stringify({ usage: event.usage })}\n\n`,
          );
        } else {
          res.write("data: [DONE]\n\n");
        }
        res.end();
        return;
      }
      if (event.type === "chunk" && event.seq >= syncedSeq) {
        const payload = { content: event.content };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    }

    // đánh dấu để nhận luôn các chunk ko qua buffer nữa
    isSynced = true;
  }
  // BKAV HaiHS : kết nối lại khi vào stream (resume tin nhắn)- end

  // BKAV HaiHS : Hủy bỏ luồng bằng abort - start
  async abortSession(streamId) {
    // kiểm tra xem này đang chạy ở server chính hay server lắng nghe bằng redis
    const state = streams.get(streamId);

    if (state) {
      // hủy trên máy chủ
      state.abortController.abort();
    }
    // hủy chéo
    await redisStreamService.publishAbort(streamId);
  }
  // BKAV HaiHS : Hủy bỏ luồng bằng abort - end

  // BKAV HaiHS : kiểm tra xem phòng chat có đang trong qusa trình sinh chữ hay ko? - start
  async isStreamActive(streamId) {
    return await redisStreamService.isStreamActive(streamId);
  }
  // BKAV HaiHS : kiểm tra xem phòng chat có đang trong qusa trình sinh chữ hay ko? - start
}

module.exports = new AIStreamManager();

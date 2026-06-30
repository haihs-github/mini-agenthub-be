const redisStreamService = require("./redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");

// BKAV HaiHS : ReorderBuffer - Bo dem sap xep lai thu tu token trong RAM - start
// Cau truc: streamId -> { nextSeq, pending: Map<seq, event>, abortController, unsubscribe }
const streams = new Map();

/**
 * Xa cac token dung thu tu tu ReorderBuffer xuong cac SSE res
 * Chi duoc goi sau khi da dong bo nextSeq voi lich su
 */
function flushPendingMessages(streamId) {
  const state = streams.get(streamId);
  if (!state) return;

  while (state.pending.has(state.nextSeq)) {
    const event = state.pending.get(state.nextSeq);
    state.pending.delete(state.nextSeq);
    state.nextSeq++;

    // Phat tin hieu cho tat ca cac client dang ket noi vao stream nay
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

  // BKAV HaiHS : Khoi chay luong AI chay ngam va ghi nhan du lieu qua Pub/Sub + Stream - start
  async startBackgroundStream(streamId, chatModelPromise, modelName) {
    const abortController = new AbortController();

    // Khoi tao trang thai stream trong bo nho RAM cuc bo
    streams.set(streamId, {
      nextSeq: 0, // Con tro tieu thu (consumer pointer) cho ReorderBuffer
      producerSeq: 0, // Con tro san xuat (producer pointer) cuc bo - tranh phu thuoc Redis
      pending: new Map(),
      clientHandlers: new Set(), // Tap hop cac callback client dang ket noi
      abortController,
      fullText: "",
      isFinished: false,
      modelName,
    });

    // Xoa du lieu cu tren Redis va bat dau fresh, dat co active phan tan
    await redisStreamService.deleteStream(streamId);
    await redisStreamService.setStreamActive(streamId);

    (async () => {
      const state = streams.get(streamId);
      try {
        const stream = await chatModelPromise(abortController.signal);

        for await (const chunk of stream) {
          // BKAV HaiHS : Kiem tra tin hieu huy NGAY DAU moi vong lap de thoat som nhat co the - start
          // Giam thieu so chunk "bay vao" giua luc FE bam Dung va tin hieu abort thuc su den
          if (abortController.signal.aborted) break;
          // BKAV HaiHS : Kiem tra tin hieu huy NGAY DAU moi vong lap de thoat som nhat co the - end

          const chunkText = chunk.toString();
          let cleanText = "";

          const lines = chunkText.split("\n");
          for (const line of lines) {
            const cleaned = line.trim();
            if (cleaned && cleaned.startsWith("data: ")) {
              const dataStr = cleaned.replace("data: ", "").trim();
              if (dataStr !== "[DONE]") {
                try {
                  const parsed = JSON.parse(dataStr);
                  // BKAV HaiHS : Uu tien lay content theo dinh dang cua LangChain - start
                  const text =
                    parsed.content || parsed.choices?.[0]?.delta?.content || "";
                  // BKAV HaiHS : Uu tien lay content theo dinh dang cua LangChain - end
                  cleanText += text;
                } catch (e) {
                  // Bo qua dong loi parse thong tin
                }
              }
            }
          }

          if (cleanText) {
            const currentState = streams.get(streamId);
            if (!currentState) break;

            // BKAV HaiHS : Kiem tra lan 2 sau khi parse xong chunk - tranh ghi chunk cuoi neu vua abort - start
            if (abortController.signal.aborted) break;
            // BKAV HaiHS : Kiem tra lan 2 sau khi parse xong chunk - tranh ghi chunk cuoi neu vua abort - end

            // BKAV HaiHS : Dung bien cuc bo producerSeq thay vi goi Redis de tranh bug khi Redis mat ket noi - start
            const seq = currentState.producerSeq++;
            // BKAV HaiHS : Dung bien cuc bo producerSeq thay vi goi Redis de tranh bug khi Redis mat ket noi - end

            const event = { type: "chunk", seq, content: cleanText };

            currentState.fullText += cleanText;

            // BKAV HaiHS : Ghi chunk vao Redis Stream lam lich su - start
            await redisStreamService.appendChunk(streamId, event);
            // BKAV HaiHS : Ghi chunk vao Redis Stream lam lich su - end

            // BKAV HaiHS : Phat chunk qua Pub/Sub de truyen realtime - start
            await redisStreamService.publishChunk(streamId, event);
            // BKAV HaiHS : Phat chunk qua Pub/Sub de truyen realtime - end

            // Dua truc tiep vao ReorderBuffer cua server nay de client tren server A nhan ngay
            currentState.pending.set(seq, event);
            flushPendingMessages(streamId);
          }
        }

        // BKAV HaiHS : Phat tin hieu DONE khi AI hoan tat - start
        const doneEvent = { type: "DONE" };
        await redisStreamService.publishChunk(streamId, doneEvent);

        // BKAV HaiHS : Gui tin hieu DONE toi cac client handler cuc bo cua Server A - start
        const currentStateDone = streams.get(streamId);
        if (currentStateDone) {
          for (const handler of currentStateDone.clientHandlers) {
            try {
              handler(doneEvent);
            } catch (e) {
              // Bỏ qua lỗi gửi
            }
          }
        }
        // BKAV HaiHS : Gui tin hieu DONE toi cac client handler cuc bo cua Server A - end
        // BKAV HaiHS : Phat tin hieu DONE khi AI hoan tat - end

        const finalState = streams.get(streamId);
        if (finalState && !finalState.isFinished) {
          await conversationRepository.createMessage({
            role: "assistant",
            content: finalState.fullText,
            modelName: finalState.modelName || "flowise",
            conversationId: streamId,
          });
        }
      } catch (err) {
        const currentState = streams.get(streamId);
        // BKAV HaiHS : Kiem tra nhieu cach de nhan biet day la abort, khong phai loi that - start
        const isAborted =
          err.name === "AbortError" ||
          err.message?.includes("aborted") ||
          err.message?.includes("canceled") ||
          abortController.signal.aborted;
        // BKAV HaiHS : Kiem tra nhieu cach de nhan biet day la abort, khong phai loi that - end

        if (isAborted) {
          // BKAV HaiHS : Luu tin nhan dang do vao DB khi nguoi dung bam Dung - start
          if (
            currentState &&
            !currentState.isFinished &&
            currentState.fullText.trim()
          ) {
            currentState.isFinished = true; // Danh dau truoc de tranh double-save
            await conversationRepository.createMessage({
              role: "assistant",
              content: currentState.fullText,
              modelName: currentState.modelName || "flowise",
              conversationId: streamId,
            });
          }
          // BKAV HaiHS : Luu tin nhan dang do vao DB khi nguoi dung bam Dung - end
        } else {
          // Phat loi xuong tat ca client dang ket noi
          const errorEvent = { type: "ERROR", message: err.message };
          await redisStreamService.publishChunk(streamId, errorEvent);

          // BKAV HaiHS : Gui tin hieu ERROR toi cac client handler cuc bo cua Server A - start
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
        await redisStreamService.deleteStream(streamId);
        streams.delete(streamId);
      }
    })();
  }
  // BKAV HaiHS : Khoi chay luong AI chay ngam va ghi nhan du lieu qua Pub/Sub + Stream - end

  // BKAV HaiHS : Ket noi client ban dau (Server A - co session local) - start
  async connectClient(streamId, res) {
    const state = streams.get(streamId);

    if (!state) {
      // Khong co session local -> dung subscribeWithResume de ket noi qua Redis
      return this.subscribeWithResume(streamId, res);
    }

    // Server A: Co session local, dang ky clientHandler de nhan chunk truc tiep
    let connectionIsOpen = true;

    // BKAV HaiHS : Khai bao onEvent TRUOC res.on("close") de tranh TDZ reference error - start
    const onEvent = (event) => {
      if (!connectionIsOpen) return;
      if (event.type === "chunk") {
        const payload = { content: event.content };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } else if (event.type === "DONE") {
        res.write("data: [DONE]\n\n");
        res.end();
        connectionIsOpen = false;
        state.clientHandlers.delete(onEvent);
      } else if (event.type === "ERROR") {
        res.write(`data: ${JSON.stringify({ error: event.message })}\n\n`);
        res.end();
        connectionIsOpen = false;
        state.clientHandlers.delete(onEvent);
      }
    };
    // BKAV HaiHS : Khai bao onEvent TRUOC res.on("close") de tranh TDZ reference error - end

    res.on("close", () => {
      connectionIsOpen = false;
      state.clientHandlers.delete(onEvent);
    });

    state.clientHandlers.add(onEvent);

    // Neu stream da xong truoc khi client ket noi thi dong ngay
    if (state.isFinished) {
      state.clientHandlers.delete(onEvent);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
  // BKAV HaiHS : Ket noi client ban dau (Server A - co session local) - end

  // BKAV HaiHS : Ket noi lai theo quy trinh 3 buoc: Subscribe Truoc - Query Sau - Flush - start
  async subscribeWithResume(streamId, res) {
    let connectionIsOpen = true;

    res.on("close", () => {
      connectionIsOpen = false;
    });

    // Buoc 1: SUBSCRIBE TRUOC - Hang so cac live token vao ReorderBuffer tam thoi
    // Dam bao khong mat token nao trong khoang thoi gian Query lich su
    const liveBuffer = []; // Bo dem tam thoi cho cac token nhan duoc truoc khi sync

    let unsubscribe = await redisStreamService.subscribeToChannel(
      streamId,
      (event) => {
        if (!connectionIsOpen) return;
        liveBuffer.push(event);
      },
    );

    // Buoc 2: QUERY LICH SU - Doc toan bo chunk da luu tu Redis Stream
    let historyEvents = [];
    try {
      historyEvents = await redisStreamService.getChunks(streamId);
    } catch (e) {
      // Neu loi thi bo qua lich su
    }

    // Kiem tra neu stream khong ton tai va khong co lich su
    if (historyEvents.length === 0 && liveBuffer.length === 0) {
      const hasStream = await redisStreamService.hasStream(streamId);
      if (!hasStream) {
        await unsubscribe();
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
    }

    // Buoc 3: GUI LICH SU va DONG BO seq
    // BKAV HaiHS : Gui toan bo lich su ve FE bang 1 su kien sync duy nhat - start
    const historyChunks = historyEvents
      .filter((e) => e.type === "chunk")
      .sort((a, b) => a.seq - b.seq);

    const fullHistoryText = historyChunks.map((e) => e.content).join("");
    const historyDone = historyEvents.some((e) => e.type === "DONE");

    if (fullHistoryText) {
      // Phat mot su kien sync duy nhat chua toan bo lich su
      const syncPayload = {
        sync: true,
        content: fullHistoryText,
        resumeFromSeq: historyChunks.length,
      };
      if (connectionIsOpen) {
        res.write(`data: ${JSON.stringify(syncPayload)}\n\n`);
      }
    }
    // BKAV HaiHS : Gui toan bo lich su ve FE bang 1 su kien sync duy nhat - end

    // Neu lich su da co DONE thi ket thuc luon
    if (historyDone) {
      await unsubscribe();
      if (connectionIsOpen) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    }

    // Dong bo nextSeq: bo qua tat ca cac live token co seq <= lich su da gui
    const syncedSeq = historyChunks.length;

    // BKAV HaiHS : Flush ReorderBuffer - Xa cac live token dang cho - start
    // Xu ly cac token da nam trong liveBuffer truoc khi ket thuc sync
    const pendingLive = [...liveBuffer];
    liveBuffer.length = 0; // Xoa buffer tam thoi

    for (const event of pendingLive) {
      if (!connectionIsOpen) break;
      if (event.type === "DONE") {
        await unsubscribe();
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      if (event.type === "chunk" && event.seq >= syncedSeq) {
        const payload = { content: event.content };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    }
    // BKAV HaiHS : Flush ReorderBuffer - Xa cac live token dang cho - end

    // Chuyen che do: Tu nay nhan truc tiep tu Pub/Sub va day xuong FE ngay lap tuc
    // BKAV HaiHS : Lang nghe cac chunk tiep theo qua Pub/Sub realtime - start
    await unsubscribe(); // Huy subscribe cu

    unsubscribe = await redisStreamService.subscribeToChannel(
      streamId,
      (event) => {
        if (!connectionIsOpen) return;
        if (event.type === "DONE") {
          res.write("data: [DONE]\n\n");
          res.end();
          connectionIsOpen = false;
          unsubscribe();
          return;
        }
        if (event.type === "ABORT") {
          res.write("data: [DONE]\n\n");
          res.end();
          connectionIsOpen = false;
          unsubscribe();
          return;
        }
        if (event.type === "chunk" && event.seq >= syncedSeq) {
          const payload = { content: event.content };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      },
    );
    // BKAV HaiHS : Lang nghe cac chunk tiep theo qua Pub/Sub realtime - end

    // Khi client dong ket noi thi cleanup
    res.on("close", async () => {
      connectionIsOpen = false;
      await unsubscribe();
    });
  }
  // BKAV HaiHS : Ket noi lai theo quy trinh 3 buoc: Subscribe Truoc - Query Sau - Flush - end

  // BKAV HaiHS : Huy bo phien stream va phat tin hieu ABORT cheo may chu - start
  async abortSession(streamId) {
    const state = streams.get(streamId);
    if (state) {
      // BKAV HaiHS : Chi goi abort(), KHONG xoa state ngay tai day - start
      // Ly do: catch block trong IIFE startBackgroundStream can doc state.fullText
      // de luu tin nhan dang do vao DB truoc khi finally block chay va tu dong xoa state
      state.abortController.abort();
      // BKAV HaiHS : Chi goi abort(), KHONG xoa state ngay tai day - end
    }
    // Phat tin hieu ABORT qua Pub/Sub de cac server khac biet
    await redisStreamService.publishAbort(streamId);
  }
  // BKAV HaiHS : Huy bo phien stream va phat tin hieu ABORT cheo may chu - end

  // BKAV HaiHS : Kiem tra luong stream co dang active khong (Thuan Redis Distributed) - start
  async isStreamActive(streamId) {
    return await redisStreamService.isStreamActive(streamId);
  }
  // BKAV HaiHS : Kiem tra luong stream co dang active khong (Thuan Redis Distributed) - end
}

module.exports = new AIStreamManager();

const EventEmitter = require("events");
const redisStreamService = require("./redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");

class AIStreamManager {
  constructor() {
    this.sessions = new Map();
  }

  // BKAV HaiHS : Khoi chay luong AI chay ngam va ghi nhan du lieu vao Redis Stream - start
  async startBackgroundStream(conversationId, chatModelPromise, modelName) {
    const abortController = new AbortController();
    const emitter = new EventEmitter();

    const session = {
      abortController,
      emitter,
      fullText: "",
      isFinished: false,
      modelName,
    };

    this.sessions.set(conversationId, session);
    await redisStreamService.deleteStream(conversationId);

    (async () => {
      try {
        const stream = await chatModelPromise(abortController.signal);

        for await (const chunk of stream) {
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
                  const text =
                    parsed.choices?.[0]?.delta?.content || parsed.content || "";
                  cleanText += text;
                } catch (e) {
                  // Bo qua dong loi parse thong tin
                }
              }
            }
          }

          if (cleanText) {
            session.fullText += cleanText;
            await redisStreamService.addChunk(conversationId, cleanText);
            emitter.emit("chunk", cleanText);
          }
        }

        // BKAV HaiHS : Ghi nhận phần tử kết thúc [DONE] vào Redis Stream để báo hiệu hoàn tất cho Server B - start
        await redisStreamService.addChunk(conversationId, "[DONE]");
        // BKAV HaiHS : Ghi nhận phần tử kết thúc [DONE] vào Redis Stream để báo hiệu hoàn tất cho Server B - end

        if (!session.isFinished) {
          await conversationRepository.createMessage({
            role: "assistant",
            content: session.fullText,
            modelName: session.modelName || "flowise",
            conversationId,
          });
        }
      } catch (err) {
        if (err.name === "AbortError" || err.message?.includes("aborted")) {
          if (session.fullText.trim()) {
            await conversationRepository.createMessage({
              role: "assistant",
              content: session.fullText,
              modelName: session.modelName || "flowise",
              conversationId,
            });
          }
        } else {
          emitter.emit("error", err);
        }
      } finally {
        session.isFinished = true;
        emitter.emit("end");
        await redisStreamService.deleteStream(conversationId);
        this.sessions.delete(conversationId);
      }
    })();
  }
  // BKAV HaiHS : Khoi chay luong AI chay ngam va ghi nhan du lieu vao Redis Stream - end

  // BKAV HaiHS : Ket noi nguoi dung hien tai vao luong AI stream dang hoat dong - start
  async connectClient(conversationId, res) {
    const session = this.sessions.get(conversationId);
    let lastId = "0";
    let connectionIsOpen = true;

    res.on("close", () => {
      connectionIsOpen = false;
    });

    if (!session) {
      // Server B: Không có session local, kiểm tra xem có Redis Stream đang chạy không
      const hasStream = await redisStreamService.hasStream(conversationId);
      if (!hasStream) {
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }

      // Đọc và phát lại toàn bộ lịch sử (Playback) từ đầu (lastId = "0")
      const historyResult = await redisStreamService.readNext(conversationId, "0");
      lastId = historyResult.lastId;
      for (const item of historyResult.chunks) {
        if (item.chunk === "[DONE]") {
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }
        const payload = { choices: [{ delta: { content: item.chunk } }] };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }

      // Vòng lặp chờ chữ mới realtime từ Redis Stream
      (async () => {
        try {
          while (connectionIsOpen) {
            const hasStreamStill = await redisStreamService.hasStream(conversationId);
            if (!hasStreamStill) {
              res.write(`data: [DONE]\n\n`);
              res.end();
              break;
            }

            const readResult = await redisStreamService.readNext(conversationId, lastId, 2000);
            if (readResult && readResult.chunks.length > 0) {
              lastId = readResult.lastId;
              let foundDone = false;
              for (const item of readResult.chunks) {
                if (item.chunk === "[DONE]") {
                  foundDone = true;
                  break;
                }
                const payload = { choices: [{ delta: { content: item.chunk } }] };
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
              }
              if (foundDone) {
                res.write(`data: [DONE]\n\n`);
                res.end();
                break;
              }
            }
          }
        } catch (err) {
          console.error("Lỗi đọc stream chặn tại Server B:", err);
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        }
      })();
      return;
    }

    // Server A: Có session local, sử dụng emitter để phát realtime siêu tốc
    const pastChunks = await redisStreamService.readAll(conversationId);
    for (const chunk of pastChunks) {
      if (chunk === "[DONE]") {
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }
      const payload = { choices: [{ delta: { content: chunk } }] };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    const onChunk = (chunkText) => {
      const payload = { choices: [{ delta: { content: chunkText } }] };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const onEnd = () => {
      res.write(`data: [DONE]\n\n`);
      res.end();
      cleanup();
    };

    const onError = (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
      cleanup();
    };

    const cleanup = () => {
      session.emitter.off("chunk", onChunk);
      session.emitter.off("end", onEnd);
      session.emitter.off("error", onError);
    };

    session.emitter.on("chunk", onChunk);
    session.emitter.on("end", onEnd);
    session.emitter.on("error", onError);

    if (session.isFinished) {
      onEnd();
    }
  }
  // BKAV HaiHS : Ket noi nguoi dung hien tai vao luong AI stream dang hoat dong - end

  // BKAV HaiHS : Huy bo phien stream dang chay va luu phan tin nhan dang do vao DB - start
  async abortSession(conversationId) {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.abortController.abort();
      this.sessions.delete(conversationId);
    }
  }
  // BKAV HaiHS : Huy bo phien stream dang chay va luu phan tin nhan dang do vao DB - end

  // BKAV HaiHS : Kiem tra phien stream cua phong chat hien tai co dang active khong - start
  async isSessionActive(conversationId) {
    const localActive = this.sessions.has(conversationId);
    const redisActive = await redisStreamService.hasStream(conversationId);
    return localActive || redisActive;
  }
  // BKAV HaiHS : Kiem tra phien stream cua phong chat hien tai co dang active khong - end
}

module.exports = new AIStreamManager();

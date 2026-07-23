// quản lý luồng stream chunk AI
const redisStreamService = require("./redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");
const { getEncoding } = require("js-tiktoken");
const tiktokenEncoder = getEncoding("cl100k_base");
const { AISERVICE } = require("../constants/aiServiceConst");

// Cấu trúc: streamId -> { nextSeq, pending: Map<seq, event>, abortController, clientHandlers, ... }
const streams = new Map();

// BKAV HaiHS : Định nghĩa lớp AIStreamManager quản lý điều phối luồng stream AI cục bộ và phân tán - start
class AIStreamManager {
  constructor() {}
  // BKAV HaiHS : Khởi chạy luồng stream AI chạy nền - start
  async startBackgroundStream(
    streamId,
    chatModelPromise,
    modelName,
    prompt,
    historyMessages,
  ) {
    const abortController = new AbortController();
    const promptTokens = this.#calculatePromptTokens(prompt, historyMessages);

    streams.set(streamId, {
      nextSeq: 0,
      producerSeq: 0,
      pending: new Map(),
      clientHandlers: new Set(),
      abortController,
      fullText: "",
      isFinished: false,
      modelName,
      promptTokens,
      startTime: Date.now(),
    });

    await redisStreamService.deleteStream(streamId);
    await redisStreamService.setStreamActive(streamId);

    this.#runBackgroundStreamProcess(
      streamId,
      chatModelPromise,
      abortController,
    );
  }
  // BKAV HaiHS : Khởi chạy luồng stream AI chạy nền - end

  // BKAV HaiHS : Đăng ký kết nối client SSE trực tiếp với server - start
  async connectClient(streamId, res) {
    const state = streams.get(streamId);
    if (!state) {
      return this.subscribeWithResume(streamId, res);
    }

    let connectionIsOpen = true;

    const onEvent = (event) => {
      if (!connectionIsOpen) return;
      if (this.#sendSseEvent(res, event)) {
        connectionIsOpen = false;
        state.clientHandlers.delete(onEvent);
      }
    };

    res.on("close", () => {
      connectionIsOpen = false;
      state.clientHandlers.delete(onEvent);
    });

    state.clientHandlers.add(onEvent);

    if (state.isFinished) {
      state.clientHandlers.delete(onEvent);
      this.#writeSseDone(res, state);
      res.end();
    }
  }
  // BKAV HaiHS : Đăng ký kết nối client SSE trực tiếp với server - end

  // BKAV HaiHS : Khôi phục và phát tiếp stream dở dang cho client khi reconnection - start
  async subscribeWithResume(streamId, res) {
    const resumeState = {
      connectionIsOpen: true,
      isSynced: false,
      syncedSeq: 0,
      liveBuffer: [],
      res,
      handleTerminal: null,
    };

    const unsubscribe = await this.#setupResumeSubscription(
      streamId,
      res,
      resumeState,
    );

    const isTerminated = await this.#syncHistoryAndReplayBuffer(
      streamId,
      res,
      resumeState,
      unsubscribe,
    );
    if (isTerminated) return;

    resumeState.isSynced = true;
  }
  // BKAV HaiHS : Khôi phục và phát tiếp stream dở dang cho client khi reconnection - end

  // BKAV HaiHS : Hủy bỏ phiên stream chat cục bộ và phát tín hiệu chéo hệ thống - start
  async abortSession(streamId) {
    const state = streams.get(streamId);
    if (state) {
      state.abortController.abort();
    }
    await redisStreamService.publishAbort(streamId);
  }
  // BKAV HaiHS : Hủy bỏ phiên stream chat cục bộ và phát tín hiệu chéo hệ thống - end

  // BKAV HaiHS : Kiểm tra trạng thái hoạt động của stream trong Redis - start
  async isStreamActive(streamId) {
    return await redisStreamService.isStreamActive(streamId);
  }
  // BKAV HaiHS : Kiểm tra trạng thái hoạt động của stream trong Redis - end

  // BKAV HaiHS : Hàm phụ đếm token bằng encoder tiktoken - start
  #countTokens(text) {
    if (!text) return 0;
    return tiktokenEncoder.encode(text).length;
  }
  // BKAV HaiHS : Hàm phụ đếm token bằng encoder tiktoken - end

  // BKAV HaiHS : Hàm phụ tính tổng token ngữ cảnh đầu vào - start
  #calculatePromptTokens(prompt, historyMessages) {
    let fullPromptText = prompt || "";
    if (Array.isArray(historyMessages)) {
      fullPromptText +=
        " " + historyMessages.map((m) => m.content || "").join(" ");
    }
    return this.#countTokens(fullPromptText) + 40;
  }
  // BKAV HaiHS : Hàm phụ tính tổng token ngữ cảnh đầu vào - end

  // BKAV HaiHS : Hàm phụ bóc tách usage token từ thông điệp DONE - start
  #parseDoneUsage(dataStr) {
    if (!dataStr.startsWith("[DONE]")) return null;
    try {
      const jsonStr = dataStr.replace("[DONE]", "").trim();
      if (!jsonStr) return null;
      const parsedDone = JSON.parse(jsonStr);
      return parsedDone.usage || null;
    } catch (e) {
      return null;
    }
  }
  // BKAV HaiHS : Hàm phụ bóc tách usage token từ thông điệp DONE - end

  // BKAV HaiHS : Hàm phụ bóc tách nội dung văn bản từ chuỗi JSON - start
  #parseJsonContent(dataStr) {
    try {
      const parsed = JSON.parse(dataStr);
      return parsed.content || parsed.choices?.[0]?.delta?.content || "";
    } catch (e) {
      console.warn("[Stream Parser] Bỏ qua dòng không phải định dạng JSON:", dataStr);
      return "";
    }
  }
  // BKAV HaiHS : Hàm phụ bóc tách nội dung văn bản từ chuỗi JSON - end

  // BKAV HaiHS : Hàm phụ phân tích cấu trúc một dòng dữ liệu SSE - start
  #parseChunkLine(line, currentState) {
    const cleaned = line.trim();
    if (!cleaned.startsWith("data: ")) return "";

    const dataStr = cleaned.slice(6).trim();

    const usage = this.#parseDoneUsage(dataStr);
    if (usage) {
      if (currentState) currentState.usage = usage;
      return "";
    }

    return this.#parseJsonContent(dataStr);
  }
  // BKAV HaiHS : Hàm phụ phân tích cấu trúc một dòng dữ liệu SSE - end

  // BKAV HaiHS : Hàm phụ trích xuất text sạch từ buffer thô - start
  #extractCleanTextFromChunk(chunkText, currentState) {
    let cleanText = "";
    const lines = chunkText.split("\n");
    for (const line of lines) {
      cleanText += this.#parseChunkLine(line, currentState);
    }
    return cleanText;
  }
  // BKAV HaiHS : Hàm phụ trích xuất text sạch từ buffer thô - end

  // BKAV HaiHS : Hàm phụ đóng gói payload dữ liệu DONE - start
  #buildDonePayload(eventOrState) {
    if (!eventOrState) return {};
    const payload = {};
    if (eventOrState.usage) payload.usage = eventOrState.usage;
    if (eventOrState.responseTime)
      payload.responseTime = eventOrState.responseTime;
    if (eventOrState.isStopped !== undefined)
      payload.isStopped = eventOrState.isStopped;
    return payload;
  }
  // BKAV HaiHS : Hàm phụ đóng gói payload dữ liệu DONE - end

  // BKAV HaiHS : Hàm phụ ghi sự kiện DONE SSE xuống kết nối client - start
  #writeSseDone(res, payloadSource) {
    const donePayload = this.#buildDonePayload(payloadSource);
    if (Object.keys(donePayload).length > 0) {
      res.write(`data: [DONE] ${JSON.stringify(donePayload)}\n\n`);
    } else {
      res.write("data: [DONE]\n\n");
    }
  }
  // BKAV HaiHS : Hàm phụ ghi sự kiện DONE SSE xuống kết nối client - end

  // BKAV HaiHS : Hàm phụ phân phối và gửi sự kiện SSE tới client - start
  #sendSseEvent(res, event) {
    if (event.type === AISERVICE.STREAM_EVENTS.CHUNK) {
      res.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
      return false;
    }
    if (event.type === AISERVICE.STREAM_EVENTS.DONE) {
      this.#writeSseDone(res, event);
      res.end();
      return true;
    }
    if (event.type === AISERVICE.STREAM_EVENTS.ERROR) {
      res.write(`data: ${JSON.stringify({ error: event.message })}\n\n`);
      res.end();
      return true;
    }
    return false;
  }
  // BKAV HaiHS : Hàm phụ phân phối và gửi sự kiện SSE tới client - end

  // BKAV HaiHS : Hàm phụ đo lường thời gian phản hồi và số lượng token - start
  #calculateUsageAndResponseTime(state) {
    if (!state) return { responseTime: "", usage: null };

    const elapsedMs = Date.now() - (state.startTime || Date.now());
    const responseTime = (elapsedMs / 1000).toFixed(1) + "s";
    state.responseTime = responseTime;

    if (!state.usage) {
      const promptTokens = state.promptTokens || 0;
      const completionTokens = this.#countTokens(state.fullText);
      state.usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };
    }

    return { responseTime, usage: state.usage };
  }
  // BKAV HaiHS : Hàm phụ đo lường thời gian phản hồi và số lượng token - end

  // BKAV HaiHS : Hàm phụ xả các tin nhắn theo đúng trình tự từ ReorderBuffer - start
  #flushPendingMessages(streamId) {
    const state = streams.get(streamId);
    if (!state) return;

    while (state.pending.has(state.nextSeq)) {
      const event = state.pending.get(state.nextSeq);
      state.pending.delete(state.nextSeq);
      state.nextSeq++;

      for (const handler of state.clientHandlers) {
        try {
          handler(event);
        } catch (e) {
          // Bỏ qua nếu client đóng kết nối
        }
      }
    }
  }
  // BKAV HaiHS : Hàm phụ xả các tin nhắn theo đúng trình tự từ ReorderBuffer - end

  // BKAV HaiHS : Hàm phụ xử lý riêng biệt cho một chunk đơn lẻ - start
  async #processSingleChunk(
    streamId,
    cleanText,
    currentState,
    abortController,
  ) {
    if (!cleanText || !currentState || abortController.signal.aborted) return;

    const seq = currentState.producerSeq++;
    const event = {
      type: AISERVICE.STREAM_EVENTS.CHUNK,
      seq,
      content: cleanText,
    };

    currentState.fullText += cleanText;

    await redisStreamService.appendChunk(streamId, event);
    await redisStreamService.publishChunk(streamId, event);

    currentState.pending.set(seq, event);
    this.#flushPendingMessages(streamId);
  }
  // BKAV HaiHS : Hàm phụ xử lý riêng biệt cho một chunk đơn lẻ - end

  // BKAV HaiHS : Hàm phụ phân phối tin nhắn đến các local handler - start
  #notifyLocalHandlers(state, event) {
    if (!state) return;
    for (const handler of state.clientHandlers) {
      try {
        handler(event);
      } catch (e) {
        // Bỏ qua lỗi
      }
    }
  }
  // BKAV HaiHS : Hàm phụ phân phối tin nhắn đến các local handler - end

  // BKAV HaiHS : Hàm phụ lưu thông tin hội thoại vào cơ sở dữ liệu - start
  async #saveMessageToDb(streamId, state, isStopped) {
    if (!state || state.isFinished) return;
    state.isFinished = true;

    const { responseTime, usage } = this.#calculateUsageAndResponseTime(state);

    await conversationRepository.createMessage({
      role: "assistant",
      content: state.fullText,
      modelName: state.modelName || "flowise",
      conversationId: streamId,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTime: state.responseTime || responseTime,
      isStopped,
    });
  }
  // BKAV HaiHS : Hàm phụ lưu thông tin hội thoại vào cơ sở dữ liệu - end

  // BKAV HaiHS : Hàm phụ xử lý dữ liệu dở dang khi bị dừng stream đột ngột - start
  async #handleStreamAbortError(streamId, currentState) {
    if (
      currentState &&
      !currentState.isFinished &&
      currentState.fullText.trim()
    ) {
      await this.#saveMessageToDb(streamId, currentState, true);
    }

    if (currentState) {
      const { responseTime, usage } =
        this.#calculateUsageAndResponseTime(currentState);
      const doneEvent = {
        type: AISERVICE.STREAM_EVENTS.DONE,
        isStopped: true,
        responseTime: currentState.responseTime || responseTime,
        usage,
      };
      this.#notifyLocalHandlers(currentState, doneEvent);
    }
  }
  // BKAV HaiHS : Hàm phụ xử lý dữ liệu dở dang khi bị dừng stream đột ngột - end

  // BKAV HaiHS : Hàm phụ xử lý và bắn lỗi hệ thống chéo Redis/Client - start
  async #handleStreamGeneralError(streamId, err) {
    const errorEvent = {
      type: AISERVICE.STREAM_EVENTS.ERROR,
      message: err.message,
    };
    await redisStreamService.publishChunk(streamId, errorEvent);
    this.#notifyLocalHandlers(streams.get(streamId), errorEvent);
  }
  // BKAV HaiHS : Hàm phụ xử lý và bắn lỗi hệ thống chéo Redis/Client - end

  // BKAV HaiHS : Hàm phụ hoàn thiện và lưu trữ stream khi AI hoàn thành - start
  async #finishBackgroundStreamSuccess(streamId) {
    const currentStateDone = streams.get(streamId);
    const { responseTime, usage } =
      this.#calculateUsageAndResponseTime(currentStateDone);

    const doneEvent = {
      type: AISERVICE.STREAM_EVENTS.DONE,
      ...(currentStateDone && {
        isStopped: false,
        responseTime,
        ...(usage && { usage }),
      }),
    };

    await redisStreamService.publishChunk(streamId, doneEvent);
    this.#notifyLocalHandlers(currentStateDone, doneEvent);
    await this.#saveMessageToDb(streamId, streams.get(streamId), false);
  }
  // BKAV HaiHS : Hàm phụ hoàn thiện và lưu trữ stream khi AI hoàn thành - end

  // BKAV HaiHS : Hàm phụ dọn dẹp các tài nguyên phòng stream khi kết thúc - start
  async #cleanupStreamState(streamId, unsubscribeControl) {
    const finalState = streams.get(streamId);
    if (finalState) finalState.isFinished = true;

    if (unsubscribeControl) {
      try {
        await unsubscribeControl();
      } catch (e) {}
    }
    await redisStreamService.deleteStream(streamId);
    streams.delete(streamId);
  }
  // BKAV HaiHS : Hàm phụ dọn dẹp các tài nguyên phòng stream khi kết thúc - end

  // BKAV HaiHS : Hàm phụ khởi chạy tiến trình xử lý luồng stream nền - start
  async #runBackgroundStreamProcess(
    streamId,
    chatModelPromise,
    abortController,
  ) {
    let unsubscribeControl;
    try {
      unsubscribeControl = await redisStreamService.subscribeToChannel(
        streamId,
        (event) => {
          if (event.type === AISERVICE.STREAM_EVENTS.ABORT)
            abortController.abort();
        },
      );

      const stream = await chatModelPromise(abortController.signal);

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        const currentState = streams.get(streamId);
        const cleanText = this.#extractCleanTextFromChunk(
          chunk.toString(),
          currentState,
        );
        await this.#processSingleChunk(
          streamId,
          cleanText,
          currentState,
          abortController,
        );
      }

      await this.#finishBackgroundStreamSuccess(streamId);
    } catch (err) {
      const currentState = streams.get(streamId);
      const isAborted =
        err.name === "AbortError" ||
        err.message?.includes("aborted") ||
        err.message?.includes("canceled") ||
        abortController.signal.aborted;

      if (isAborted) {
        await this.#handleStreamAbortError(streamId, currentState);
      } else {
        await this.#handleStreamGeneralError(streamId, err);
      }
    } finally {
      await this.#runBackgroundStreamProcessFinally(
        streamId,
        unsubscribeControl,
      );
    }
  }
  // BKAV HaiHS : Hàm phụ khởi chạy tiến trình xử lý luồng stream nền - end

  // BKAV HaiHS : Hàm phụ bọc logic dọn dẹp khối finally của stream nền - start
  async #runBackgroundStreamProcessFinally(streamId, unsubscribeControl) {
    await this.#cleanupStreamState(streamId, unsubscribeControl);
  }
  // BKAV HaiHS : Hàm phụ bọc logic dọn dẹp khối finally của stream nền - end

  // BKAV HaiHS : Hàm phụ xử lý các gói tin nhận từ Redis PubSub - start
  #createPubSubHandler(state) {
    return async (event) => {
      if (!state.connectionIsOpen) return;
      if (!state.isSynced) return state.liveBuffer.push(event);

      if (
        event.type === AISERVICE.STREAM_EVENTS.DONE ||
        event.type === AISERVICE.STREAM_EVENTS.ABORT
      ) {
        return state.handleTerminal(event);
      }
      if (
        event.type === AISERVICE.STREAM_EVENTS.CHUNK &&
        event.seq >= state.syncedSeq
      ) {
        state.res.write(
          `data: ${JSON.stringify({ content: event.content })}\n\n`,
        );
      }
    };
  }
  // BKAV HaiHS : Hàm phụ xử lý các gói tin nhận từ Redis PubSub - end

  // BKAV HaiHS : Hàm phụ gọi dịch vụ Redis lấy danh sách các chunk lịch sử - start
  async #fetchHistoryEvents(streamId) {
    try {
      return await redisStreamService.getChunks(streamId);
    } catch (e) {
      return [];
    }
  }
  // BKAV HaiHS : Hàm phụ gọi dịch vụ Redis lấy danh sách các chunk lịch sử - end

  // BKAV HaiHS : Hàm phụ xử lý gộp các chunk lịch sử thành chuỗi hoàn chỉnh - start
  #processHistoryChunks(historyEvents) {
    const chunks = historyEvents
      .filter((e) => e.type === AISERVICE.STREAM_EVENTS.CHUNK)
      .sort((a, b) => a.seq - b.seq);

    return {
      chunks,
      fullText: chunks.map((e) => e.content).join(""),
      doneEvent: historyEvents.find(
        (e) => e.type === AISERVICE.STREAM_EVENTS.DONE,
      ),
    };
  }
  // BKAV HaiHS : Hàm phụ xử lý gộp các chunk lịch sử thành chuỗi hoàn chỉnh - end

  // BKAV HaiHS : Hàm phụ đẩy gói tin đồng bộ lịch sử xuống Client SSE - start
  #sendHistorySync(res, fullText, resumeFromSeq) {
    const payload = { sync: true, content: fullText, resumeFromSeq };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
  // BKAV HaiHS : Hàm phụ đẩy gói tin đồng bộ lịch sử xuống Client SSE - end

  // BKAV HaiHS : Hàm phụ kiểm tra và xử lý đóng luồng khi lịch sử trống - start
  async #checkAndHandleEmptyHistory(
    streamId,
    historyEvents,
    liveBuffer,
    unsubscribe,
    res,
  ) {
    if (historyEvents.length > 0 || liveBuffer.length > 0) return false;

    const stillActive = await redisStreamService.isStreamActive(streamId);
    if (!stillActive) {
      await unsubscribe();
      res.write("data: [DONE]\n\n");
      res.end();
      return true;
    }
    return false;
  }
  // BKAV HaiHS : Hàm phụ kiểm tra và xử lý đóng luồng khi lịch sử trống - end

  // BKAV HaiHS : Hàm phụ ghi tiếp các gói tin tạm giữ trong buffer xuống Client - start
  async #replayBufferedEvents(liveBuffer, syncedSeq, handleTerminal, res) {
    for (const event of liveBuffer) {
      if (
        event.type === AISERVICE.STREAM_EVENTS.DONE ||
        event.type === AISERVICE.STREAM_EVENTS.ABORT
      ) {
        await handleTerminal(event);
        return true;
      }
      if (
        event.type === AISERVICE.STREAM_EVENTS.CHUNK &&
        event.seq >= syncedSeq
      ) {
        res.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
      }
    }
    return false;
  }
  // BKAV HaiHS : Hàm phụ ghi tiếp các gói tin tạm giữ trong buffer xuống Client - end

  // BKAV HaiHS : Hàm phụ đăng ký theo dõi kênh Redis phục vụ kết nối lại - start
  async #setupResumeSubscription(streamId, res, resumeState) {
    let unsubscribe;

    const handleTerminal = async (event) => {
      if (unsubscribe) await unsubscribe();
      if (resumeState.connectionIsOpen) {
        this.#writeSseDone(res, event);
        res.end();
        resumeState.connectionIsOpen = false;
      }
    };
    resumeState.handleTerminal = handleTerminal;

    unsubscribe = await redisStreamService.subscribeToChannel(
      streamId,
      this.#createPubSubHandler(resumeState),
    );

    res.on("close", async () => {
      resumeState.connectionIsOpen = false;
      if (unsubscribe) await unsubscribe();
    });

    return unsubscribe;
  }
  // BKAV HaiHS : Hàm phụ đăng ký theo dõi kênh Redis phục vụ kết nối lại - end

  // BKAV HaiHS : Hàm phụ đồng bộ lịch sử và xả buffer dồn tin nhắn reconnection - start
  async #syncHistoryAndReplayBuffer(streamId, res, resumeState, unsubscribe) {
    const historyEvents = await this.#fetchHistoryEvents(streamId);

    const isClosed = await this.#checkAndHandleEmptyHistory(
      streamId,
      historyEvents,
      resumeState.liveBuffer,
      unsubscribe,
      res,
    );
    if (isClosed) return true;

    const { chunks, fullText, doneEvent } =
      this.#processHistoryChunks(historyEvents);

    if (fullText && resumeState.connectionIsOpen) {
      this.#sendHistorySync(res, fullText, chunks.length);
    }

    if (doneEvent) {
      await resumeState.handleTerminal(doneEvent);
      return true;
    }

    resumeState.syncedSeq = chunks.length;

    return await this.#replayBufferedEvents(
      resumeState.liveBuffer,
      resumeState.syncedSeq,
      resumeState.handleTerminal,
      res,
    );
  }
  // BKAV HaiHS : Hàm phụ đồng bộ lịch sử và xả buffer dồn tin nhắn reconnection - end
}
// BKAV HaiHS : Định nghĩa lớp AIStreamManager quản lý điều phối luồng stream AI cục bộ và phân tán - end

module.exports = new AIStreamManager();

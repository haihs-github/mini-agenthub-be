// quản lý luồng stream chunk AI
const redisStreamService = require("./redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");
const { getEncoding } = require("js-tiktoken");
const tiktokenEncoder = getEncoding("cl100k_base");

// Cấu trúc: streamId -> { nextSeq, pending: Map<seq, event>, abortController, clientHandlers, ... }
const streams = new Map();

class AIStreamManager {
  constructor() {}

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

  async abortSession(streamId) {
    const state = streams.get(streamId);
    if (state) {
      state.abortController.abort();
    }
    await redisStreamService.publishAbort(streamId);
  }

  async isStreamActive(streamId) {
    return await redisStreamService.isStreamActive(streamId);
  }

  #countTokens(text) {
    if (!text) return 0;
    return tiktokenEncoder.encode(text).length;
  }

  #calculatePromptTokens(prompt, historyMessages) {
    let fullPromptText = prompt || "";
    if (Array.isArray(historyMessages)) {
      fullPromptText +=
        " " + historyMessages.map((m) => m.content || "").join(" ");
    }
    return this.#countTokens(fullPromptText) + 40;
  }

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

  #parseJsonContent(dataStr) {
    try {
      const parsed = JSON.parse(dataStr);
      return parsed.content || parsed.choices?.[0]?.delta?.content || "";
    } catch (e) {
      return "";
    }
  }

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

  #extractCleanTextFromChunk(chunkText, currentState) {
    let cleanText = "";
    const lines = chunkText.split("\n");
    for (const line of lines) {
      cleanText += this.#parseChunkLine(line, currentState);
    }
    return cleanText;
  }

  // --- 2. Format & Payload Helpers ---

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

  #writeSseDone(res, payloadSource) {
    const donePayload = this.#buildDonePayload(payloadSource);
    if (Object.keys(donePayload).length > 0) {
      res.write(`data: [DONE] ${JSON.stringify(donePayload)}\n\n`);
    } else {
      res.write("data: [DONE]\n\n");
    }
  }

  #sendSseEvent(res, event) {
    if (event.type === "chunk") {
      res.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
      return false;
    }
    if (event.type === "DONE") {
      this.#writeSseDone(res, event);
      res.end();
      return true;
    }
    if (event.type === "ERROR") {
      res.write(`data: ${JSON.stringify({ error: event.message })}\n\n`);
      res.end();
      return true;
    }
    return false;
  }

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

  // --- 3. Buffer & Dispatch Helpers ---

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

  async #processSingleChunk(
    streamId,
    cleanText,
    currentState,
    abortController,
  ) {
    if (!cleanText || !currentState || abortController.signal.aborted) return;

    const seq = currentState.producerSeq++;
    const event = { type: "chunk", seq, content: cleanText };

    currentState.fullText += cleanText;

    await redisStreamService.appendChunk(streamId, event);
    await redisStreamService.publishChunk(streamId, event);

    currentState.pending.set(seq, event);
    this.#flushPendingMessages(streamId);
  }

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

  // --- 4. Database & Error Helpers ---

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
        type: "DONE",
        isStopped: true,
        responseTime: currentState.responseTime || responseTime,
        usage,
      };
      this.#notifyLocalHandlers(currentState, doneEvent);
    }
  }

  async #handleStreamGeneralError(streamId, err) {
    const errorEvent = { type: "ERROR", message: err.message };
    await redisStreamService.publishChunk(streamId, errorEvent);
    this.#notifyLocalHandlers(streams.get(streamId), errorEvent);
  }

  async #finishBackgroundStreamSuccess(streamId) {
    const currentStateDone = streams.get(streamId);
    const { responseTime, usage } =
      this.#calculateUsageAndResponseTime(currentStateDone);

    const doneEvent = {
      type: "DONE",
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
          if (event.type === "ABORT") abortController.abort();
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
      await this.#cleanupStreamState(streamId, unsubscribeControl);
    }
  }

  // --- 5. Resume & Replay Helpers ---

  #createPubSubHandler(state) {
    return async (event) => {
      if (!state.connectionIsOpen) return;
      if (!state.isSynced) return state.liveBuffer.push(event);

      if (event.type === "DONE" || event.type === "ABORT") {
        return state.handleTerminal(event);
      }
      if (event.type === "chunk" && event.seq >= state.syncedSeq) {
        state.res.write(
          `data: ${JSON.stringify({ content: event.content })}\n\n`,
        );
      }
    };
  }

  async #fetchHistoryEvents(streamId) {
    try {
      return await redisStreamService.getChunks(streamId);
    } catch (e) {
      return [];
    }
  }

  #processHistoryChunks(historyEvents) {
    const chunks = historyEvents
      .filter((e) => e.type === "chunk")
      .sort((a, b) => a.seq - b.seq);

    return {
      chunks,
      fullText: chunks.map((e) => e.content).join(""),
      doneEvent: historyEvents.find((e) => e.type === "DONE"),
    };
  }

  #sendHistorySync(res, fullText, resumeFromSeq) {
    const payload = { sync: true, content: fullText, resumeFromSeq };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

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

  async #replayBufferedEvents(liveBuffer, syncedSeq, handleTerminal, res) {
    for (const event of liveBuffer) {
      if (event.type === "DONE" || event.type === "ABORT") {
        await handleTerminal(event);
        return true;
      }
      if (event.type === "chunk" && event.seq >= syncedSeq) {
        res.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
      }
    }
    return false;
  }

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
}

module.exports = new AIStreamManager();

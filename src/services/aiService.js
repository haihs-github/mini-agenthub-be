const axios = require("axios");
const fs = require("fs");
const { ProxyAgent, setGlobalDispatcher } = require("undici");
const { Readable } = require("stream");

const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { ChatGroq } = require("@langchain/groq");
const { AISERVICE } = require("../constants/aiServiceConst");
const { GROQ_CONFIG } = require("../constants/aiModel");

// BKAV HaiHS : Cấu hình Proxy toàn cục vượt tường lửa - start
if (process.env.HTTP_PROXY) {
  const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY });
  setGlobalDispatcher(proxyAgent);
}
// BKAV HaiHS : Cấu hình Proxy toàn cục vượt tường lửa - end

// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider - start
class AiService {
  // BKAV HaiHS : điều hướng xử lý dựa vào model name - start
  async generateStreamResponse(modelName, prompt, historyMessages, signal) {
    if (!modelName || modelName === "flowise") {
      return this.getFlowiseStream(prompt, historyMessages, signal);
    }
    return this.getLangChainStream(modelName, prompt, historyMessages, signal);
  }
  // BKAV HaiHS : điều hướng xử lý dựa vào model name - end

  // BKAV HaiHS : gọi model qua langchain - start
  async getLangChainStream(modelName, prompt, historyMessages, signal) {
    const chatModel = new ChatGroq({
      model: modelName,
      ...GROQ_CONFIG,
    });

    // Chuẩn hóa danh sách messages
    const formattedMessages = historyMessages.map((msg) =>
      this.#formatSingleMessage(msg),
    );

    // Thêm prompt hiện tại kèm ảnh đính kèm (nếu có ở tin nhắn cuối)
    const currentMsg = historyMessages[historyMessages.length - 1];
    const currentContent = this.#buildMessageContent(
      prompt,
      currentMsg?.attachments,
    );
    formattedMessages.push(new HumanMessage({ content: currentContent }));

    // Giới hạn 5 ảnh
    this.#limitHistoryImages(formattedMessages);

    const langchainStream = await chatModel.stream(formattedMessages, {
      signal,
    });

    return Readable.from(
      this.transformLangChainStream(langchainStream, prompt, historyMessages),
    );
  }
  // BKAV HaiHS : gọi model qua langchain - end

  // BKAV HaiHS : Biến đổi các chunk dữ liệu thô từ LangChain thành định dạng chuỗi chuẩn SSE - start
  async *transformLangChainStream(stream, prompt, historyMessages) {
    let usage = null;
    let fullContent = "";

    for await (const chunk of stream) {
      const extractedUsage = this.#extractUsageFromChunk(chunk);
      if (extractedUsage) usage = extractedUsage;

      const content = chunk.content || "";
      fullContent += content;

      yield `data: ${JSON.stringify({ content })}\n\n`;
    }

    // Bóc tách usage token (nếu có) bằng extractUsageFromChunk.
    if (!usage?.prompt_tokens) {
      const promptTokens = this.#estimatePromptTokens(prompt, historyMessages);
      const completionTokens = this.#estimateCompletionTokens(fullContent);
      usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };
    }

    yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
  }
  // BKAV HaiHS : Biến đổi các chunk dữ liệu thô từ LangChain thành định dạng chuỗi chuẩn SSE - end

  // BKAV HaiHS : gọi model qua flowise - start
  async getFlowiseStream(prompt, historyMessages, signal) {
    const response = await axios.post(
      process.env.FLOWISE_API_URL,
      { question: prompt, streaming: true },
      {
        responseType: "stream",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.FLOWISE_API_KEY && {
            Authorization: `Bearer ${process.env.FLOWISE_API_KEY}`,
          }),
        },
        signal,
      },
    );

    return Readable.from(
      this.transformFlowiseStream(response.data, prompt, historyMessages),
    );
  }
  // BKAV HaiHS : gọi model qua flowise - end

  // BKAV HaiHS : Đọc dữ liệu stream từ Flowise, cắt dòng và chuyển đổi sang chuẩn SSE thống nhất với LangChain - start
  async *transformFlowiseStream(streamData, prompt, historyMessages) {
    let buffer = "";
    let fullContent = "";

    for await (const chunk of streamData) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const text = this.#parseFlowiseTokenLine(line);
        if (!text) continue;

        fullContent += text;
        yield `data: ${JSON.stringify({ content: text })}\n\n`;
      }
    }

    const promptTokens = this.#estimatePromptTokens(prompt, historyMessages);
    const completionTokens = this.#estimateCompletionTokens(fullContent);
    const usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };

    yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
  }
  // BKAV HaiHS : Đọc dữ liệu stream từ Flowise, cắt dòng và chuyển đổi sang chuẩn SSE thống nhất với LangChain - end

  // BKAV HaiHS : Hàm phụ đếm ký tự từng ảnh hoặc text trong message - start
  #getItemLength(item) {
    if (item?.type === AISERVICE.ITEM_TYPES.TEXT) return item.text?.length || 0;
    if (item?.type === AISERVICE.ITEM_TYPES.IMAGE || item?.type === AISERVICE.ITEM_TYPES.IMAGE_URL)
      return AISERVICE.IMAGE_CHAR_EQUIVALENT;
    return 0;
  }
  // BKAV HaiHS : Hàm phụ đếm ký tự từng ảnh hoặc text trong message - end

  // BKAV HaiHS : Hàm phụ tính ký tự cho message - start
  #getMessageTextLength(msg) {
    const content = msg?.content;
    if (!content) return 0;
    if (typeof content === "string") return content.length;
    if (!Array.isArray(content)) return 0;

    return content.reduce(
      (total, item) => total + this.#getItemLength(item),
      0,
    );
  }
  // BKAV HaiHS : Hàm phụ tính ký tự cho message - end

  // BKAV HaiHS : Hàm phụ ước lượng prompt token - start
  #estimatePromptTokens(prompt, historyMessages) {
    let contextTextLength = 0;
    if (historyMessages && Array.isArray(historyMessages)) {
      contextTextLength = historyMessages
        .map((m) => this.#getMessageTextLength(m))
        .reduce((sum, len) => sum + len, 0);
    }
    const totalLength = contextTextLength + (prompt ? prompt.length : 0);
    return Math.round(totalLength / 3.5) + 35;
  }
  // BKAV HaiHS : Hàm phụ ước lượng prompt token - end

  // BKAV HaiHS : Hàm phụ ước tính số lượng token trả lời - start
  #estimateCompletionTokens(content) {
    if (!content) return 0;
    return Math.round(content.length / 4);
  }
  // BKAV HaiHS : Hàm phụ ước tính số lượng token trả lời - end

  // BKAV HaiHS : Hàm phụ đọc file và chuyển về Base64 - start
  #convertLocalFileToBase64(filePath, fileType) {
    const fileBuffer = fs.readFileSync(filePath);
    return `data:${fileType};base64,${fileBuffer.toString("base64")}`;
  }
  // BKAV HaiHS : Hàm phụ đọc file và chuyển về Base64 - end

  // BKAV HaiHS : Hàm phụ gộp tin nhắn và danh sách đính kèm theo chuẩn LangChain - start
  #buildMessageContent(text, attachments = []) {
    if (!attachments.length) return text;

    const images = attachments.map((att) => ({
      type: AISERVICE.ITEM_TYPES.IMAGE_URL,
      image_url: {
        url: this.#convertLocalFileToBase64(att.filePath, att.fileType),
      },
    }));

    return [{ type: AISERVICE.ITEM_TYPES.TEXT, text }, ...images];
  }
  // BKAV HaiHS : Hàm phụ gộp tin nhắn và danh sách đính kèm theo chuẩn LangChain - end

  // BKAV HaiHS : Hàm phụ chuyển tin nhắn thành object HumanMessage hoặc AIMessage - start
  #formatSingleMessage(msg) {
    const content = this.#buildMessageContent(msg.content, msg.attachments);
    return msg.role === "user"
      ? new HumanMessage({ content })
      : new AIMessage({ content });
  }
  // BKAV HaiHS : Hàm phụ chuyển tin nhắn thành object HumanMessage hoặc AIMessage - end

  // BKAV HaiHS : Hàm phụ khống chế số lượng ảnh tối đa gửi trong ngữ cảnh - start
  #limitHistoryImages(messages, maxImages = AISERVICE.MAX_ALLOWED_IMAGES) {
    let imageCount = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!Array.isArray(msg.content)) continue;

      msg.content = msg.content.filter((item) => {
        if (item.type !== AISERVICE.ITEM_TYPES.IMAGE_URL) return true;
        if (imageCount < maxImages) {
          imageCount++;
          return true;
        }
        return false;
      });
    }
  }
  // BKAV HaiHS : Hàm phụ khống chế số lượng ảnh tối đa gửi trong ngữ cảnh - end

  // BKAV HaiHS : Hàm phụ lấy token usage từ metadata của chunk cuối - start
  #extractUsageFromChunk(chunk) {
    const u = chunk.response_metadata?.usage || chunk.usage_metadata;
    if (!u) return null;

    return {
      prompt_tokens: u.prompt_tokens || u.input_tokens || 0,
      completion_tokens: u.completion_tokens || u.output_tokens || 0,
      total_tokens: u.total_tokens || 0,
    };
  }
  // BKAV HaiHS : Hàm phụ lấy token usage từ metadata của chunk cuối - end

  // BKAV HaiHS : Hàm phụ xử lý phân tách dòng dữ liệu từ Flowise SSE - start
  #parseFlowiseTokenLine(line) {
    const cleanedLine = line.trim();
    if (!cleanedLine) return null;

    const jsonStr = cleanedLine.startsWith("data:")
      ? cleanedLine.replace(/^data:\s*/, "")
      : cleanedLine;

    try {
      const parsed = JSON.parse(jsonStr);
      return parsed.event === "token" ? parsed.data || "" : null;
    } catch {
      return null;
    }
  }
  // BKAV HaiHS : Hàm phụ xử lý phân tách dòng dữ liệu từ Flowise SSE - end
}
// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider - end

module.exports = new AiService();

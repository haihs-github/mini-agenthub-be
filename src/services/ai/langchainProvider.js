const fs = require("fs");
const { Readable } = require("stream");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { ChatGroq } = require("@langchain/groq");
const { AISERVICE } = require("../../constants/aiServiceConst");
const { GROQ_CONFIG } = require("../../constants/aiModel");
const BaseProvider = require("./baseProvider");

// BKAV HaiHS : Lớp LangchainProvider xử lý giao tiếp qua Langchain với mô hình Groq - start
class LangchainProvider extends BaseProvider {
  constructor(modelName) {
    super();
    this.modelName = modelName;
  }

  // BKAV HaiHS : Thực thi gọi model qua Langchain ChatGroq và trả về stream SSE - start
  async generateStream(prompt, historyMessages, signal) {
    const chatModel = new ChatGroq({
      model: this.modelName,
      ...GROQ_CONFIG,
    });

    const formattedMessages = historyMessages.map(msg => this.#formatSingleMessage(msg));

    const currentMsg = historyMessages[historyMessages.length - 1];
    const currentContent = this.#buildMessageContent(prompt, currentMsg?.attachments);
    formattedMessages.push(new HumanMessage({ content: currentContent }));

    this.#limitHistoryImages(formattedMessages);

    const langchainStream = await chatModel.stream(formattedMessages, {
      signal,
    });

    return Readable.from(
      this.#transformLangChainStream(langchainStream, prompt, historyMessages),
    );
  }
  // BKAV HaiHS : Thực thi gọi model qua Langchain ChatGroq và trả về stream SSE - end

  // BKAV HaiHS : Biến đổi các chunk dữ liệu thô từ LangChain thành định dạng chuỗi chuẩn SSE - start
  async *#transformLangChainStream(stream, prompt, historyMessages) {
    let usage = null;
    let fullContent = "";

    for await (const chunk of stream) {
      const extractedUsage = this.#extractUsageFromChunk(chunk);
      if (extractedUsage) usage = extractedUsage;

      const content = chunk.content || "";
      fullContent += content;

      yield `data: ${JSON.stringify({ content })}\n\n`;
    }

    if (!usage?.prompt_tokens) {
      const promptTokens = this.estimatePromptTokens(prompt, historyMessages);
      const completionTokens = this.estimateCompletionTokens(fullContent);
      usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };
    }

    yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
  }
  // BKAV HaiHS : Biến đổi các chunk dữ liệu thô từ LangChain thành định dạng chuỗi chuẩn SSE - end

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
      image_url: { url: this.#convertLocalFileToBase64(att.filePath, att.fileType) },
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
}
// BKAV HaiHS : Lớp LangchainProvider xử lý giao tiếp qua Langchain với mô hình Groq - end

module.exports = LangchainProvider;

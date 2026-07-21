const axios = require("axios");
const fs = require("fs");
const { ProxyAgent, setGlobalDispatcher } = require("undici");
const { Readable } = require("stream");

const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { ChatGroq } = require("@langchain/groq");
const { AISERVICE } = require("../constants/AiServiceConst");
const { GROQ_CONFIG } = require("../constants/AiModel");

// BKAV HaiHS : Cấu hình Proxy toàn cục vượt tường lửa - start
if (process.env.HTTP_PROXY) {
  const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY });
  setGlobalDispatcher(proxyAgent);
}
// BKAV HaiHS : Cấu hình Proxy toàn cục vượt tường lửa - end

// BKAV HaiHS : Hàm helper đếm ký tự từng ảnh hoặc text trong message - start
function getItemLength(item) {
  if (item?.type === "text") return item.text?.length || 0;
  if (item?.type === "image" || item?.type === "image_url")
    return AISERVICE.IMAGE_CHAR_EQUIVALENT; // cố  định số token cho ảnh
  return 0;
}
// BKAV HaiHS : Hàm helper đếm ký tự từng ảnh hoặc text trong message - end

// BKAV HaiHS : Hàm tính ký tự cho message - start
function getMessageTextLength(msg) {
  const content = msg?.content;
  if (!content) return 0;
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;

  return content.reduce((total, item) => total + getItemLength(item), 0);
}
// BKAV HaiHS : Hàm tính ký tự cho message - end

// BKAV HaiHS : hàm ước lượng promt token - start
function estimatePromptTokens(prompt, historyMessages) {
  let contextTextLength = 0;
  if (historyMessages && Array.isArray(historyMessages)) {
    contextTextLength = historyMessages
      .map((m) => getMessageTextLength(m))
      .reduce((sum, len) => sum + len, 0);
  }
  const totalLength = contextTextLength + (prompt ? prompt.length : 0);
  // Ước tính: ~3.5 ký tự mỗi token và cộng thêm ~35 token boilerplate cho prompt hệ thống / mẫu chat
  return Math.round(totalLength / 3.5) + 35;
}
// BKAV HaiHS : hàm ước lượng promt token - end

// BKAV HaiHS : hàm ước tính số lượng token trả lời - start
function estimateCompletionTokens(content) {
  if (!content) return 0;
  return Math.round(content.length / 4); // lấy ký tự câu trả lời chia cho 4
}
// BKAV HaiHS : hàm ước tính số lượng token trả lời - end

// BKAV HaiHS: Hàm Đọc file và chuyển về Base64 - start
function convertLocalFileToBase64(filePath, fileType) {
  const fileBuffer = fs.readFileSync(filePath);
  return `data:${fileType};base64,${fileBuffer.toString("base64")}`;
}
// BKAV HaiHS: Hàm Đọc file và chuyển về Base64 - end

// BKAV HaiHS : gộp tin nhắn và danh sách đính kém theo chuẩn langchain - start
function buildMessageContent(text, attachments = []) {
  if (!attachments.length) return text;

  const images = attachments.map((att) => ({
    type: "image_url",
    image_url: { url: convertLocalFileToBase64(att.filePath, att.fileType) },
  }));

  return [{ type: "text", text }, ...images];
}
// BKAV HaiHS : gộp tin nhắn và danh sách đính kém theo chuẩn langchain - end

// BKAV HaiHS : Hàm chuyển tin nhắn thành obj HumanMessage hoặc AIMessage của LangChain - start
function formatSingleMessage(msg) {
  const content = buildMessageContent(msg.content, msg.attachments);
  return msg.role === "user"
    ? new HumanMessage({ content })
    : new AIMessage({ content });
}
// BKAV HaiHS : Hàm chuyển tin nhắn thành obj HumanMessage hoặc AIMessage của LangChain - end

// BKAV HaiHS : Hàm cố định số ảnh có thể gửi theo promt - start
function limitHistoryImages(
  messages,
  maxImages = AISERVICE.MAX_ALLOWED_IMAGES,
) {
  let imageCount = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) continue;

    msg.content = msg.content.filter((item) => {
      if (item.type !== "image_url") return true;
      if (imageCount < maxImages) {
        imageCount++;
        return true;
      }
      return false;
    });
  }
}
// BKAV HaiHS : Hàm cố định số ảnh có thể gửi theo promt - end

// BKAV HaiHS : Hàm lấy token usage từ chunk cuối - start
function extractUsageFromChunk(chunk) {
  const u = chunk.response_metadata?.usage || chunk.usage_metadata;
  if (!u) return null;

  return {
    prompt_tokens: u.prompt_tokens || u.input_tokens || 0,
    completion_tokens: u.completion_tokens || u.output_tokens || 0,
    total_tokens: u.total_tokens || 0,
  };
}
// BKAV HaiHS : Hàm lấy token usage từ chunk cuối - end

// BKAV HaiHS : Hàm helper xử lý chuỗi trả về từ Flowise SSE - start
function parseFlowiseTokenLine(line) {
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
// BKAV HaiHS : Hàm helper xử lý chuỗi trả về từ Flowise SSE - end

// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider
class AiService {
  // 1. điều hướng xử lý dựa vào model name
  async generateStreamResponse(modelName, prompt, historyMessages, signal) {
    if (!modelName || modelName === "flowise") {
      return this.getFlowiseStream(prompt, historyMessages, signal);
    }
    return this.getLangChainStream(modelName, prompt, historyMessages, signal);
  }

  // 2. gọi model qua langchain
  async getLangChainStream(modelName, prompt, historyMessages, signal) {
    const chatModel = new ChatGroq({
      model: modelName,
      ...GROQ_CONFIG,
    });

    // Chuẩn hóa danh sách messages
    const formattedMessages = historyMessages.map(formatSingleMessage);

    // Thêm prompt hiện tại kèm ảnh đính kèm (nếu có ở tin nhắn cuối)
    const currentMsg = historyMessages[historyMessages.length - 1];
    const currentContent = buildMessageContent(prompt, currentMsg?.attachments);
    formattedMessages.push(new HumanMessage({ content: currentContent }));

    // Giới hạn 5 ảnh
    limitHistoryImages(formattedMessages);

    const langchainStream = await chatModel.stream(formattedMessages, {
      signal,
    });

    return Readable.from(
      this.transformLangChainStream(langchainStream, prompt, historyMessages),
    );
  }

  // 3. Biến đổi các chunk dữ liệu thô từ LangChain thành định dạng chuỗi chuẩn SSE
  async *transformLangChainStream(stream, prompt, historyMessages) {
    let usage = null;
    let fullContent = "";

    for await (const chunk of stream) {
      const extractedUsage = extractUsageFromChunk(chunk);
      if (extractedUsage) usage = extractedUsage;

      const content = chunk.content || "";
      fullContent += content;

      yield `data: ${JSON.stringify({ content })}\n\n`;
    }

    // Bóc tách usage token (nếu có) bằng extractUsageFromChunk.
    if (!usage?.prompt_tokens) {
      const promptTokens = estimatePromptTokens(prompt, historyMessages);
      const completionTokens = estimateCompletionTokens(fullContent);
      usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };
    }

    yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
  }

  // 3. 2. gọi model qua flowise
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

  // Đọc dữ liệu stream từ Flowise, cắt dòng và chuyển đổi sang chuẩn SSE thống nhất với LangChain.
  async *transformFlowiseStream(streamData, prompt, historyMessages) {
    let buffer = "";
    let fullContent = "";

    for await (const chunk of streamData) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const text = parseFlowiseTokenLine(line);
        if (!text) continue;

        fullContent += text;
        yield `data: ${JSON.stringify({ content: text })}\n\n`;
      }
    }

    const promptTokens = estimatePromptTokens(prompt, historyMessages);
    const completionTokens = estimateCompletionTokens(fullContent);
    const usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };

    yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
  }
}
// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider - end

module.exports = new AiService();

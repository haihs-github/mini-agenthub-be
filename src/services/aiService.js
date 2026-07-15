const axios = require("axios");
const fs = require("fs");
const { ProxyAgent, setGlobalDispatcher } = require("undici");
const { Readable } = require("stream");

// 1. Nạp các thực thể Message chuẩn hóa và cấu hình Model từ LangChain
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { ChatGroq } = require("@langchain/groq");

// BKAV HaiHS : Cấu hình Proxy toàn cục vượt tường lửa - start
if (process.env.HTTP_PROXY) {
  const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY });
  setGlobalDispatcher(proxyAgent);
}
// BKAV HaiHS : Cấu hình Proxy toàn cục vượt tường lửa - end

// BKAV HaiHS : Các hàm ước lượng số lượng token cho prompt và completion - start
function getMessageTextLength(msg) {
  //
  if (!msg) return 0;
  if (typeof msg.content === "string") {
    return msg.content.length;
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text.length)
      .reduce((sum, len) => sum + len, 0);
  }
  return 0;
}

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

function estimateCompletionTokens(content) {
  if (!content) return 0;
  return Math.round(content.length / 4);
}
// BKAV HaiHS : Các hàm ước lượng số lượng token cho prompt và completion - end

class AiService {
  // BKAV HaiHS : Dieu huong luong stream AI theo tung loai model - start
  async generateStreamResponse(modelName, prompt, historyMessages, signal) {
    if (modelName === "flowise" || !modelName) {
      return await this.getFlowiseStream(prompt, historyMessages, signal);
    }

    return await this.getLangChainStream(
      modelName,
      prompt,
      historyMessages,
      signal,
    );
  }
  // BKAV HaiHS : Dieu huong luong stream AI theo tung loai model - end

  // BKAV HaiHS : lấy luồng steam từ langchain - start
  async getLangChainStream(modelName, prompt, historyMessages, signal) {
    // Khởi tạo các model LangChain với các tham số cần thiết
    const chatModel = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: modelName,
      temperature: 0.5,
    });

    const convertLocalFileToBase64 = (filePath, fileType) => {
      const fileBuffer = fs.readFileSync(filePath);
      return `data:${fileType};base64,${fileBuffer.toString("base64")}`;
    };

    // chuẩn hóa lịch sử chat sang định dạng message của langchain
    const formattedMessages = historyMessages.map((msg) => {
      // trường role để biết tin nhắn của user hay ai
      const isUser = msg.role === "user";

      // Nếu tin nhắn có ảnh đính kèm, chuyển đổi sang định dạng { type: "image_url", image_url: { url: "..." } }
      if (msg.attachments && msg.attachments.length > 0) {
        const contentArray = [{ type: "text", text: msg.content }];
        msg.attachments.forEach((att) => {
          contentArray.push({
            type: "image_url",
            image_url: {
              url: convertLocalFileToBase64(att.filePath, att.fileType),
            },
          });
        });
        // Trả về HumanMessage hoặc AIMessage
        return isUser
          ? new HumanMessage({ content: contentArray })
          : new AIMessage({ content: contentArray });
      }
      // trả về HumanMessage hoặc AIMessage
      return isUser
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content);
    });

    // xử lý câu hỏi hiện tại và ngữ cảnh
    const currentMessage = historyMessages[historyMessages.length - 1]; // Lấy tin nhắn cuối cùng trong lịch sử để làm ngữ cảnh
    let currentContent;

    //  lấy ảnh đính kèm làm ngữ cảnh
    if (
      currentMessage &&
      currentMessage.attachments &&
      currentMessage.attachments.length > 0
    ) {
      currentContent = [{ type: "text", text: prompt }];
      currentMessage.attachments.forEach((att) => {
        currentContent.push({
          type: "image_url",
          image_url: {
            url: convertLocalFileToBase64(att.filePath, att.fileType),
          },
        });
      });
    } else {
      currentContent = prompt;
    }

    // thêm câu hỏi hiện tại vào cuối mảng formattedMessages để gửi cho model
    formattedMessages.push(new HumanMessage({ content: currentContent }));

    // lấy tối đa 5 ảnh đính kèm gần nhất trong lịch sử
    const maxAllowedImages = 5;
    let totalDetectedImages = 0;
    for (let i = formattedMessages.length - 1; i >= 0; i--) {
      if (Array.isArray(formattedMessages[i].content)) {
        const optimizedContent = [];
        for (let j = formattedMessages[i].content.length - 1; j >= 0; j--) {
          const contentItem = formattedMessages[i].content[j];
          if (contentItem.type === "image_url") {
            if (totalDetectedImages < maxAllowedImages) {
              totalDetectedImages++;
              optimizedContent.unshift(contentItem);
            }
          } else {
            optimizedContent.unshift(contentItem);
          }
        }
        formattedMessages[i].content = optimizedContent;
      }
    }

    // Kích hoạt luồng stream từ langchains, signal để hủy nếu client ngắt kết nối
    const langchainStream = await chatModel.stream(formattedMessages, {
      signal,
    });

    // Biến đổi thành chuỗi văn bản SSE (String) thay vì để nguyên Object
    async function* transformLangChainStream() {
      let usage = null;
      let fullContent = "";

      for await (const chunk of langchainStream) {
        // Thu thập metadata về token usage nếu có trong chunk
        if (chunk.response_metadata?.usage) {
          const u = chunk.response_metadata.usage;
          usage = {
            prompt_tokens: u.prompt_tokens || u.input_tokens || 0,
            completion_tokens: u.completion_tokens || u.output_tokens || 0,
            total_tokens: u.total_tokens || 0,
          };
        } else if (chunk.usage_metadata) {
          const u = chunk.usage_metadata;
          usage = {
            prompt_tokens: u.input_tokens || 0,
            completion_tokens: u.output_tokens || 0,
            total_tokens: u.total_tokens || 0,
          };
        }

        const content = chunk.content || "";
        fullContent += content;

        // Điều chỉnh đầu ra theo chuẩn LangChain { content } - start
        const payload = {
          content: content,
        };
        yield `data: ${JSON.stringify(payload)}\n\n`;
      }

      // Dự phòng nếu không lấy được token từ API
      if (!usage || !usage.prompt_tokens) {
        const promptTokens = estimatePromptTokens(prompt, historyMessages);
        const completionTokens = estimateCompletionTokens(fullContent);
        usage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        };
      }

      yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`; // Chuỗi báo hiệu kết thúc luồng chuẩn quốc tế kèm token usage
    }

    return Readable.from(transformLangChainStream());
  }
  // BKAV HaiHS : lấy luồng steam từ langchain - end

  // BKAV HaiHS : lấy luồng stream từ Flowise - start
  async getFlowiseStream(prompt, historyMessages, signal) {
    const response = await axios.post(
      process.env.FLOWISE_API_URL,
      {
        question: prompt,
        streaming: true,
      },
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

    // Biến đổi thành chuỗi văn bản SSE (String) cho Flowise
    async function* transformFlowiseStream() {
      let buffer = "";
      let fullContent = "";

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine) continue;

          let jsonStr = cleanedLine;
          if (jsonStr.startsWith("data:")) {
            jsonStr = jsonStr.replace(/^data:\s*/, "");
          }

          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.event === "token") {
              const text = parsed.data || "";
              fullContent += text;
              // BKAV HaiHS : Điều chỉnh đầu ra Flowise theo chuẩn LangChain { content } - start
              const payload = {
                content: text,
              };
              // BKAV HaiHS : Điều chỉnh đầu ra Flowise theo chuẩn LangChain { content } - end
              yield `data: ${JSON.stringify(payload)}\n\n`;
            }
          } catch (e) {
            // Bỏ qua lỗi cú pháp dòng dở dang
          }
        }
      }

      // Ước tính token sử dụng cho Flowise
      const promptTokens = estimatePromptTokens(prompt, historyMessages);
      const completionTokens = estimateCompletionTokens(fullContent);
      const usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };

      yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
    }

    return Readable.from(transformFlowiseStream());
  }
  // BKAV HaiHS : lấy luồng stream từ Flowise - end
}

module.exports = new AiService();

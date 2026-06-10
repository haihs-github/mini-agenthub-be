const Groq = require("groq-sdk");
const axios = require("axios");
const fs = require("fs");
const { ProxyAgent, setGlobalDispatcher } = require("undici");

// BKAV HaiHS : Cấu hình Proxy toàn cục nếu biến môi trường HTTP_PROXY tồn tại - start
if (process.env.HTTP_PROXY) {
  const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY });
  setGlobalDispatcher(proxyAgent);
}
// BKAV HaiHS : Cấu hình Proxy toàn cục nếu biến môi trường HTTP_PROXY tồn tại - end

// BKAV HaiHS : Khởi tạo client Groq với API Key từ biến môi trường - start
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
// BKAV HaiHS : Khởi tạo client Groq với API Key từ biến môi trường - end

class AiService {
  /**
   * Hàm cốt lõi nhận diện Model và phân phối luồng Stream từ AI tương ứng
   * @param {string} modelName - Tên model người dùng chọn (ví dụ: llama3-8b-8192 hoặc flowise)
   * @param {string} prompt - Câu hỏi hiện tại của người dùng
   * @param {Array} historyMessages - Mảng lịch sử các tin nhắn cũ từ DB
   */
  // BKAV HaiHS : Hàm quyết định gọi Stream từ Flowise hay Groq dựa trên modelName - start
  async generateStreamResponse(modelName, prompt, historyMessages) {
    if (modelName === "flowise" || !modelName) {
      return await this.getFlowiseStream(prompt, historyMessages);
    }

    return await this.getGroqStream(modelName, prompt, historyMessages);
  }
  // BKAV HaiHS : Hàm quyết định gọi Stream từ Flowise hay Groq dựa trên modelName - end

  // BKAV HaiHS : Xử lý luồng Stream trực tiếp từ Groq SDK - start
  async getGroqStream(modelName, prompt, historyMessages) {
    const convertLocalFileToBase64 = (filePath, fileType) => {
      const fileBuffer = fs.readFileSync(filePath);
      return `data:${fileType};base64,${fileBuffer.toString("base64")}`;
    };

    // 1. Chuyển đổi lịch sử chat cũ sang cấu trúc Groq (Hỗ trợ cả các tin nhắn cũ có chứa ảnh)
    const formattedMessages = historyMessages.map((msg) => {
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
        return {
          role: msg.role === "user" ? "user" : "assistant",
          content: contentArray,
        };
      }
      return {
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      };
    });

    // 2. Xử lý câu hỏi hiện tại: Nếu có đính kèm ảnh mới, đóng gói dạng Đa phương thức (Multimodal)
    const currentMessage = historyMessages[historyMessages.length - 1];

    let currentContent;
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

    // 3. Đẩy câu hỏi hiện tại vào cuối mảng ngữ cảnh chat
    formattedMessages.push({
      role: "user",
      content: currentContent,
    });

    // BKAV HaiHS: Bộ lọc quét ngược mảng cấu trúc từ mới nhất về cũ nhất để ép khống chế tối đa 5 ảnh
    const maxAllowedImages = 5;
    let totalDetectedImages = 0;

    for (let i = formattedMessages.length - 1; i >= 0; i--) {
      if (Array.isArray(formattedMessages[i].content)) {
        const optimizedContent = [];

        // Quét ngược các phần tử content bên trong tin nhắn hiện tại để ưu tiên ảnh mới hơn
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

    // 4. Gọi API Groq với mô hình Vision bảo đảm payload an toàn không bao giờ vượt quá 5 ảnh
    return await groq.chat.completions.create({
      model: modelName,
      messages: formattedMessages,
      stream: true,
      temperature: 0.5,
    });
  }
  // BKAV HaiHS : Xử lý luồng Stream trực tiếp từ Groq SDK - end

  // BKAV HaiHS : Xử lý luồng Stream bằng cách bắn request sang Server Flowise - start
  async getFlowiseStream(prompt, historyMessages) {
    const chatHistory = historyMessages.map((msg) => ({
      role: msg.role === "user" ? "userMessage" : "apiMessage",
      message: msg.content,
    }));

    const response = await axios.post(
      process.env.FLOWISE_API_URL,
      {
        question: prompt,
        chatHistory: chatHistory,
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
      },
    );

    return response.data;
  }
  // BKAV HaiHS : Xử lý luồng Stream bằng cách bắn request sang Server Flowise - end
}

module.exports = new AiService();

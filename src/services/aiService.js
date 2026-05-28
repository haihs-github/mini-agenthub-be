const Groq = require("groq-sdk");
const axios = require("axios");
const { ProxyAgent, setGlobalDispatcher } = require("undici"); // <-- BÍ KÍP: Dùng undici cho Native Fetch

// BKAV HaiHS : Cấu hình Proxy toàn cục nếu biến môi trường HTTP_PROXY tồn tại - start
if (process.env.HTTP_PROXY) {
  // Tạo một Agent Proxy theo chuẩn undici để bọc lấy hàm fetch
  const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY });

  // Ép toàn bộ các lệnh gọi native fetch trong hệ thống phải đi qua đường ống này
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
    // KỊCH BẢN 1: Người dùng lựa chọn chạy qua Agent của Flowise
    if (modelName === "flowise" || !modelName) {
      return await this.getFlowiseStream(prompt, historyMessages);
    }

    // KỊCH BẢN 2: Người dùng gọi trực tiếp các LLM thuần tốc độ cao của Groq
    return await this.getGroqStream(modelName, prompt, historyMessages);
  }
  // BKAV HaiHS : Hàm quyết định gọi Stream từ Flowise hay Groq dựa trên modelName - end

  // BKAV HaiHS : Xử lý luồng Stream trực tiếp từ Groq SDK - start
  async getGroqStream(modelName, prompt, historyMessages) {
    // 1. Chuyển đổi định dạng tin nhắn từ DB Prisma thành cấu trúc chuẩn của Groq API
    const formattedMessages = historyMessages.map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // 2. Nạp câu hỏi hiện tại vào cuối mảng ngữ cảnh
    formattedMessages.push({
      role: "user",
      content: prompt,
    });

    // 3. Kích hoạt gọi Groq với chế độ stream: true
    return await groq.chat.completions.create({
      model: modelName,
      messages: formattedMessages,
      stream: true, // Ép Groq nhả chữ theo thời gian thực
      temperature: 0.7,
    });
  }
  // BKAV HaiHS : Xử lý luồng Stream trực tiếp từ Groq SDK - end

  // BKAV HaiHS : Xử lý luồng Stream bằng cách bắn request sang Server Flowise - start
  async getFlowiseStream(prompt, historyMessages) {
    // 1. Định dạng lịch sử chat theo chuẩn Flowise
    const chatHistory = historyMessages.map((msg) => ({
      role: msg.role === "user" ? "userMessage" : "apiMessage",
      message: msg.content,
    }));

    // 2. Bắn Request sang Flowise sử dụng Axios với cấu hình nhận luồng dữ liệu thô (stream)
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

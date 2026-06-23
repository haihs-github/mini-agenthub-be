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

class AiService {
  // BKAV HaiHS : Dieu huong luong stream AI theo tung loai model - start
  async generateStreamResponse(modelName, prompt, historyMessages, signal) {
    if (modelName === "flowise" || !modelName) {
      return await this.getFlowiseStream(prompt, historyMessages, signal);
    }

    return await this.getLangChainStream(modelName, prompt, historyMessages, signal);
  }
  // BKAV HaiHS : Dieu huong luong stream AI theo tung loai model - end

  // BKAV HaiHS : Lay luong stream tu LangChain va truyen tin hieu dung - start
  async getLangChainStream(modelName, prompt, historyMessages, signal) {
    // 1. KHỞI TẠO FACTORY MODEL
    const chatModel = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: modelName,
      temperature: 0.5,
    });

    const convertLocalFileToBase64 = (filePath, fileType) => {
      const fileBuffer = fs.readFileSync(filePath);
      return `data:${fileType};base64,${fileBuffer.toString("base64")}`;
    };

    // 2. CHUẨN HÓA LỊCH SỬ CHAT SANG ĐỐI TƯỢNG MESSAGE CỦA LANGCHAIN
    const formattedMessages = historyMessages.map((msg) => {
      const isUser = msg.role === "user";

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

        return isUser
          ? new HumanMessage({ content: contentArray })
          : new AIMessage({ content: contentArray });
      }

      return isUser
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content);
    });

    // 3. XỬ LÝ CÂU HỎI HIỆN TẠI VÀ ĐẨY VÀO CUỐI NGỮ CẢNH
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

    formattedMessages.push(new HumanMessage({ content: currentContent }));

    // 4. BỘ LỌC GIỚI HẠN TỐI ĐA 5 ẢNH
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

    // 5. KÍCH HOẠT LUỒNG STREAM TỪ LANGCHAIN
    const langchainStream = await chatModel.stream(formattedMessages, { signal });

    // 6. ĐÃ SỬA: Biến đổi thành chuỗi văn bản SSE (String) thay vì để nguyên Object
    async function* transformLangChainStream() {
      for await (const chunk of langchainStream) {
        const payload = {
          choices: [
            {
              delta: {
                content: chunk.content || "",
              },
            },
          ],
        };
        // 🌟 BÍ KÍP: Bắn về dạng string "data: {...}\n\n" đúng gu của res.write()
        yield `data: ${JSON.stringify(payload)}\n\n`;
      }
      yield `data: [DONE]\n\n`; // Chuỗi báo hiệu kết thúc luồng chuẩn quốc tế
    }

    return Readable.from(transformLangChainStream());
  }
  // BKAV HaiHS : Lay luong stream tu LangChain va truyen tin hieu dung - end

  // BKAV HaiHS : Lay luong stream tu Flowise va truyen tin hieu dung - start
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

    // ĐÃ SỬA: Biến đổi thành chuỗi văn bản SSE (String) cho Flowise
    async function* transformFlowiseStream() {
      let buffer = "";

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
              const payload = {
                choices: [
                  {
                    delta: {
                      content: parsed.data || "",
                    },
                  },
                ],
              };
              // 🌟 BÍ KÍP: Đồng bộ hóa Flowise về chung 1 định dạng chuỗi giống hệt Groq/LangChain
              yield `data: ${JSON.stringify(payload)}\n\n`;
            }
          } catch (e) {
            // Bỏ qua lỗi cú pháp dòng dở dang
          }
        }
      }
      yield `data: [DONE]\n\n`;
    }

    return Readable.from(transformFlowiseStream());
  }
  // BKAV HaiHS : Lay luong stream tu Flowise va truyen tin hieu dung - end
}

module.exports = new AiService();

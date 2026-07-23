const axios = require("axios");
const { Readable } = require("stream");
const BaseProvider = require("./baseProvider");

// BKAV HaiHS : Lớp FlowiseProvider xử lý gọi và biến đổi stream từ Flowise API - start
class FlowiseProvider extends BaseProvider {

  // BKAV HaiHS : Thực thi gọi API Flowise và trả về Readable stream SSE - start
  async generateStream(prompt, historyMessages, signal) {
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
      this.#transformFlowiseStream(response.data, prompt, historyMessages),
    );
  }
  // BKAV HaiHS : Thực thi gọi API Flowise và trả về Readable stream SSE - end

  // BKAV HaiHS : Đọc dữ liệu stream từ Flowise, cắt dòng và chuyển đổi sang chuẩn SSE - start
  async *#transformFlowiseStream(streamData, prompt, historyMessages) {
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

    const promptTokens = this.estimatePromptTokens(prompt, historyMessages);
    const completionTokens = this.estimateCompletionTokens(fullContent);
    const usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };

    yield `data: [DONE] ${JSON.stringify({ usage })}\n\n`;
  }
  // BKAV HaiHS : Đọc dữ liệu stream từ Flowise, cắt dòng và chuyển đổi sang chuẩn SSE - end

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
// BKAV HaiHS : Lớp FlowiseProvider xử lý gọi và biến đổi stream từ Flowise API - end

module.exports = FlowiseProvider;

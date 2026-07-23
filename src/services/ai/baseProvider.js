const { AISERVICE } = require("../../constants/aiServiceConst");

// BKAV HaiHS : Lớp BaseProvider định nghĩa cấu trúc chung và các hàm phụ trợ dùng chung cho các AI Adapter - start
class BaseProvider {
  
  // BKAV HaiHS : Hàm phụ ước lượng prompt token thô dựa trên độ dài ký tự - start
  estimatePromptTokens(prompt, historyMessages) {
    let contextTextLength = 0;
    if (historyMessages && Array.isArray(historyMessages)) {
      contextTextLength = historyMessages
        .map((m) => this.#getMessageTextLength(m))
        .reduce((sum, len) => sum + len, 0);
    }
    const totalLength = contextTextLength + (prompt ? prompt.length : 0);
    return Math.round(totalLength / 3.5) + 35;
  }
  // BKAV HaiHS : Hàm phụ ước lượng prompt token thô dựa trên độ dài ký tự - end

  // BKAV HaiHS : Hàm phụ ước tính số lượng token trả lời thô dựa trên độ dài ký tự - start
  estimateCompletionTokens(content) {
    if (!content) return 0;
    return Math.round(content.length / 4);
  }
  // BKAV HaiHS : Hàm phụ ước tính số lượng token trả lời thô dựa trên độ dài ký tự - end

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
}
// BKAV HaiHS : Lớp BaseProvider định nghĩa cấu trúc chung và các hàm phụ trợ dùng chung cho các AI Adapter - end

module.exports = BaseProvider;

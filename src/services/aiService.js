const AiProviderFactory = require("./ai/aiProviderFactory");

// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider - start
class AiService {
  // BKAV HaiHS : điều hướng xử lý dựa vào model name - start
  async generateStreamResponse(modelName, prompt, historyMessages, signal) {
    const provider = AiProviderFactory.getProvider(modelName);
    return await provider.generateStream(prompt, historyMessages, signal);
  }
  // BKAV HaiHS : điều hướng xử lý dựa vào model name - end
}
// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider - end

module.exports = new AiService();

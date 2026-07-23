const { ProxyAgent, setGlobalDispatcher } = require("undici");
const AiProviderFactory = require("./ai/aiProviderFactory");

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
    const provider = AiProviderFactory.getProvider(modelName);
    return await provider.generateStream(prompt, historyMessages, signal);
  }
  // BKAV HaiHS : điều hướng xử lý dựa vào model name - end
}
// BKAV HaiHS : Class chính chứa các phương thức quản lý giao tiếp với AI provider - end

module.exports = new AiService();

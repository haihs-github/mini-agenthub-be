const LangchainProvider = require("./langchainProvider");
const FlowiseProvider = require("./flowiseProvider");

// BKAV HaiHS : Lớp AiProviderFactory quyết định khởi tạo Adapter tương ứng với modelName - start
class AiProviderFactory {
  static getProvider(modelName) {
    switch (modelName) {
      case "":
      case null:
      case undefined:
      case "flowise":
        return new FlowiseProvider();
      default:
        return new LangchainProvider(modelName);
    }
  }
}
// BKAV HaiHS : Lớp AiProviderFactory quyết định khởi tạo Adapter tương ứng với modelName - end

module.exports = AiProviderFactory;

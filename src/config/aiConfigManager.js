const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// BKAV HaiHS : Bộ quản lý cấu hình AI load từ file YAML - start
class AiConfigManager {
  constructor() {
    this.configs = new Map();
    this.defaultModelId = "llama-3.3-70b-versatile";
    this.#loadConfigs();
  }

  // ==========================================
  // PUBLIC METHODS (Viết lên phía trên)
  // ==========================================

  // BKAV HaiHS : Trích xuất thông tin cấu hình của một model cụ thể - start
  getModelConfig(modelId) {
    const config = this.configs.get(modelId);
    if (!config) {
      return this.configs.get(this.defaultModelId) || {
        id: modelId,
        provider: "langchain",
        temperature: 0.5,
        system_prompt: "Bạn là một trợ lý AI hữu ích.",
        features: {
          supports_images: false,
          max_images: 0,
        },
      };
    }
    return config;
  }
  // BKAV HaiHS : Trích xuất thông tin cấu hình của một model cụ thể - end

  // ==========================================
  // PRIVATE METHODS (Viết xuống phía dưới)
  // ==========================================

  // BKAV HaiHS : Đọc và phân tích file YAML - start
  #loadConfigs() {
    try {
      const filePath = path.join(__dirname, "ai_models.yaml");
      if (!fs.existsSync(filePath)) {
        throw new Error(`Không tìm thấy file cấu hình YAML tại: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, "utf8");
      const data = yaml.load(fileContent);

      if (!data || !Array.isArray(data.models)) {
        throw new Error("Cấu trúc file YAML không hợp lệ, trường 'models' phải là mảng!");
      }

      for (const model of data.models) {
        this.#validateModelSchema(model);
        this.configs.set(model.id, model);
      }
    } catch (error) {
      console.error("[AiConfigManager Error] Không thể load cấu hình AI:", error.message);
      throw error;
    }
  }
  // BKAV HaiHS : Đọc và phân tích file YAML - end

  // BKAV HaiHS : Validate tính hợp lệ của từng bản ghi model trong YAML - start
  #validateModelSchema(model) {
    if (!model.id) {
      throw new Error("Thiếu thuộc tính 'id' bắt buộc cho model!");
    }
    if (!model.provider || !["langchain", "flowise"].includes(model.provider)) {
      throw new Error(`Model ${model.id} có 'provider' không hợp lệ (phải là langchain hoặc flowise)!`);
    }
    if (model.temperature === undefined || typeof model.temperature !== "number") {
      model.temperature = 0.5;
    }
    if (!model.features) {
      model.features = { supports_images: false, max_images: 0 };
    }
  }
  // BKAV HaiHS : Validate tính hợp lệ của từng bản ghi model trong YAML - end
}
// BKAV HaiHS : Bộ quản lý cấu hình AI load từ file YAML - end

module.exports = new AiConfigManager();

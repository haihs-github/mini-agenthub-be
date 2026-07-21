// BKAV HaiHS : Từ điển (Object) chứa cấu hình chung cố định cho Groq Model
const GROQ_CONFIG = {
  apiKey: process.env.GROQ_API_KEY,
  temperature: 0.5,
};

module.exports = {
  GROQ_CONFIG,
};

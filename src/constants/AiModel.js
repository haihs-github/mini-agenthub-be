const { ChatGroq } = require("@langchain/groq");

const createGroqModel = (modelName, options = {}) => {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: modelName,
    temperature: 0.5,
    ...options,
  });
};

module.exports = { createGroqModel };

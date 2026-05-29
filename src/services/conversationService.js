const conversationRepository = require("../repositories/conversationRepository");
const aiService = require("./aiService");
class ConversationService {
  // BKAV HaiHS : Logic tạo phòng - start
  async createConversation(userId, title) {
    const conversationData = {
      userId: parseInt(userId),
      title: title || "Cuộc hội thoại mới",
    };
    return await conversationRepository.create(conversationData);
  }
  // BKAV HaiHS : Logic tạo phòng - end

  // BKAV HaiHS : Logic lấy danh sách Lịch sử đoạn chat - start
  async getUserConversations(userId, page, limit) {
    const skip = (page - 1) * limit;
    const take = limit;

    const { conversations, total } =
      await conversationRepository.findAndCountAllByUser(userId, skip, take);
    const totalPages = Math.ceil(total / limit);

    return {
      conversations,
      pagination: { totalItems: total, totalPages, currentPage: page, limit },
    };
  }
  // BKAV HaiHS : Logic lấy danh sách Lịch sử đoạn chat - end

  // BKAV HaiHS : Logic lấy chi tiết khung chat - start
  async getConversationDetail(id, userId) {
    const conversation = await conversationRepository.findByIdAndUser(
      id,
      userId,
    );

    // Nếu phòng không tồn tại HOẶC của người khác, Repo trả về null -> Báo lỗi ngay
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    return conversation;
  }
  // BKAV HaiHS : Logic lấy chi tiết khung chat - end

  // BKAV HaiHS : Logic cập nhật tiêu đề phòng chat - start
  async updateConversationTitle(id, userId, title) {
    if (!title || title.trim() === "") {
      throw new Error("TITLE_REQUIRED");
    }

    const result = await conversationRepository.updateTitle(id, userId, title);

    // Nếu không có bản ghi nào bị ảnh hưởng -> báo lỗi ngay
    if (result.count === 0) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    return result;
  }
  // BKAV HaiHS : Logic cập nhật tiêu đề phòng chat - end

  // BKAV HaiHS : Logic xóa phòng chat - start
  async deleteConversation(id, userId) {
    const result = await conversationRepository.delete(id, userId);

    if (result.count === 0) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    return result;
  }
  // BKAV HaiHS : Logic xóa phòng chat - end

  // BKAV HaiHS : hàm chuẩn bị ngữ cảnh và gọi AI qua aiService - start
  async prepareChatStream(
    conversationId,
    userId,
    prompt,
    modelName,
    files = [],
  ) {
    // 1. Check chính chủ phòng chat
    const conversation = await conversationRepository.findByIdAndUser(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    // 2. Chuẩn hóa cấu trúc mảng ảnh đính kèm để nạp xuống DB
    const attachmentsData = files.map((file) => ({
      filePath: file.path, // Đường dẫn file lưu trên server (uploads/...)
      fileType: file.mimetype, // Định dạng ảnh (image/png...)
    }));

    // 3. Lưu câu hỏi của User VÀ danh sách ảnh vào DB
    await conversationRepository.createMessage(
      {
        role: "user",
        content: prompt,
        modelName: modelName,
        conversationId: parseInt(conversationId),
      },
      attachmentsData,
    );

    // 4. Lấy toàn bộ lịch sử bao gồm cả tin nhắn vừa tạo để làm ngữ cảnh đầy đủ gửi sang AiService
    const historyContext =
      await conversationRepository.getMessages(conversationId);

    // 5. Gọi sang tầng AI truyền đi
    return await aiService.generateStreamResponse(
      modelName,
      prompt,
      historyContext,
    );
  }
  // BKAV HaiHS : hàm chuẩn bị ngữ cảnh và gọi AI qua aiService - end

  // BKAV HaiHS : lưu câu trả lời của AI vào db - start
  async saveAssistantMessage(conversationId, content, modelName) {
    return await conversationRepository.createMessage({
      role: "assistant",
      content: content,
      modelName: modelName,
      conversationId: parseInt(conversationId),
    });
  }
  // BKAV HaiHS : lưu câu trả lời của AI vào db - end
}

module.exports = new ConversationService();

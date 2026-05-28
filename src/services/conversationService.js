const conversationRepository = require("../repositories/conversationRepository");

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
}

module.exports = new ConversationService();

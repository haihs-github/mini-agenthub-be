const conversationRepository = require("../repositories/conversationRepository");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");
const aiService = require("./aiService");

class ConversationService {
  // BKAV HaiHS : Logic tạo phòng - start
  async createConversation(userId, title) {
    // Tầng Controller đã bảo đảm userId là Int và title đã được trim + gán mặc định
    const conversationData = {
      userId,
      title,
    };
    return await conversationRepository.create(conversationData);
  }
  // BKAV HaiHS : Logic tạo phòng - end

  // BKAV HaiHS : Logic lấy danh sách Lịch sử đoạn chat - start
  async getUserConversations(userId, page, limit) {
    // page và limit đã được Controller đảm bảo lớn hơn hoặc bằng 1
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
  async getConversationDetail(id, userId, page, limit) {
    const skip = (page - 1) * limit;
    const take = limit;

    const conversation = await conversationRepository.findByIdAndUser(
      id,
      userId,
      skip,
      take,
    );

    if (!conversation) {
      throw new AppError(ERROR.CONVERSATION.NOT_FOUND);
    }

    // Vì DB trả về dạng tin nhắn mới nhất đứng đầu (do phục vụ phân trang),
    // ta đảo ngược lại mảng để tin nhắn cũ ở trên, tin nhắn mới ở dưới chuẩn giao diện chat
    conversation.messages.reverse();

    return conversation;
  }
  // BKAV HaiHS : Logic lấy chi tiết khung chat - end

  // BKAV HaiHS : Logic cập nhật tiêu đề phòng chat - start
  async updateConversationTitle(id, userId, title) {
    const result = await conversationRepository.updateTitle(id, userId, title);

    // KIỂM TRA NGHIỆP VỤ: Nếu count bằng 0 nghĩa là sai ID phòng hoặc người dùng cố tình can thiệp phòng người khác
    if (result.count === 0) {
      throw new AppError(ERROR.CONVERSATION.NOT_FOUND);
    }

    return result;
  }
  // BKAV HaiHS : Logic cập nhật tiêu đề phòng chat - end

  // BKAV HaiHS : Logic xóa phòng chat - start
  async deleteConversation(id, userId) {
    const result = await conversationRepository.delete(id, userId);

    if (result.count === 0) {
      throw new AppError("CONVERSATION_NOT_FOUND");
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
    // Kiểm tra quyền sở hữu phòng chat (Logic nghiệp vụ gác cổng tài nguyên)
    const conversation = await conversationRepository.findByIdAndUser(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new AppError(ERROR.CONVERSATION.NOT_FOUND);
    }

    // Chuyển đổi cấu trúc dữ liệu file mảng của Multer thành cấu trúc lưu trữ của schema DB
    const attachmentsData = files.map((file) => ({
      filePath: file.path,
      fileType: file.mimetype,
    }));

    // Ra lệnh cho Repository thực thi ghi nhận tin nhắn mới
    await conversationRepository.createMessage(
      {
        role: "user",
        content: prompt,
        modelName: modelName,
        conversationId, // Đã là số nguyên chuẩn từ Controller
      },
      attachmentsData,
    );

    // Thu thập toàn bộ lịch sử hội thoại để làm ngữ cảnh truyền đi
    const historyContext =
      await conversationRepository.getMessages(conversationId);

    // Bàn giao cho tầng dịch vụ AI xử lý kết nối máy chủ
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
      conversationId,
    });
  }
  // BKAV HaiHS : lưu câu trả lời của AI vào db - end

  // BKAV HaiHS : Logic xóa toàn bộ phòng chat chính chủ - start
  async clearAllConversations(userId) {
    // userId truyền xuống đây chắc chắn đã là số nguyên sạch từ Controller
    return await conversationRepository.deleteAllByUserId(userId);
  }
  // BKAV HaiHS : Logic xóa toàn bộ phòng chat chính chủ - end
}

module.exports = new ConversationService();

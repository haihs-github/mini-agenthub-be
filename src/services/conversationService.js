const conversationRepository = require("../repositories/conversationRepository");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");
const aiService = require("./aiService");

// BKAV HaiHS : Định nghĩa lớp ConversationService quản lý các logic nghiệp vụ liên quan đến hội thoại - start
class ConversationService {
  // BKAV HaiHS : Logic tạo phòng - start
  async createConversation(userId, title) {
    const conversationData = {
      userId,
      title,
    };
    return await conversationRepository.create(conversationData);
  }
  // BKAV HaiHS : Logic tạo phòng - end

  // BKAV HaiHS : Logic lấy danh sách Lịch sử đoạn chat - start
  async getUserConversations(userId, page, limit) {
    const skip = this.#calculatePaginationSkip(page, limit);
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
    const skip = this.#calculatePaginationSkip(page, limit);
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

    conversation.messages.reverse();

    return conversation;
  }
  // BKAV HaiHS : Logic lấy chi tiết khung chat - end

  // BKAV HaiHS : Logic cập nhật tiêu đề phòng chat - start
  async updateConversationTitle(id, userId, title) {
    const result = await conversationRepository.updateTitle(id, userId, title);

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

  // BKAV HaiHS : chuẩn bị ngữ cảnh và gọi aiService kèm tín hiệu abort - start
  async prepareChatStream(
    conversationId,
    userId,
    prompt,
    modelName,
    files = [],
    signal,
  ) {
    await this.#verifyConversationOwnership(conversationId, userId);

    const attachmentsData = this.#formatAttachments(files);

    await conversationRepository.createMessage(
      {
        role: "user",
        content: prompt,
        modelName: modelName,
        conversationId,
      },
      attachmentsData,
    );

    const historyContext =
      await conversationRepository.getMessages(conversationId);

    return await aiService.generateStreamResponse(
      modelName,
      prompt,
      historyContext,
      signal,
    );
  }
  // BKAV HaiHS : chuẩn bị ngữ cảnh và gọi aiService kèm tín hiệu abort - end

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
    return await conversationRepository.deleteAllByUserId(userId);
  }
  // BKAV HaiHS : Logic xóa toàn bộ phòng chat chính chủ - end

  // BKAV HaiHS : Hàm phụ tính toán số dòng cần bỏ qua khi phân trang - start
  #calculatePaginationSkip(page, limit) {
    return (page - 1) * limit;
  }
  // BKAV HaiHS : Hàm phụ tính toán số dòng cần bỏ qua khi phân trang - end

  // BKAV HaiHS : Hàm phụ ánh xạ mảng files của Multer thành cấu trúc đính kèm của DB - start
  #formatAttachments(files) {
    if (!files || !Array.isArray(files)) return [];
    return files.map((file) => ({
      filePath: file.path,
      fileType: file.mimetype,
    }));
  }
  // BKAV HaiHS : Hàm phụ ánh xạ mảng files của Multer thành cấu trúc đính kèm của DB - end

  // BKAV HaiHS : Hàm phụ kiểm tra quyền sở hữu phòng chat của user - start
  async #verifyConversationOwnership(conversationId, userId) {
    const conversation = await conversationRepository.findByIdAndUser(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new AppError(ERROR.CONVERSATION.NOT_FOUND);
    }
    return conversation;
  }
  // BKAV HaiHS : Hàm phụ kiểm tra quyền sở hữu phòng chat của user - end
}
// BKAV HaiHS : Định nghĩa lớp ConversationService quản lý các logic nghiệp vụ liên quan đến hội thoại - end

module.exports = new ConversationService();

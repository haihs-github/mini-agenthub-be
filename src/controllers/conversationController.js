// controller quản lý đoạn chat, kết nối đường truyền chat SSE, khôi phục và dừng stream

const conversationService = require("../services/conversationService");
const aiStreamManager = require("../services/aiStreamManager");
const redisStreamService = require("../services/redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");
const { MESSAGES } = require("../constants/messages");

// BKAV HaiHS : Định nghĩa lớp ConversationController điều phối nghiệp vụ phòng chat và SSE - start
class ConversationController {
  constructor() {
    this.createConversation = this.createConversation.bind(this);
    this.getMyConversations = this.getMyConversations.bind(this);
    this.getConversationDetail = this.getConversationDetail.bind(this);
    this.updateTitle = this.updateTitle.bind(this);
    this.deleteConversation = this.deleteConversation.bind(this);
    this.handleChat = this.handleChat.bind(this);
    this.handleStreamReconnect = this.handleStreamReconnect.bind(this);
    this.handleAbort = this.handleAbort.bind(this);
    this.handleStop = this.handleStop.bind(this);
    this.clearAllConversations = this.clearAllConversations.bind(this);
  }

  // BKAV HaiHS : Tạo một cuộc hội thoại mới - start
  async createConversation(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const title = req.body.title?.trim();

      const result = await conversationService.createConversation(
        userId,
        title,
      );

      res.status(201).json({
        message: MESSAGES.CONVERSATION.CREATED,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Tạo một cuộc hội thoại mới - end

  // BKAV HaiHS : Lấy danh sách các cuộc hội thoại theo userId - start
  async getMyConversations(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const { page: rawPage, limit: rawLimit } = req.query;

      const { page, limit } = this.#parsePagination(rawPage, rawLimit, 10);

      const result = await conversationService.getUserConversations(
        userId,
        page,
        limit,
      );

      res.status(200).json({
        message: MESSAGES.CONVERSATION.GET_LIST,
        data: result.conversations,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Lấy danh sách các cuộc hội thoại theo userId - end

  // BKAV HaiHS : Lấy lịch sử tin nhắn của một phòng chat theo conversationId - start
  async getConversationDetail(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const { page: rawPage, limit: rawLimit } = req.query;

      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      const { page, limit } = this.#parsePagination(rawPage, rawLimit, 20);

      const result = await conversationService.getConversationDetail(
        conversationId,
        userId,
        page,
        limit,
      );

      res.status(200).json({
        message: MESSAGES.CONVERSATION.GET_DETAIL,
        data: {
          ...result,
          isStreaming: await aiStreamManager.isStreamActive(conversationId),
        },
        pagination: {
          currentPage: page,
          limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Lấy lịch sử tin nhắn của một phòng chat theo conversationId - end

  // BKAV HaiHS : Cập nhật tiêu đề conversations - start
  async updateTitle(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const title = req.body.title?.trim();

      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      if (!title) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.EMPTY_TITLE });
      }

      await conversationService.updateConversationTitle(
        conversationId,
        userId,
        title,
      );

      res.status(200).json({
        message: MESSAGES.CONVERSATION.UPDATE_TITLE,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Cập nhật tiêu đề conversations - end

  // BKAV HaiHS : Xóa conversations - start
  async deleteConversation(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);

      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      await conversationService.deleteConversation(conversationId, userId);

      res.status(200).json({
        message: MESSAGES.CONVERSATION.DELETE,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Xóa conversations - end

  // BKAV HaiHS : luồng nhận chữ thời gian thực sse - start
  async handleChat(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const prompt = req.body.prompt?.trim();
      const { modelName } = req.body;
      const files = req.files || [];

      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      const payloadValidation = this.#validateChatPayload(prompt, modelName);
      if (!payloadValidation.valid) {
        return res.status(400).json({ message: payloadValidation.message });
      }

      if (await aiStreamManager.isStreamActive(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.ACTIVE_STREAM_ERROR });
      }

      const historyMessages =
        await conversationRepository.getMessages(conversationId);

      await aiStreamManager.startBackgroundStream(
        conversationId,
        (signal) =>
          conversationService.prepareChatStream(
            conversationId,
            userId,
            prompt,
            modelName,
            files,
            signal,
          ),
        modelName,
        prompt,
        historyMessages,
      );

      this.#setSSEHeaders(res);

      await aiStreamManager.connectClient(conversationId, res);
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : luồng nhận chữ thời gian thực sse - end

  // BKAV HaiHS : Kết nối lại vào luồng SSE đang chạy - start
  async handleStreamReconnect(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);

      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      this.#setSSEHeaders(res);

      await aiStreamManager.subscribeWithResume(conversationId, res);
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Kết nối lại vào luồng SSE đang chạy - end

  // BKAV HaiHS : Hủy bỏ luồng SSE của server vs fe, khi chuyển conversation, mất mạng, f5,... - start
  async handleAbort(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);
      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      await aiStreamManager.abortSession(conversationId);
      res.status(200).json({ message: MESSAGES.CONVERSATION.ABORT_SIGNAL });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Hủy bỏ luồng SSE của server vs fe, khi chuyển conversation, mất mạng, f5,... - end

  // BKAV HaiHS : Dừng luồng nhận dữ liệu từ ai (be) và lưu tin nhắn lại db khi người dùng ở fe bấm nút dừng - start
  async handleStop(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);
      if (!this.#validateConversationId(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      await aiStreamManager.abortSession(conversationId);
      res.status(200).json({ message: MESSAGES.CONVERSATION.ABORT_SIGNAL });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Dừng luồng nhận dữ liệu từ ai (be) và lưu tin nhắn lại db khi người dùng ở fe bấm nút dừng - end

  // BKAV HaiHS : Xóa toàn bộ lịch sử chat của chính mình - start
  async clearAllConversations(req, res, next) {
    try {
      const userId = parseInt(req.userId);

      if (isNaN(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      const result = await conversationService.clearAllConversations(userId);

      res.status(200).json({
        message: MESSAGES.CONVERSATION.CLEAR_ALL,
        data: {
          deletedCount: result.count,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Xóa toàn bộ lịch sử chat của chính mình - end

  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của conversation ID - start
  #validateConversationId(conversationId) {
    return !isNaN(conversationId);
  }
  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của conversation ID - end

  // BKAV HaiHS : Hàm phụ chuẩn hóa và ép kiểu phân trang - start
  #parsePagination(page, limit, defaultLimit) {
    let parsedPage = parseInt(page) || 1;
    let parsedLimit = parseInt(limit) || defaultLimit;

    if (parsedPage < 1) parsedPage = 1;
    if (parsedLimit < 1) parsedLimit = defaultLimit;

    return { page: parsedPage, limit: parsedLimit };
  }
  // BKAV HaiHS : Hàm phụ chuẩn hóa và ép kiểu phân trang - end

  // BKAV HaiHS : Hàm phụ cấu hình các Header chuẩn kết nối cho luồng SSE - start
  #setSSEHeaders(res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
  }
  // BKAV HaiHS : Hàm phụ cấu hình các Header chuẩn kết nối cho luồng SSE - end

  // BKAV HaiHS : Hàm phụ xác thực dữ liệu chat truyền lên - start
  #validateChatPayload(prompt, modelName) {
    if (!prompt) {
      return { valid: false, message: MESSAGES.CONVERSATION.EMPTY_PROMPT };
    }
    if (!modelName) {
      return { valid: false, message: MESSAGES.CONVERSATION.EMPTY_MODEL };
    }
    return { valid: true };
  }
  // BKAV HaiHS : Hàm phụ xác thực dữ liệu chat truyền lên - end
}
// BKAV HaiHS : Định nghĩa lớp ConversationController điều phối nghiệp vụ phòng chat và SSE - end

module.exports = new ConversationController();

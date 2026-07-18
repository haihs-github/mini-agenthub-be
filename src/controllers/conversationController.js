// controller quản lý đoạn chat, kết nối đường truyền chat SSE, khôi phục và dừng stream

const conversationService = require("../services/conversationService");
const aiStreamManager = require("../services/aiStreamManager");
const redisStreamService = require("../services/redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");
const { MESSAGES } = require("../constants/messages");

class ConversationController {
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
      let { page, limit } = req.query;

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;

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

  // BKAV HaiHS : Lấy lịch sử  tin nhắn của một phòng chat theo conversationId- start
  async getConversationDetail(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);

      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 20;

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;

      const result = await conversationService.getConversationDetail(
        conversationId,
        userId,
        page,
        limit,
      );

      // trả kết quả cho người dùng
      res.status(200).json({
        message: MESSAGES.CONVERSATION.GET_DETAIL,
        data: {
          ...result,
          isStreaming: await aiStreamManager.isStreamActive(conversationId),
        },
        pagination: {
          currentPage: page,
          limit: limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Lấy lịch sử  tin nhắn của một phòng chat theo conversationId- end

  // BKAV HaiHS : Cập nhật tiêu đề conversations - start
  async updateTitle(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const title = req.body.title?.trim();

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }
      // kiểm tra xem tiêu đề có bị trống không?
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
        message: "Cập nhật tiêu đề cuộc hội thoại thành công!",
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

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      await conversationService.deleteConversation(conversationId, userId);

      // trả lại kết quả cho người dùng
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
      // nhận dữ liệu từ rreq và chuẩn hóa
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const prompt = req.body.prompt?.trim();
      const { modelName } = req.body;
      const files = req.files || [];

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }
      if (!prompt) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.EMPTY_PROMPT });
      }
      if (!modelName) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.EMPTY_MODEL });
      }

      if (await aiStreamManager.isStreamActive(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.ACTIVE_STREAM_ERROR });
      }

      const historyMessages =
        await conversationRepository.getMessages(conversationId);

      // khởi tạo luồng SSE và bắt đầu xử lý chat
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

      // cấu hình header cho luồng SSE
      res.setHeader("Content-Type", "text/event-stream"); // dạng stream
      res.setHeader("Cache-Control", "no-cache"); // ko lưu cache
      res.setHeader("Connection", "keep-alive"); // giữ kết nối mở để nhận cá gói tin liên tục
      res.setHeader("X-Accel-Buffering", "no"); // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc

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

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }

      // cấu hình header cho luồng SSE
      res.setHeader("Content-Type", "text/event-stream"); // dạng stream
      res.setHeader("Cache-Control", "no-cache"); // ko lưu cache
      res.setHeader("Connection", "keep-alive"); // giữ kết nối mở để nhận cá gói tin liên tục
      res.setHeader("X-Accel-Buffering", "no"); // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc

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
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
      }
      // Gọi hàm abortSession để hủy bỏ luồng SSE đang chạy
      await aiStreamManager.abortSession(conversationId);
      res.status(200).json({ message: "Phát tín hiệu dừng luồng thành công!" });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Hủy bỏ luồng SSE của server vs fe, khi chuyển conversation, mất mạng, f5,... - end

  // BKAV HaiHS : Dừng luồng nhận dữ liệu từ ai (be) và lưu tin nhắn lại db khi người dùng ở fe bấm nút dừng- start
  async handleStop(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
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
  // BKAV HaiHS : Dừng luồng nhận dữ liệu từ ai (be) và lưu tin nhắn lại db khi người dùng ở fe bấm nút dừng- end

  // BKAV HaiHS : Xóa toàn bộ lịch sử chat của chính mình - start
  async clearAllConversations(req, res, next) {
    try {
      const userId = parseInt(req.userId);

      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: MESSAGES.CONVERSATION.INVALID_ID });
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
}

module.exports = new ConversationController();

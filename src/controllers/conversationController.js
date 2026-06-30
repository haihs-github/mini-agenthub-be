const conversationService = require("../services/conversationService");
const aiStreamManager = require("../services/aiStreamManager");
const redisStreamService = require("../services/redisStreamService");

class ConversationController {
  // BKAV HaiHS : Tạo một cuộc hội thoại mới trống cho người dùng - start
  async createConversation(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      // Chuẩn hóa dữ liệu ngay tại cửa Controller
      const title = req.body.title?.trim() || "Cuộc hội thoại mới";

      // Giao dữ liệu đã chuẩn hoàn toàn cho Service
      const result = await conversationService.createConversation(
        userId,
        title,
      );

      res.status(201).json({
        message: "Khởi tạo cuộc hội thoại mới thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Tạo một cuộc hội thoại mới trống cho người dùng - end

  // BKAV HaiHS : Lấy danh sách các cuộc hội thoại mà người dùng sở hữu - start
  async getMyConversations(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      let { page, limit } = req.query;

      // FIXME: [tienpv]: Thiếu kiểm tra giới hạn dưới của phân trang (page < 1, limit < 1)
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      // FIXED: HaiHS : kiểm tra giới hạn dưới - start
      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      // FIXED: HaiHS : kiểm tra giới hạn dưới - end

      const result = await conversationService.getUserConversations(
        userId,
        page,
        limit,
      );

      res.status(200).json({
        message: "Lấy danh sách cuộc hội thoại thành công!",
        data: result.conversations,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Lấy danh sách các cuộc hội thoại mà người dùng sở hữu - end

  // BKAV HaiHS : Lấy lịch sử  tin nhắn của một phòng chat cụ thể - start
  async getConversationDetail(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);

      // Đón nhận các param phân trang cho tin nhắn bên trong khung chat
      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 20; // Mặc định hiển thị 20 tin nhắn gần nhất mỗi lần load

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;

      // Truyền đầy đủ bộ tham số xuống tầng Service
      const result = await conversationService.getConversationDetail(
        conversationId,
        userId,
        page,
        limit,
      );

      res.status(200).json({
        message: "Lấy chi tiết cuộc hội thoại và lịch sử tin nhắn thành công!",
        data: {
          ...result,
          isStreaming: await aiStreamManager.isStreamActive(conversationId),
        },
        // Gửi kèm trạng thái phân trang tin nhắn hiện tại để FE biết đường gọi tiếp khi User cuộn chuột lên top
        pagination: {
          currentPage: page,
          limit: limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Lấy lịch sử  tin nhắn của một phòng chat cụ thể - end

  // BKAV HaiHS : Cập nhật tiêu đề conversations - start
  async updateTitle(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const title = req.body.title?.trim();

      // Validate chặt chẽ tính hợp lệ dữ liệu thô
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }
      if (!title) {
        return res
          .status(400)
          .json({ message: "Tiêu đề cuộc hội thoại không được để trống!" });
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
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      await conversationService.deleteConversation(conversationId, userId);

      res.status(200).json({
        message: "Xóa cuộc hội thoại thành công!",
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

      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }
      if (!prompt) {
        return res
          .status(400)
          .json({ message: "Nội dung câu hỏi không được để trống!" });
      }

      if (await aiStreamManager.isStreamActive(conversationId)) {
        return res
          .status(400)
          .json({ message: "Phòng chat đang có luồng xử lý hoạt động!" });
      }

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
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc - start
      res.setHeader("X-Accel-Buffering", "no");
      // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc - end

      await aiStreamManager.connectClient(conversationId, res);
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : luồng nhận chữ thời gian thực sse - end

  // BKAV HaiHS : Dang ky ket noi lai vao luong stream dang chay - start
  async handleStreamReconnect(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc - start
      res.setHeader("X-Accel-Buffering", "no");
      // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc - end

      // BKAV HaiHS : Ket noi lai theo quy trinh 3 buoc Subscribe-Query-Flush qua Redis - start
      await aiStreamManager.subscribeWithResume(conversationId, res);
      // BKAV HaiHS : Ket noi lai theo quy trinh 3 buoc Subscribe-Query-Flush qua Redis - end
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Dang ky ket noi lai vao luong stream dang chay - end

  // BKAV HaiHS : Huy bo luong AI va phat tin hieu ABORT cheo may chu qua Redis Pub/Sub - start
  async handleAbort(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      await aiStreamManager.abortSession(conversationId);
      res.status(200).json({ message: "Phát tín hiệu dừng luồng thành công!" });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Huy bo luong AI va phat tin hieu ABORT cheo may chu qua Redis Pub/Sub - end

  // BKAV HaiHS : Dung luong AI va luu tin nhan dang do vao DB - start
  async handleStop(req, res, next) {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      await aiStreamManager.abortSession(conversationId);
      res.status(200).json({ message: "Dừng luồng stream thành công!" });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Dung luong AI va luu tin nhan dang do vao DB - end

  // BKAV HaiHS : Xóa toàn bộ lịch sử chat của chính mình - start
  async clearAllConversations(req, res, next) {
    try {
      // Bốc danh tính trực tiếp từ Token bảo mật, chặn đứng nguy cơ hack xóa hộ
      const userId = parseInt(req.userId);

      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "Danh tính người dùng không hợp lệ!" });
      }

      // Bàn giao việc cho Service
      const result = await conversationService.clearAllConversations(userId);

      res.status(200).json({
        message: "Xóa toàn bộ lịch sử các cuộc hội thoại thành công!",
        data: {
          deletedCount: result.count, // Trả về số lượng phòng chat đã bị xóa sạch
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Xóa toàn bộ lịch sử chat của chính mình - end
}

module.exports = new ConversationController();

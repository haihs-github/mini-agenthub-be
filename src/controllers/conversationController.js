// controller quản lý đoạn chat, kết nối đường truyền chat SSE, khôi phục và dừng stream

const conversationService = require("../services/conversationService");
const aiStreamManager = require("../services/aiStreamManager");
const redisStreamService = require("../services/redisStreamService");
const conversationRepository = require("../repositories/conversationRepository");

class ConversationController {
  // BKAV HaiHS : Tạo một cuộc hội thoại mới - start
  async createConversation(req, res, next) {
    try {
      // lấy dữ liệu từ req, và chuẩn hóa dữ liệu
      const userId = parseInt(req.userId);
      const title = req.body.title?.trim() || "Cuộc hội thoại mới";

      // gửi dữ liệu cho hàm createConversation của lớp conversationService
      const result = await conversationService.createConversation(
        userId,
        title,
      );

      // trả về res cho người dùng
      res.status(201).json({
        message: "Khởi tạo cuộc hội thoại mới thành công!",
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
  // BKAV HaiHS : Lấy danh sách các cuộc hội thoại theo userId - end

  // BKAV HaiHS : Lấy lịch sử  tin nhắn của một phòng chat theo conversationId- start
  async getConversationDetail(req, res, next) {
    try {
      // lấy dữ liệu từ req, và chuẩn hóa dữ liệu
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);

      // Đón nhận các param phân trang cho tin nhắn bên trong khung chat
      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 20; // Mặc định hiển thị 20 tin nhắn gần nhất mỗi lần load

      //  kiểm tra xem conversationId có phải là số nguyên hợp lệ ko?
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;

      // Truyền dữ liệu xuống hàm getConversationDetail cho conversationService xử lý
      const result = await conversationService.getConversationDetail(
        conversationId,
        userId,
        page,
        limit,
      );

      // trả kết quả cho người dùng
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
  // BKAV HaiHS : Lấy lịch sử  tin nhắn của một phòng chat theo conversationId- end

  // BKAV HaiHS : Cập nhật tiêu đề conversations - start
  async updateTitle(req, res, next) {
    try {
      // lấy dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);
      const title = req.body.title?.trim();

      // kiểm tra conversatoinId có phải số nguyên không?
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }
      // kiểm tra xem tiêu đề có bị trống không?
      if (!title) {
        return res
          .status(400)
          .json({ message: "Tiêu đề cuộc hội thoại không được để trống!" });
      }
      // Chuyển dữ liệu xuống hàm updateConversationTitle của conversationService
      await conversationService.updateConversationTitle(
        conversationId,
        userId,
        title,
      );

      // trả kết quả về cho người dùng
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
      // nhận dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.userId);
      const conversationId = parseInt(req.params.id);

      // kiểm tra xem conversationId phải số nguyên ko?
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      //  chuyển dữ liệu xuồng hàm deleteConversation của conversationService để xử lý
      await conversationService.deleteConversation(conversationId, userId);

      // trả lại kết quả cho người dùng
      res.status(200).json({
        message: "Xóa cuộc hội thoại thành công!",
      });
    } catch (error) {
      // ném lỗi cho errorHandler xử lý
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

      // kiểm tra xem conversationId có phải số nguyên ko?
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }
      // kiểm tra xem prompt có bị trống không?
      if (!prompt) {
        return res
          .status(400)
          .json({ message: "Nội dung câu hỏi không được để trống!" });
      }
      //  kiểm tra xem modelName có bị trống không?
      if (!modelName) {
        return res
          .status(400)
          .json({ message: "Tên mô hình AI không được để trống!" });
      }

      // kiểm tra xem luồng SSE của conversation này đã chạy chưa? tránh trường hợp spam gửi yêu cầu tạo nhiều luồng chat
      if (await aiStreamManager.isStreamActive(conversationId)) {
        return res
          .status(400)
          .json({ message: "Phòng chat đang có luồng xử lý hoạt động!" });
      }

      // Lấy lịch sử tin nhắn để đếm prompt tokens chính xác
      const historyMessages = await conversationRepository.getMessages(conversationId);

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

      // gọi hàm connectClient để kết nối client với luồng SSE đang chạy
      await aiStreamManager.connectClient(conversationId, res);
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : luồng nhận chữ thời gian thực sse - end

  // BKAV HaiHS : Kết nối lại vào luồng SSE đang chạy - start
  async handleStreamReconnect(req, res, next) {
    try {
      // Lấy dữ liệu từ req và chuẩn hóa
      const conversationId = parseInt(req.params.id);

      // kiểm tra xem conversationId có phải số nguyên ko?
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      // cấu hình header cho luồng SSE
      res.setHeader("Content-Type", "text/event-stream"); // dạng stream
      res.setHeader("Cache-Control", "no-cache"); // ko lưu cache
      res.setHeader("Connection", "keep-alive"); // giữ kết nối mở để nhận cá gói tin liên tục
      res.setHeader("X-Accel-Buffering", "no"); // BKAV HaiHS : Tat buffering cua Nginx de SSE truyen ngay lap tuc

      // Kết nối lại client với luồng SSE đang chạy
      await aiStreamManager.subscribeWithResume(conversationId, res);
    } catch (error) {
      // Gửi lỗi cho middleware xử lý
      next(error);
    }
  }
  // BKAV HaiHS : Kết nối lại vào luồng SSE đang chạy - end

  // BKAV HaiHS : Hủy bỏ luồng SSE của server vs fe, khi chuyển conversation, mất mạng, f5,... - start
  async handleAbort(req, res, next) {
    try {
      // nhận dữ liệu từ req và chuẩn hóa
      const conversationId = parseInt(req.params.id);
      // kiểm tra xem conversationId có phải số nguyên ko?
      if (isNaN(conversationId)) {
        return res
          .status(400)
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
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
          .json({ message: "ID cuộc hội thoại phải là một số nguyên hợp lệ!" });
      }

      await aiStreamManager.abortSession(conversationId);
      res.status(200).json({ message: "Dừng luồng stream thành công!" });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Dừng luồng nhận dữ liệu từ ai (be) và lưu tin nhắn lại db khi người dùng ở fe bấm nút dừng- end

  // BKAV HaiHS : Xóa toàn bộ lịch sử chat của chính mình - start
  async clearAllConversations(req, res, next) {
    try {
      // lấy dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.userId);

      // kiểm tra xem userId có phải số nguyên ko?
      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "Danh tính người dùng không hợp lệ!" });
      }

      // Gọi hàm clearAllConversations của conversationService để xóa toàn bộ lịch sử chat của user
      const result = await conversationService.clearAllConversations(userId);

      // trả kết quả về cho người dùng
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

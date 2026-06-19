const conversationService = require("../services/conversationService");

class ConversationController {
  // BKAV HaiHS : controller Tạo phòng - start
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
  // BKAV HaiHS : controller Tạo phòng - end

  // BKAV HaiHS : controller Lấy lịch sử chat - start
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
  // BKAV HaiHS : controller Lấy lịch sử chat - end

  // BKAV HaiHS : controller Lấy chi tiết khung chat - start
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
        data: result,
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
  // BKAV HaiHS : controller Lấy chi tiết khung chat - end

  // BKAV HaiHS : controller Cập nhật tiêu đề conversations - start
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
  // BKAV HaiHS : controller Cập nhật tiêu đề conversations - end

  // BKAV HaiHS : controller Xóa conversations - start
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
  // BKAV HaiHS : controller Xóa conversations - end

  // BKAV HaiHS : controller Xử lý Chat - start
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

      // 1. Kích hoạt Stream dữ liệu sạch từ Service (Luôn trả về Readable Stream phát ra Chữ)
      const stream = await conversationService.prepareChatStream(
        conversationId,
        userId,
        prompt,
        modelName,
        files,
      );

      // 2. Thiết lập Header SSE chuẩn quốc tế cho Client lắng nghe
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullAIResponse = "";

      try {
        // 🌟 ĐỈNH CAO KIẾN TRÚC: Không cần if/else phân biệt Groq hay Flowise nữa!
        // Cả 2 vũ trụ giờ chạy chung 1 vòng lặp consume chữ duy nhất cực kỳ sạch sẽ.
        for await (const chunk of stream) {
          const content = chunk.toString(); // Chuyển đổi gói tin nhị phân thành chữ thuần túy
          if (content) {
            fullAIResponse += content;
            // Bắn dữ liệu về cho Frontend theo đúng cấu trúc sạch { content }
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        // 3. Sau khi luồng stream kết thúc an toàn, tiến hành lưu câu trả lời vào DB
        await conversationService.saveAssistantMessage(
          conversationId,
          fullAIResponse,
          modelName || "flowise",
        );

        // Phát gói tin kết thúc luồng cho FE đóng kết nối
        res.write(`data: [DONE]\n\n`);
      } catch (streamError) {
        console.error(
          "💥 Lỗi trong quá trình truyền luồng hoặc lưu DB:",
          streamError,
        );
        res.write(
          `data: ${JSON.stringify({ error: "Luồng xử lý dữ liệu AI gặp sự cố bấp bênh." })}\n\n`,
        );
      } finally {
        res.end(); // Bảo đảm đóng cổng kết nối HTTP an toàn
      }
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : controller Xử lý Chat - end

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

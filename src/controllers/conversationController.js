const conversationService = require("../services/conversationService");

class ConversationController {
  // BKAV HaiHS : controller Tạo phòng - start
  async createConversation(req, res, next) {
    try {
      const userId = req.userId;
      const { title } = req.body;
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
      const userId = req.userId; // Cứ lấy từ Token ra dùng, an toàn tuyệt đối
      let { page, limit } = req.query;

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

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

  // 3. BKAV HaiHS : controller Lấy chi tiết khung chat - start
  async getConversationDetail(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.userId; // Lấy ID chính mình để đối chiếu độc quyền

      const result = await conversationService.getConversationDetail(
        id,
        userId,
      );
      res.status(200).json({
        message: "Lấy chi tiết cuộc hội thoại thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // 3. BKAV HaiHS : controller Lấy chi tiết khung chat - start

  // BKAV HaiHS : controller Cập nhật tiêu đề conversations - start
  async updateTitle(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID conversations từ URL
      const userId = req.userId; // Lấy danh tính từ Token
      const { title } = req.body; // Lấy tiêu đề mới từ Body

      await conversationService.updateConversationTitle(id, userId, title);

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
      const { id } = req.params;
      const userId = req.userId;

      await conversationService.deleteConversation(id, userId);

      res.status(200).json({
        message: "Xóa cuộc hội thoại thành công!",
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : controller Xóa conversations - end

  // BKAV HaiHS : hàm lưu trữ tin nhắn - start
  async createMessage(messageData) {
    return await prisma.message.create({
      data: messageData,
    });
  }
  // BKAV HaiHS : hàm lưu trữ tin nhắn - end

  // BKAV HaiHS : hàm lấy lịch sử tin nhắn - start
  async getMessages(conversationId) {
    return await prisma.message.findMany({
      where: {
        conversationId: parseInt(conversationId),
      },
      orderBy: { createdAt: "asc" }, // Sắp xếp tin nhắn cũ trước, mới sau
    });
  }
  // BKAV HaiHS : hàm lấy lịch sử tin nhắn - end

  // BKAV HaiHS : controller Xử lý Chat - start
  async handleChat(req, res, next) {
    try {
      const { id } = req.params; // ID phòng chat
      const userId = req.userId; // Danh tính người chat từ Token
      const { prompt, modelName } = req.body; // Câu hỏi và Model AI lựa chọn

      if (!prompt || prompt.trim() === "") {
        return res
          .status(400)
          .json({ message: "Nội dung câu hỏi không được để trống!" });
      }

      // 1. Gọi Service chuẩn bị dữ liệu và kích hoạt Stream từ AI Provider
      const stream = await conversationService.prepareChatStream(
        id,
        userId,
        prompt,
        modelName,
      );

      // 2. THIẾT LẬP HEADER CHUẨN SSE (Mở đường ống sống phát trực tiếp dữ liệu)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullAIResponse = ""; // Biến gom toàn bộ chữ của AI để lưu DB khi kết thúc

      // 3. PHÂN LUỒNG XỬ LÝ STREAM THEO NHÀ CUNG CẤP (Groq Async Iterable vs Flowise Readable Stream)
      if (modelName !== "flowise" && modelName) {
        // --- KỊCH BẢN CHAT VỚI VŨ TRỤ GROQ ---
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullAIResponse += content;
            // Bắn gói tin về client theo đúng định dạng giao thức SSE: data: <chuỗi_json>\n\n
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        // Khi Groq nhả hết chữ thành công -> Tiến hành lưu câu trả lời hoàn chỉnh vào DB
        await conversationService.saveAssistantMessage(
          id,
          fullAIResponse,
          modelName,
        );

        // Bắn tín hiệu kết thúc luồng cho Client biết để dừng trạng thái loading
        res.write(`data: [DONE]\n\n`);
        res.end();
      } else {
        // --- KỊCH BẢN CHAT VỚI VŨ TRỤ FLOWISE ---
        // Vì Axios trả về một Node.js Readable Stream chuẩn, ta lắng nghe sự kiện 'data'
        stream.on("data", (chunk) => {
          const text = chunk.toString();
          fullAIResponse += text;

          // Chuyển tiếp (Forward) luồng stream nguyên bản của Flowise thẳng về cho Frontend
          res.write(chunk);
        });

        // Khi luồng Stream của Flowise chảy xong hoàn toàn
        stream.on("end", async () => {
          // Lưu câu trả lời của Agent vào DB
          await conversationService.saveAssistantMessage(
            id,
            fullAIResponse,
            "flowise",
          );
          res.end();
        });

        stream.on("error", (err) => {
          next(err);
        });
      }
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : controller Xử lý Chat - end
}

module.exports = new ConversationController();

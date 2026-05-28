const prisma = require("../models/prismaClient");

class ConversationRepository {
  // BKAV HaiHS : Tạo phòng chat mới - start
  async create(conversationData) {
    return await prisma.conversation.create({
      data: conversationData,
    });
  }
  // BKAV HaiHS : Tạo phòng chat mới - end

  // BKAV HaiHS : Lấy danh sách phòng chat của RIÊNG user này (Có phân trang) - start
  async findAndCountAllByUser(userId, skip, take) {
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          userId: parseInt(userId), // <--- CHỐT CHẶN: Chỉ lấy phòng của mình
        },
        skip: skip,
        take: take,
        orderBy: { updatedAt: "desc" }, // Cuộc trò chuyện mới nhất lên đầu sidebar
      }),
      prisma.conversation.count({
        where: { userId: parseInt(userId) },
      }),
    ]);

    return { conversations, total };
  }
  // BKAV HaiHS : Lấy danh sách phòng chat của RIÊNG user này (Có phân trang) - end

  // BKAV HaiHS : Lấy chi tiết phòng chat: BẮT BUỘC phải khớp cả ID phòng và ID người dùng - start
  async findByIdAndUser(id, userId) {
    return await prisma.conversation.findFirst({
      where: {
        id: parseInt(id),
        userId: parseInt(userId), // <--- CHỐT CHẶN: Thằng khác mò ID phòng cũng bằng thừa!
      },
      // Kéo luôn lịch sử tin nhắn cũ thuộc phòng này lên để đổ ra khung chat
      include: {
        messages: {
          orderBy: { createdAt: "asc" }, // Tin nhắn cũ ở trên, mới ở dưới
        },
      },
    });
  }
  // BKAV HaiHS : Lấy chi tiết phòng chat: BẮT BUỘC phải khớp cả ID phòng và ID người dùng - end

  //   BKAV HaiHS : Cập nhật tiêu đề phòng chat - start
  async updateTitle(id, userId, title) {
    return await prisma.conversation.updateMany({
      where: {
        id: parseInt(id),
        userId: parseInt(userId), // <--- Chỉ chính chủ mới được sửa
      },
      data: { title: title },
    });
  }
  //   BKAV HaiHS : Cập nhật tiêu đề phòng chat - end

  // BKAV HaiHS : Xóa phòng chat - start
  async delete(id, userId) {
    return await prisma.conversation.deleteMany({
      where: {
        id: parseInt(id),
        userId: parseInt(userId), // <--- Chỉ chính chủ mới được xóa
      },
    });
  }
  // BKAV HaiHS : Xóa phòng chat - end

  // BKAV HaiHS : Hàm lưu trữ tin nhắn - start
  async createMessage(messageData) {
    return await prisma.message.create({
      data: messageData,
    });
  }
  // BKAV HaiHS : Hàm lưu trữ tin nhắn - end

  // BKAV HaiHS : Hàm lấy lịch sử tin nhắn - start
  async getMessages(conversationId) {
    return await prisma.message.findMany({
      where: {
        conversationId: parseInt(conversationId),
      },
      orderBy: { createdAt: "asc" }, // Sắp xếp tin nhắn cũ trước, mới sau
    });
  }
  // BKAV HaiHS : Hàm lấy lịch sử tin nhắn - end
}

module.exports = new ConversationRepository();

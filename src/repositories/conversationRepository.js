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
          userId: parseInt(userId), //  Chỉ lấy phòng của mình
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
  // BKAV HaiHS : Lấy danh sách phòng chat của user này (Có phân trang) - end

  // BKAV HaiHS : Lấy chi tiết phòng chat - start
  async findByIdAndUser(id, userId, skip, take) {
    return await prisma.conversation.findFirst({
      where: {
        id: parseInt(id),
        userId: parseInt(userId),
      },
      include: {
        messages: {
          skip: skip,
          take: take,
          orderBy: { createdAt: "desc" }, // Lấy các tin nhắn mới nhất lùi dần về quá khứ
          include: {
            attachments: true, // CHỐT CHẶN: Kéo sạch danh sách ảnh đính kèm của tin nhắn này lên
          },
        },
      },
    });
  }
  // BKAV HaiHS : Lấy chi tiết phòng chat - end

  //   BKAV HaiHS : Cập nhật tiêu đề phòng chat - start
  async updateTitle(id, userId, title) {
    return await prisma.conversation.updateMany({
      where: {
        id: parseInt(id),
        userId: parseInt(userId), // Chỉ chính chủ mới được sửa
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
        userId: parseInt(userId), // Chỉ chính chủ mới được xóa
      },
    });
  }
  // BKAV HaiHS : Xóa phòng chat - end

  // BKAV HaiHS : Hàm lưu trữ tin nhắn - start
  async createMessage(messageData, attachments = []) {
    return await prisma.message.create({
      data: {
        ...messageData,
        attachments: {
          create: attachments,
        },
      },
      include: { attachments: true },
    });
  }
  // BKAV HaiHS : Hàm lưu trữ tin nhắn - end

  // BKAV HaiHS : Hàm lấy lịch sử tin nhắn - start
  async getMessages(conversationId) {
    return await prisma.message.findMany({
      where: { conversationId: parseInt(conversationId) },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });
  }
  // BKAV HaiHS : Hàm lấy lịch sử tin nhắn - end

  // BKAV HaiHS : Hàm xóa toàn bộ lịch sử của 1 user - start
  async deleteAllByUserId(userId) {
    return await prisma.conversation.deleteMany({
      where: {
        userId: userId,
      },
    });
  }
  // BKAV HaiHS : Hàm xóa toàn bộ lịch sử của 1 user - end
}

module.exports = new ConversationRepository();

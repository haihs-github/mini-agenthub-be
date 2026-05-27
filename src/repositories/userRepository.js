const prisma = require("../models/prismaClient");

class UserRepository {
  //  BKAV HaiHS : tìm kiếm người dùng theo email - start
  async findByEmail(email) {
    return await prisma.user.findUnique({
      where: { email: email },
      include: { groups: true },
    });
  }
  //  BKAV HaiHS : tìm kiếm người dùng theo email - end

  //   BKAV HaiHS : tạo người dùng mới - start
  async create(userData) {
    return await prisma.user.create({
      data: userData,
      include: {
        groups: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
  //   BKAV HaiHS : tạo người dùng mới - end

  // BKAV HaiHS : Tìm người dùng theo ID - start
  async findById(id) {
    return await prisma.user.findUnique({
      where: { id: id },
    });
  }
  // BKAV HaiHS : Tìm người dùng theo ID - end

  // BKAV HaiHS : Cập nhật mật khẩu mới vào DB - start
  async updatePassword(id, newHashedPassword) {
    return await prisma.user.update({
      where: { id: id },
      data: { password: newHashedPassword },
    });
  }
  // BKAV HaiHS : Cập nhật mật khẩu mới vào DB - end
}

module.exports = new UserRepository();

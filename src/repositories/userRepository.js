const prisma = require('../models/prismaClient');

class UserRepository {
//  BKAV HaiHS : tìm kiếm người dùng theo email - start
  async findByEmail(email) {
    return await prisma.user.findUnique({
      where: { email: email },
      include: { groups: true }
    });
  }
  //  BKAV HaiHS : tìm kiếm người dùng theo email - end

//   BKAV HaiHS : tạo người dùng mới - start
  async create(userData) {
    return await prisma.user.create({
      data: userData
    });
  }
//   BKAV HaiHS : tạo người dùng mới - end
}

module.exports = new UserRepository();
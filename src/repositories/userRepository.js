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

  // BKAV HaiHS : Tìm người dùng theo ID kèm theo nhóm và quyền của nhóm - start
  async findByIdWithGroups(id) {
    return await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        groups: {
          select: { permissions: true },
        },
      },
    });
  }
  // BKAV HaiHS : Tìm người dùng theo ID kèm theo nhóm và quyền của nhóm - end

  // BKAV HaiHS : tìm kiếm và phân trang người dùng - start
  async findAndCountAll({ skip, take, search }) {
    // Xây dựng điều kiện tìm kiếm động (Tìm theo Tên hoặc Email) Mode 'insensitive' là không phân biệt hoa thường
    const where = search
      ? {
          OR: [
            { fullname: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // Chạy song song cả 2 tác vụ để tối ưu tốc độ Database
    const [users, totalItems] = await prisma.$transaction([
      prisma.user.findMany({
        where: where,
        skip: parseInt(skip),
        take: parseInt(take),
        include: {
          groups: {
            select: { id: true, name: true }, // Lấy kèm thông tin nhóm để biết user thuộc nhóm nào
          },
        },
        orderBy: { id: "asc" }, // Sắp xếp theo ID tăng dần
      }),
      prisma.user.count({ where: where }), // Đếm tổng số bản ghi khớp điều kiện
    ]);

    return { users, totalItems };
  }
  // BKAV HaiHS : tìm kiếm và phân trang người dùng - end
}

module.exports = new UserRepository();

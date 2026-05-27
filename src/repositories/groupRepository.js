const prisma = require("../models/prismaClient");

class GroupRepository {
  // BKAV HaiHS : Tìm kiếm nhóm theo tên - start
  async findByName(name) {
    return await prisma.group.findUnique({
      where: { name: name },
    });
  }
  // BKAV HaiHS : Tìm kiếm nhóm theo tên - end

  // BKAV HaiHS :Lưu nhóm mới vào Database - start
  async create(groupData) {
    return await prisma.group.create({
      data: groupData,
      include: {
        users: {
          select: {
            id: true,
            email: true,
            fullname: true,
          },
        },
      },
    });
  }
  // BKAV HaiHS :Lưu nhóm mới vào Database - end

  // BKAV HaiHS : Tìm nhóm theo ID - start
  async findById(id) {
    return await prisma.group.findUnique({
      where: { id: parseInt(id) }, // Ép kiểu về số nguyên vì id trong DB là Int
    });
  }
  // BKAV HaiHS : Tìm nhóm theo ID - end

  // BKAV HaiHS : Cập nhật nhóm - start
  async update(id, updateData) {
    return await prisma.group.update({
      where: { id: parseInt(id) },
      data: updateData, // Sẽ nhận vào { name } hoặc { permissions } hoặc cả hai
    });
  }
  // BKAV HaiHS : Cập nhật nhóm - end

  // BKAV HaiHS : Thêm người dùng vào nhóm - start
  async addUsersToGroup(groupId, userIds) {
    return await prisma.group.update({
      where: { id: parseInt(groupId) },
      data: {
        users: {
          // Biến mảng số [2, 3, 4] thành dạng [{ id: 2 }, { id: 3 }, { id: 4 }] đúng chuẩn Prisma
          connect: userIds.map((id) => ({ id: parseInt(id) })),
        },
      },
      // Yêu cầu trả về kèm theo danh sách thành viên sau khi cập nhật để kiểm tra
      include: {
        users: {
          select: { id: true, email: true }, // Chỉ lấy id và email, không lấy password bảo mật
        },
      },
    });
  }
  // BKAV HaiHS : Thêm người dùng vào nhóm - end

  // BKAV HaiHS : Xóa nhóm - start
  async delete(id) {
    return await prisma.group.delete({
      where: { id: parseInt(id) },
    });
  }
  // BKAV HaiHS : Xóa nhóm - end

  // BKAV HaiHS : Xóa người dùng khỏi nhóm - start
  async removeUsersFromGroup(groupId, userIds) {
    return await prisma.group.update({
      where: { id: parseInt(groupId) },
      data: {
        users: {
          // Cắt đứt liên kết với mảng ID người dùng truyền lên
          disconnect: userIds.map((id) => ({ id: parseInt(id) })),
        },
      },
      // Trả về danh sách thành viên còn lại trong nhóm sau khi xóa để tiện kiểm tra
      include: {
        users: {
          select: { id: true, email: true, fullname: true },
        },
      },
    });
  }
  // BKAV HaiHS : Xóa người dùng khỏi nhóm - end

  // BKAV HaiHS : Lấy danh sách nhóm có phân trang - start
  async findAndCountAll(skip, take) {
    // Sử dụng Promise.all để chạy đồng thời cả 2 câu lệnh dưới DB, giúp tối ưu tốc độ
    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        skip: skip,
        take: take,
        orderBy: { id: "asc" }, // Sắp xếp theo ID tăng dần cho gọn gàng
        // Thêm phần này để đếm xem nhóm có bao nhiêu thành viên (rất hữu ích cho Frontend)
        include: {
          _count: {
            select: { users: true },
          },
        },
      }),
      prisma.group.count(), // Đếm tổng số bản ghi Group trong DB
    ]);

    return { groups, total };
  }
  // BKAV HaiHS : Lấy danh sách nhóm có phân trang - end
}

module.exports = new GroupRepository();

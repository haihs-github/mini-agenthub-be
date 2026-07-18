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
      where: { id: parseInt(id) },
    });
  }
  // BKAV HaiHS : Tìm nhóm theo ID - end

  // BKAV HaiHS : Cập nhật nhóm - start
  async update(id, updateData) {
    return await prisma.group.update({
      where: { id: parseInt(id) },
      data: updateData,
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
      include: {
        users: {
          select: { id: true, email: true },
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
        orderBy: [{ name: "asc" }, { id: "asc" }],
        include: {
          _count: {
            select: { users: true },
          },
        },
      }),
      prisma.group.count(),
    ]);

    return { groups, total };
  }
  // BKAV HaiHS : Lấy danh sách nhóm có phân trang - end

  // BKAV HaiHS : Lấy thông tin chi tiết nhóm kèm danh sách thành viên - start
  async findByIdWithUsers(id) {
    return await prisma.group.findUnique({
      where: { id: parseInt(id) },
      // Kéo thêm danh sách thành viên thuộc nhóm này
      include: {
        users: {
          select: {
            id: true,
            email: true,
            fullname: true, // Chỉ lấy các thông tin cần thiết, bỏ qua password
          },
        },
      },
    });
  }
  // BKAV HaiHS : Lấy thông tin chi tiết nhóm kèm danh sách thành viên - end

  // BKAV HaiHS : Tìm kiếm nhóm và đếm tổng số bản ghi - start
  async searchAndCount({ keyword, skip, take }) {
    const where = keyword
      ? {
          name: {
            contains: keyword,
            mode: "insensitive",
          },
        }
      : {};

    // Lấy toàn bộ các nhóm khớp để sắp xếp độ liên quan ở RAM
    const allMatchingGroups = await prisma.group.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    let sortedGroups = allMatchingGroups;

    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      sortedGroups = [...allMatchingGroups].sort((a, b) => {
        const indexA = a.name.toLowerCase().indexOf(lowerKeyword);
        const indexB = b.name.toLowerCase().indexOf(lowerKeyword);

        // Ưu tiên vị trí xuất hiện của từ khóa sớm hơn (ví dụ: 'group 1' có 'r' ở vị trí 1 tốt hơn 'Hỗ trợ' có 'r' ở vị trí 7)
        if (indexA !== indexB) {
          return indexA - indexB;
        }

        // Nếu cùng vị trí, sắp xếp theo bảng chữ cái tiếng Việt
        return a.name.localeCompare(b.name, "vi");
      });
    }

    const total = sortedGroups.length;
    const paginatedGroups = sortedGroups.slice(skip, skip + take);

    return { groups: paginatedGroups, total };
  }
  // BKAV HaiHS : Tìm kiếm nhóm và đếm tổng số bản ghi - end
}

module.exports = new GroupRepository();

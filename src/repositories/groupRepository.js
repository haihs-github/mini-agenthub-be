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

  // BKAV HaiHS : Cập nhật mảng quyền mới cho nhóm - start
  async updatePermissions(id, permissions) {
    return await prisma.group.update({
      where: { id: parseInt(id) },
      data: { permissions: permissions },
    });
  }
  // BKAV HaiHS : Cập nhật mảng quyền mới cho nhóm - end
}

module.exports = new GroupRepository();

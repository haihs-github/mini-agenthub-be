const groupRepository = require("../repositories/groupRepository");

class GroupService {
  // BKAV HaiHS : sử lý tạo nhóm mới - start
  async createGroup(name, permissions) {
    // 1. Kiểm tra xem tên nhóm đã tồn tại chưa
    const existingGroup = await groupRepository.findByName(name);
    if (existingGroup) {
      throw new Error("GROUP_ALREADY_EXISTS");
    }

    // 2. Gọi Repo để lưu vào Database
    const newGroup = await groupRepository.create({
      name: name,
      permissions: permissions || [], // Nếu không truyền quyền thì mặc định là mảng rỗng
    });

    return newGroup;
  }
  // BKAV HaiHS : sử lý tạo nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật quyền cho nhóm - start
  async updateGroupPermissions(groupId, permissions) {
    // 1. Kiểm tra xem nhóm có tồn tại trong hệ thống không
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    // 2. Gọi Repo để cập nhật mảng quyền mới
    const updatedGroup = await groupRepository.updatePermissions(
      groupId,
      permissions,
    );
    return updatedGroup;
  }
  //   BKAV HaiHS : xử lý cập nhật quyền cho nhóm - end
}

module.exports = new GroupService();

const groupRepository = require("../repositories/groupRepository");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");
class GroupService {
  // BKAV HaiHS : xử lý tạo nhóm mới - start
  async createGroup(name, permissions = [], userIds = []) {
    // 1. KIỂM TRA NGHIỆP VỤ: Tên nhóm là duy nhất dưới DB
    const existingGroup = await groupRepository.findByName(name);
    if (existingGroup) {
      throw new AppError(ERROR.GROUP.ALREADY_EXISTS);
    }

    const groupData = {
      name,
      permissions,
    };

    // 2. Gán user vào nhóm (userIds xuống đây chắc chắn đã là mảng số nguyên sạch)
    if (userIds.length > 0) {
      groupData.users = {
        // Không cần parseInt() lại nữa vì Controller đã lo việc này
        connect: userIds.map((id) => ({ id })),
      };
    }

    return await groupRepository.create(groupData);
  }
  // BKAV HaiHS : xử lý tạo nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(groupId, name, permissions) {
    // 1. KIỂM TRA NGHIỆP VỤ: Nhóm phải tồn tại thật trong hệ thống
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    const updateData = {};

    // 2. Logic kiểm tra trùng tên nhóm khi có sự thay đổi tên
    if (name && name !== group.name) {
      const existingGroup = await groupRepository.findByName(name);
      if (existingGroup) {
        throw new AppError(ERROR.GROUP.ALREADY_EXISTS);
      }
      updateData.name = name;
    }

    // Đã bỏ hoàn toàn logic check Array.isArray vì Controller mới đã gác cổng nghiêm ngặt
    if (permissions) {
      updateData.permissions = permissions;
    }

    return await groupRepository.update(groupId, updateData);
  }
  //   BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsersToGroup(groupId, userIds) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.ALREADY_EXISTS);
    }

    // Bỏ check trống mảng vì Controller đã chặn từ xa
    return await groupRepository.addUsersToGroup(groupId, userIds);
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end

  // BKAV HaiHS : xử lý xóa nhóm - start
  async deleteGroup(groupId) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    return await groupRepository.delete(groupId);
  }
  // BKAV HaiHS : xử lý xóa nhóm - end

  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start
  async removeUsersFromGroup(groupId, userIds) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    return await groupRepository.removeUsersFromGroup(groupId, userIds);
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(page, limit) {
    // Các tham số page, limit truyền xuống đây luôn luôn chuẩn >= 1
    const skip = (page - 1) * limit;
    const take = limit;

    const { groups, total } = await groupRepository.findAndCountAll(skip, take);
    const totalPages = Math.ceil(total / limit);

    return {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        permissions: g.permissions,
        memberCount: g._count.users, // Số lượng thành viên
      })),
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  }
  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - end

  // BKAV HaiHS : xử lý lấy chi tiết nhóm (kèm danh sách thành viên) - start
  async getGroupDetail(groupId) {
    const group = await groupRepository.findByIdWithUsers(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    return group;
  }
  // BKAV HaiHS : xử lý lấy chi tiết nhóm (kèm danh sách thành viên) - end
}

module.exports = new GroupService();

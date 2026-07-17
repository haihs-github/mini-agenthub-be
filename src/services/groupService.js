const groupRepository = require("../repositories/groupRepository");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");
const redisStreamService = require("./redisStreamService");

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

    const group = await groupRepository.create(groupData);
    //  Xóa cache danh sách nhóm và danh sách phân trang người dùng nếu có gán user
    await redisStreamService.cacheDelPattern("groups:page:*");
    if (userIds.length > 0) {
      await redisStreamService.cacheDelPattern("users:page:*");
    }
    return group;
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

    const updated = await groupRepository.update(groupId, updateData);
    // BKAV HaiHS : Xóa cache nhóm và phân quyền của toàn bộ user liên quan - start
    await redisStreamService.cacheDel(`group:${groupId}:profile`);
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("user:*:permissions");
    await redisStreamService.cacheDelPattern("user:*:profile");
    await redisStreamService.cacheDelPattern("users:page:*");
    // BKAV HaiHS : Xóa cache nhóm và phân quyền của toàn bộ user liên quan - end
    return updated;
  }
  //   BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsersToGroup(groupId, userIds) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    // Bỏ check trống mảng vì Controller đã chặn từ xa
    const result = await groupRepository.addUsersToGroup(groupId, userIds);
    // BKAV HaiHS : Xóa cache nhóm, danh sách phân trang và phân quyền của các user liên quan - start
    await redisStreamService.cacheDel(`group:${groupId}:profile`);
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("users:page:*");
    for (const userId of userIds) {
      await redisStreamService.cacheDel(`user:${userId}:permissions`);
      await redisStreamService.cacheDel(`user:${userId}:profile`);
    }
    // BKAV HaiHS : Xóa cache nhóm, danh sách phân trang và phân quyền của các user liên quan - end
    return result;
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end

  // BKAV HaiHS : xử lý xóa nhóm - start
  async deleteGroup(groupId) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    const result = await groupRepository.delete(groupId);
    // BKAV HaiHS : Xóa cache nhóm và phân quyền của toàn bộ user liên quan - start
    await redisStreamService.cacheDel(`group:${groupId}:profile`);
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("user:*:permissions");
    await redisStreamService.cacheDelPattern("user:*:profile");
    await redisStreamService.cacheDelPattern("users:page:*");
    // BKAV HaiHS : Xóa cache nhóm và phân quyền của toàn bộ user liên quan - end
    return result;
  }
  // BKAV HaiHS : xử lý xóa nhóm - end

  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start
  async removeUsersFromGroup(groupId, userIds) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    const result = await groupRepository.removeUsersFromGroup(groupId, userIds);
    // BKAV HaiHS : Xóa cache nhóm, danh sách phân trang và phân quyền của các user liên quan - start
    await redisStreamService.cacheDel(`group:${groupId}:profile`);
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("users:page:*");
    for (const userId of userIds) {
      await redisStreamService.cacheDel(`user:${userId}:permissions`);
      await redisStreamService.cacheDel(`user:${userId}:profile`);
    }
    // BKAV HaiHS : Xóa cache nhóm, danh sách phân trang và phân quyền của các user liên quan - end
    return result;
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(page, limit) {
    const cacheKey = `groups:page:${page}:limit:${limit}`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const { groups, total } = await groupRepository.findAndCountAll(skip, take);
    const totalPages = Math.ceil(total / limit);

    const result = {
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

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(result), 300); // 5 phút
    return result;
  }
  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - end

  // BKAV HaiHS : xử lý lấy chi tiết nhóm (kèm danh sách thành viên) - start
  async getGroupDetail(groupId) {
    const cacheKey = `group:${groupId}:profile`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const group = await groupRepository.findByIdWithUsers(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(group), 86400); // 24 giờ
    return group;
  }
  // BKAV HaiHS : xử lý lấy chi tiết nhóm (kèm danh sách thành viên) - end

  // BKAV HaiHS : xử lý tìm kiếm nhóm có phân trang và caching - start
  async searchGroups(keyword, page, limit) {
    const cleanKeyword = keyword ? keyword.trim() : "";
    const cacheKey = `groups:page:${page}:limit:${limit}:search:${encodeURIComponent(cleanKeyword)}`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const { groups, total } = await groupRepository.searchAndCount({
      keyword: cleanKeyword,
      skip,
      take,
    });

    const totalPages = Math.ceil(total / limit);

    const result = {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        permissions: g.permissions,
        memberCount: g._count.users,
      })),
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        limit,
      },
    };

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(result), 300); // 5 phút
    return result;
  }
  // BKAV HaiHS : xử lý tìm kiếm nhóm có phân trang và caching - end
}

module.exports = new GroupService();

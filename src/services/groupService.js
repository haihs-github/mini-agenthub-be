const groupRepository = require("../repositories/groupRepository");
const AppError = require("../errors/appError");
const ERROR = require("../constants/errorCodes");
const redisStreamService = require("./redisStreamService");

// BKAV HaiHS : Định nghĩa lớp GroupService quản lý logic nghiệp vụ cho nhóm quyền - start
class GroupService {
  // BKAV HaiHS : xử lý tạo nhóm mới - start
  async createGroup(name, permissions = [], userIds = []) {
    await this.#checkGroupNameUnique(name);

    const groupData = {
      name,
      permissions,
    };

    if (userIds.length > 0) {
      groupData.users = {
        connect: userIds.map((id) => ({ id })),
      };
    }

    const group = await groupRepository.create(groupData);

    await this.#clearGroupListCache(userIds.length > 0);

    return group;
  }
  // BKAV HaiHS : xử lý tạo nhóm mới - end

  // BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(groupId, name, permissions) {
    const group = await this.#fetchAndVerifyGroup(groupId);

    const updateData = {};

    if (name && name !== group.name) {
      await this.#checkGroupNameUnique(name);
      updateData.name = name;
    }

    if (permissions) {
      updateData.permissions = permissions;
    }

    const updated = await groupRepository.update(groupId, updateData);

    await this.#clearGroupDetailCache(groupId);

    return updated;
  }
  // BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsersToGroup(groupId, userIds) {
    await this.#fetchAndVerifyGroup(groupId);

    const result = await groupRepository.addUsersToGroup(groupId, userIds);

    await this.#clearGroupDetailCache(groupId, userIds);

    return result;
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end

  // BKAV HaiHS : xử lý xóa nhóm - start
  async deleteGroup(groupId) {
    await this.#fetchAndVerifyGroup(groupId);

    const result = await groupRepository.delete(groupId);

    await this.#clearGroupDetailCache(groupId);

    return result;
  }
  // BKAV HaiHS : xử lý xóa nhóm - end

  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start
  async removeUsersFromGroup(groupId, userIds) {
    await this.#fetchAndVerifyGroup(groupId);

    const result = await groupRepository.removeUsersFromGroup(groupId, userIds);

    await this.#clearGroupDetailCache(groupId, userIds);

    return result;
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - end

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(page, limit) {
    const cacheKey = `groups:page:${page}:limit:${limit}`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const skip = this.#calculatePaginationSkip(page, limit);
    const take = limit;

    const { groups, total } = await groupRepository.findAndCountAll(skip, take);
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

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(result), 300);
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

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(group), 86400);
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

    const skip = this.#calculatePaginationSkip(page, limit);
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

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(result), 300);
    return result;
  }
  // BKAV HaiHS : xử lý tìm kiếm nhóm có phân trang và caching - end

  // BKAV HaiHS : Hàm phụ kiểm tra tên nhóm là duy nhất - start
  async #checkGroupNameUnique(name) {
    const existingGroup = await groupRepository.findByName(name);
    if (existingGroup) {
      throw new AppError(ERROR.GROUP.ALREADY_EXISTS);
    }
  }
  // BKAV HaiHS : Hàm phụ kiểm tra tên nhóm là duy nhất - end

  // BKAV HaiHS : Hàm phụ lấy thông tin nhóm và xác thực sự tồn tại - start
  async #fetchAndVerifyGroup(groupId) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(ERROR.GROUP.NOT_FOUND);
    }
    return group;
  }
  // BKAV HaiHS : Hàm phụ lấy thông tin nhóm và xác thực sự tồn tại - end

  // BKAV HaiHS : Hàm phụ xóa cache danh sách nhóm - start
  async #clearGroupListCache(hasUserConnections = false) {
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("groups:page:*:search:*");
    if (hasUserConnections) {
      await redisStreamService.cacheDelPattern("users:page:*");
    }
  }
  // BKAV HaiHS : Hàm phụ xóa cache danh sách nhóm - end

  // BKAV HaiHS : Hàm phụ dọn dẹp cache profile nhóm và quyền hạn của các user liên quan - start
  async #clearGroupDetailCache(groupId, userIds = []) {
    await redisStreamService.cacheDel(`group:${groupId}:profile`);
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("groups:page:*:search:*");
    await redisStreamService.cacheDelPattern("users:page:*");

    if (userIds.length > 0) {
      for (const userId of userIds) {
        await redisStreamService.cacheDel(`user:${userId}:permissions`);
        await redisStreamService.cacheDel(`user:${userId}:profile`);
      }
    } else {
      await redisStreamService.cacheDelPattern("user:*:permissions");
      await redisStreamService.cacheDelPattern("user:*:profile");
    }
  }
  // BKAV HaiHS : Hàm phụ dọn dẹp cache profile nhóm và quyền hạn của các user liên quan - end

  // BKAV HaiHS : Hàm phụ tính toán skip phân trang - start
  #calculatePaginationSkip(page, limit) {
    return (page - 1) * limit;
  }
  // BKAV HaiHS : Hàm phụ tính toán skip phân trang - end
}
// BKAV HaiHS : Định nghĩa lớp GroupService quản lý logic nghiệp vụ cho nhóm quyền - end

module.exports = new GroupService();

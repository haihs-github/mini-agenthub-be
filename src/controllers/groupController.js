// controller quản lý nhóm quyền

const groupService = require("../services/groupService");
const { MESSAGES } = require("../constants/messages");

// BKAV HaiHS : Định nghĩa lớp GroupController quản lý và điều hành các nhóm quyền - start
class GroupController {
  // BKAV HaiHS : Xử lý tạo nhóm mới - start
  async createGroup(req, res, next) {
    try {
      const name = req.body.name?.trim();
      const { permissions } = req.body;
      const rawUserIds = req.body.userIds;

      if (!name) {
        return res.status(400).json({ message: MESSAGES.GROUP.EMPTY_NAME });
      }

      let userIds = [];
      if (rawUserIds) {
        const parsed = this.#parseUserIds(rawUserIds);
        if (parsed === null) {
          return res.status(400).json({
            message: MESSAGES.GROUP.INVALID_ARRAY,
          });
        }
        userIds = parsed;
      }

      const result = await groupService.createGroup(name, permissions, userIds);

      res.status(201).json({
        message: MESSAGES.GROUP.CREATE,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Xử lý tạo nhóm mới - end

  // BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);
      const name = req.body.name?.trim();
      const { permissions } = req.body;

      if (!this.#validateGroupId(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }

      const result = await groupService.updateGroup(groupId, name, permissions);

      res.status(200).json({
        message: MESSAGES.GROUP.UPDATE,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsers(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);
      const rawUserIds = req.body.userIds;

      if (!this.#validateGroupId(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }

      const userIds = this.#parseUserIds(rawUserIds);
      if (userIds === null) {
        return res.status(400).json({
          message: MESSAGES.GROUP.INVALID_ARRAY,
        });
      }

      const result = await groupService.addUsersToGroup(groupId, userIds);

      res.status(200).json({
        message: MESSAGES.GROUP.ADD_USERS,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end

  // BKAV HaiHS : xử lý xóa nhóm - start
  async deleteGroup(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);

      if (!this.#validateGroupId(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }

      await groupService.deleteGroup(groupId);

      res.status(200).json({
        message: MESSAGES.GROUP.DELETE,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý xóa nhóm - end

  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start
  async removeUsers(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);
      const rawUserIds = req.body.userIds;

      if (!this.#validateGroupId(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }

      const userIds = this.#parseUserIds(rawUserIds);
      if (userIds === null) {
        return res.status(400).json({
          message: MESSAGES.GROUP.INVALID_ARRAY,
        });
      }

      const result = await groupService.removeUsersFromGroup(groupId, userIds);

      res.status(200).json({
        message: MESSAGES.GROUP.REMOVE_USERS,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - end

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(req, res, next) {
    try {
      const { page: rawPage, limit: rawLimit } = req.query;

      const { page, limit } = this.#parsePagination(rawPage, rawLimit, 10);

      const result = await groupService.getAllGroups(page, limit);

      res.status(200).json({
        message: MESSAGES.GROUP.GET_LIST,
        data: result.groups,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - end

  // BKAV HaiHS : xử lý lấy chi tiết thông tin nhóm - start
  async getGroupDetail(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);

      if (!this.#validateGroupId(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }

      const result = await groupService.getGroupDetail(groupId);

      res.status(200).json({
        message: MESSAGES.GROUP.GET_DETAIL,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý lấy chi tiết thông tin nhóm - end

  // BKAV HaiHS : xử lý tìm kiếm nhóm - start
  async searchGroups(req, res, next) {
    try {
      const keyword = req.query.keyword?.trim() || "";
      const { page: rawPage, limit: rawLimit } = req.query;

      const { page, limit } = this.#parsePagination(rawPage, rawLimit, 10);

      const result = await groupService.searchGroups(keyword, page, limit);

      res.status(200).json({
        message: MESSAGES.GROUP.SEARCH,
        data: result.groups,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý tìm kiếm nhóm - end

  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của Group ID - start
  #validateGroupId(groupId) {
    return !isNaN(groupId);
  }
  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của Group ID - end

  // BKAV HaiHS : Hàm phụ chuẩn hóa và ép kiểu danh sách userIds - start
  #parseUserIds(userIds) {
    if (!userIds || !Array.isArray(userIds)) {
      return null;
    }
    return userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
  }
  // BKAV HaiHS : Hàm phụ chuẩn hóa và ép kiểu danh sách userIds - end

  // BKAV HaiHS : Hàm phụ chuẩn hóa và ép kiểu phân trang nhóm - start
  #parsePagination(page, limit, defaultLimit) {
    let parsedPage = parseInt(page) || 1;
    let parsedLimit = parseInt(limit) || defaultLimit;

    if (parsedPage < 1) parsedPage = 1;
    if (parsedLimit < 1) parsedLimit = defaultLimit;
    if (parsedLimit > 100) parsedLimit = 100;

    return { page: parsedPage, limit: parsedLimit };
  }
  // BKAV HaiHS : Hàm phụ chuẩn hóa và ép kiểu phân trang nhóm - end
}
// BKAV HaiHS : Định nghĩa lớp GroupController quản lý và điều hành các nhóm quyền - end

module.exports = new GroupController();

// controller quản lý nhóm quyền

const groupService = require("../services/groupService");
const { MESSAGES } = require("../constants/messages");

class GroupController {
  // BKAV HaiHS : Xử lý tạo nhóm mới - start
  async createGroup(req, res, next) {
    try {
      const name = req.body.name?.trim();
      const { permissions } = req.body;
      let userIds = req.body.userIds;

      if (!name) {
        return res.status(400).json({ message: MESSAGES.GROUP.EMPTY_NAME });
      }

      // kiểm tra xem userIds có phải là mảng không, nếu có thì ép kiểu về số nguyên Int
      if (userIds) {
        if (!Array.isArray(userIds)) {
          return res.status(400).json({
            message: MESSAGES.GROUP.INVALID_ARRAY,
          });
        }
        userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
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
      // Lấy dữ liệu từ req và chuẩn hóa
      const groupId = parseInt(req.params.id);
      const name = req.body.name?.trim();
      const { permissions } = req.body;

      if (isNaN(groupId)) {
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
      let userIds = req.body.userIds;

      if (isNaN(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: MESSAGES.GROUP.INVALID_ARRAY,
        });
      }

      userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));

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

      if (isNaN(groupId)) {
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
      let userIds = req.body.userIds;

      if (isNaN(groupId)) {
        return res.status(400).json({ message: MESSAGES.GROUP.INVALID_ID });
      }

      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: MESSAGES.GROUP.INVALID_ARRAY,
        });
      }

      userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));

      const result = await groupService.removeUsersFromGroup(groupId, userIds);

      res.status(200).json({
        message: MESSAGES.GROUP.REMOVE_USERS,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - Tuyệt đối sạch rác

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(req, res, next) {
    try {
      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100;

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

      if (isNaN(groupId)) {
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
      let { page, limit } = req.query;

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

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
}

module.exports = new GroupController();

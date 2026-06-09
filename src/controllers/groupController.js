const groupService = require("../services/groupService");

class GroupController {
  // BKAV HaiHS : Xử lý tạo nhóm mới - start
  async createGroup(req, res, next) {
    try {
      // Lấy và chuẩn hóa dữ liệu chuỗi ngay tại Controller
      const name = req.body.name?.trim();
      const { permissions } = req.body;
      let userIds = req.body.userIds;

      // VALIDATE: Kiểm tra dữ liệu bắt buộc
      if (!name) {
        return res
          .status(400)
          .json({ message: "Bắt buộc phải nhập tên Nhóm (name)!" });
      }

      // VALIDATE & ÉP KIỂU: Xử lý mảng userIds đầu vào sạch sẽ
      if (userIds) {
        if (!Array.isArray(userIds)) {
          return res.status(400).json({
            message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
          });
        }
        // Ép toàn bộ phần tử trong mảng về số nguyên Int để Service chỉ xử lý dữ liệu chuẩn
        userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
      }

      // Đẩy việc xuống tầng Service
      const result = await groupService.createGroup(name, permissions, userIds);

      res.status(201).json({
        message: "Tạo Nhóm mới và gán thành viên thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Xử lý tạo nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);
      const name = req.body.name?.trim();
      const { permissions } = req.body;

      // VALIDATE: Chặn ngay nếu ID trên URL không phải là số hợp lệ
      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      const result = await groupService.updateGroup(groupId, name, permissions);

      res.status(200).json({
        message: "Cập nhật thông tin Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  //   BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsers(req, res, next) {
    try {
      const groupId = parseInt(req.params.id);
      let userIds = req.body.userIds;

      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // Ép kiểu sạch mảng đầu vào trước khi giao cho Service
      userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));

      const result = await groupService.addUsersToGroup(groupId, userIds);

      res.status(200).json({
        message: "Thêm các thành viên vào Nhóm thành công!",
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
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      await groupService.deleteGroup(groupId);

      res.status(200).json({
        message: "Xóa Nhóm thành công!",
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
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));

      const result = await groupService.removeUsersFromGroup(groupId, userIds);

      res.status(200).json({
        message: "Xóa các thành viên khỏi Nhóm thành công!",
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

      // Chốt chặn chặt chẽ giới hạn phân trang đầu vào
      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100; // Bảo vệ hệ thống khỏi bão càn quét dữ liệu lớn

      const result = await groupService.getAllGroups(page, limit);

      res.status(200).json({
        message: "Lấy danh sách Nhóm thành công!",
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
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      const result = await groupService.getGroupDetail(groupId);

      res.status(200).json({
        message: "Lấy chi tiết thông tin Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý lấy chi tiết thông tin nhóm - end
}

module.exports = new GroupController();

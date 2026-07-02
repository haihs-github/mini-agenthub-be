// controller quản lý nhóm quyền

const groupService = require("../services/groupService");

class GroupController {
  // BKAV HaiHS : Xử lý tạo nhóm mới - start
  async createGroup(req, res, next) {
    try {
      // Lấy dữ liệu và chuẩn hóa dữ liệu đầu vào
      const name = req.body.name?.trim();
      const { permissions } = req.body;
      let userIds = req.body.userIds;

      // Kiểm tra xem tên nhóm có bị bỏ trống không?
      if (!name) {
        return res
          .status(400)
          .json({ message: "Bắt buộc phải nhập tên Nhóm (name)!" });
      }

      // kiểm tra xem userIds có phải là mảng không, nếu có thì ép kiểu về số nguyên Int
      if (userIds) {
        if (!Array.isArray(userIds)) {
          return res.status(400).json({
            message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
          });
        }
        // Ép toàn bộ phần tử trong mảng về số nguyên Int để Service chỉ xử lý dữ liệu chuẩn
        userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
      }

      // gọi hàm createGroup của groupService để tạo nhóm mới và gán thành viên
      const result = await groupService.createGroup(name, permissions, userIds);

      // trả lại kết quả cho người dùng
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
      // Lấy dữ liệu từ req và chuẩn hóa
      const groupId = parseInt(req.params.id);
      const name = req.body.name?.trim();
      const { permissions } = req.body;

      // kiểm tra xem groupId có phải là số nguyên không?
      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      // gọi hàm updateGroup của groupService để cập nhật thông tin nhóm
      const result = await groupService.updateGroup(groupId, name, permissions);

      // trả lại kết quả cho người dùng
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
      // Lấy dữ liệu từ req và chuẩn hóa
      const groupId = parseInt(req.params.id);
      let userIds = req.body.userIds;
      // Kiểm tra xem groupId có phải là số nguyên không?
      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }
      // Kiểm tra xem userIds có phải là mảng không, nếu không thì trả về lỗi
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // ép kiểu toàn bộ phần tử trong mảng về số nguyên Int để Service chỉ xử lý dữ liệu chuẩn
      userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));

      // gọi hàm addUsersToGroup của groupService để thêm người dùng vào nhóm
      const result = await groupService.addUsersToGroup(groupId, userIds);

      // trả về kết quả cho người dùng
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
      // Lấy dữ liệu từ req và chuẩn hóa
      const groupId = parseInt(req.params.id);

      // kiểm tra xem groupId có phải là số nguyên không?
      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }
      // gọi hàm deleteGroup của groupService để xóa nhóm
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
      // lấy dữ liệu từ req và chuẩn hóa
      const groupId = parseInt(req.params.id);
      let userIds = req.body.userIds;

      // kiểm tra xem groupId có phải là số nguyên không?
      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }

      // kiểm tra xem userIds có phải là mảng không, nếu không thì trả về lỗi
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // ép kiểu toàn bộ phần tử trong mảng về số nguyên Int để Service chỉ xử lý dữ liệu chuẩn
      userIds = userIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));

      // gọi hàm removeUsersFromGroup của groupService để xóa người dùng khỏi nhóm
      const result = await groupService.removeUsersFromGroup(groupId, userIds);

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa dữ liệu đầu vào
      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      // Kiểm tra các giới hạn trên và dưới khi phân trang
      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100; // Bảo vệ hệ thống khỏi bão càn quét dữ liệu lớn

      // gọi hàm getAllGroups của groupService để lấy danh sách nhóm có phân trang
      const result = await groupService.getAllGroups(page, limit);

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa dữ liệu đầu vào
      const groupId = parseInt(req.params.id);

      // Kiểm tra xem groupId có phải là số nguyên không?
      if (isNaN(groupId)) {
        return res
          .status(400)
          .json({ message: "ID nhóm phải là một số nguyên hợp lệ!" });
      }
      // gọi hàm getGroupDetail của groupService để lấy chi tiết thông tin nhóm
      const result = await groupService.getGroupDetail(groupId);

      // trả về kết quả cho người dùng
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

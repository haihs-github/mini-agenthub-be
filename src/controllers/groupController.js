const groupService = require("../services/groupService");

class GroupController {
  // BKAV HaiHS : Xử lý tạo nhóm mới - start
  async createGroup(req, res, next) {
    try {
      // Lấy thêm userIds từ Body do Client gửi lên
      const { name, permissions, userIds } = req.body;

      // Kiểm tra dữ liệu đầu vào bắt buộc
      if (!name) {
        return res
          .status(400)
          .json({ message: "Bắt buộc phải nhập tên Nhóm (name)!" });
      }

      // Kiểm tra định dạng dữ liệu userIds nếu admin có truyền lên
      if (userIds && !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
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
  // BKAV HaiHS : Xử lý tao nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID nhóm từ URL
      const { name, permissions } = req.body; // Lấy cả name và permissions từ Body

      // Gọi Service xử lý logic nghiệp vụ nặng đầu
      const result = await groupService.updateGroup(id, name, permissions);

      res.status(200).json({
        message: "Cập nhật thông tin Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra errorHandler
    }
  }
  //   BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsers(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID Nhóm từ URL
      const { userIds } = req.body; // Lấy mảng ID người dùng từ Body

      // Kiểm tra dữ liệu đầu vào bắt buộc phải là mảng
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // Gọi Service xử lý
      const result = await groupService.addUsersToGroup(id, userIds);

      res.status(200).json({
        message: "Thêm các thành viên vào Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Gửi lỗi sang errorHandler gánh
    }
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end
}

module.exports = new GroupController();

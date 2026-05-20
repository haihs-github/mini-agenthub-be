const groupService = require("../services/groupService");

class GroupController {
  // BKAV HaiHS : Xử lý tao nhóm mới - start
  async createGroup(req, res, next) {
    try {
      const { name, permissions } = req.body;

      // Kiểm tra dữ liệu đầu vào cơ bản
      if (!name) {
        return res
          .status(400)
          .json({ message: "Bắt buộc phải nhập tên Nhóm (name)!" });
      }

      // Đẩy việc cho Service xử lý
      const result = await groupService.createGroup(name, permissions);

      // Trả về kết quả hoàn chỉnh cho khách
      res.status(201).json({
        message: "Tạo Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Gửi lỗi sang tầng errorHandler gánh
    }
  }
  // BKAV HaiHS : Xử lý tao nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật quyền cho nhóm - start
  async updatePermissions(req, res, next) {
    try {
      const { id } = req.params; // Lấy id nhóm từ URL (ví dụ: /api/groups/1/permissions thì id = 1)
      const { permissions } = req.body;

      // Kiểm tra xem dữ liệu truyền lên có phải là mảng không
      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({
          message: "Dữ liệu permissions truyền lên bắt buộc phải là một mảng!",
        });
      }

      // Giao việc cho Service xử lý logic
      const result = await groupService.updateGroupPermissions(id, permissions);

      res.status(200).json({
        message: "Cập nhật quyền cho Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Gửi lỗi sang errorHandler
    }
  }
  //   BKAV HaiHS : xử lý cập nhật quyền cho nhóm - end
}

module.exports = new GroupController();

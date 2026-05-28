const userService = require("../services/userService");

class UserController {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUser(req, res, next) {
    try {
      const { email, fullname, groupIds } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Bắt buộc phải nhập Email!" });
      }

      // Giao việc cho Service
      const result = await userService.createUserByAdmin(
        email,
        fullname,
        groupIds,
      );

      res.status(201).json({
        message: "Tạo tài khoản và gửi Email thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : tạo người dùng mới - end

  // BKAV HaiHS : controller nhận query param phân trang - start
  async getUsers(req, res, next) {
    try {
      // Đón các tham số dạng query string trên URL
      const { page, limit, search } = req.query;

      const result = await userService.getAllUsers({ page, limit, search });

      // Trả ra cấu trúc chuẩn dữ liệu kèm object pagination chuyên nghiệp
      res.status(200).json({
        message: "Lấy danh sách người dùng thành công!",
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : controller nhận query param phân trang - end
}

module.exports = new UserController();

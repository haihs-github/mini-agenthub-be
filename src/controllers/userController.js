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

  // BKAV HaiHS : lấy danh sách người dùng phân trang - start
  async getAllUsers(req, res, next) {
    try {
      // Lấy tham số dạng: /api/users?page=1&limit=10
      let { page, limit } = req.query;

      // Ép kiểu về số nguyên và set mặc định
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;

      // Gọi Service làm việc
      const result = await userService.getAllUsers(page, limit);

      // Trả response
      res.status(200).json({
        message: "Lấy danh sách người dùng thành công!",
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : lấy danh sách người dùng phân trang - end

  // BKAV HaiHS : lấy chi tiết người dùng - start
  async getUserDetail(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID từ URL (ví dụ: /api/users/2 thì id = 2)

      // Giao việc cho tầng Service xử lý
      const result = await userService.getUserDetail(id);

      // Trả kết quả chuẩn RESTful
      res.status(200).json({
        message: "Lấy thông tin chi tiết người dùng thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra middleware errorHandler gánh
    }
  }
  // BKAV HaiHS : lấy chi tiết người dùng - end

  // BKAV HaiHS : cập nhật người dùng - start
  async updateUser(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID người dùng cần sửa từ URL
      const { email, fullname, groupIds } = req.body; // Lấy dữ liệu sửa từ Body

      // Gọi tầng Service xử lý
      const result = await userService.updateUser(
        id,
        email,
        fullname,
        groupIds,
      );

      res.status(200).json({
        message: "Cập nhật thông tin người dùng thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra errorHandler gánh
    }
  }
  // BKAV HaiHS : cập nhật người dùng - end

  // BKAV HaiHS : xóa người dùng - start
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID người dùng cần xóa từ URL

      // Gọi tầng Service xử lý logic
      await userService.deleteUser(id);

      res.status(200).json({
        message: "Xóa tài khoản người dùng thành công!",
      });
    } catch (error) {
      next(error); // Gửi lỗi sang errorHandler xử lý tập trung
    }
  }
  // BKAV HaiHS : xóa người dùng - end

  // BKAV HaiHS : tìm kiếm và phân trang người dùng - start
  async searchUsers(req, res, next) {
    try {
      let { keyword, page, limit } = req.query;

      // Ép kiểu phân trang về số nguyên, gán mặc định nếu thiếu
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      const result = await userService.searchUsers(keyword, page, limit);

      res.status(200).json({
        message: "Tìm kiếm người dùng thành công!",
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : tìm kiếm và phân trang người dùng - end
}

module.exports = new UserController();

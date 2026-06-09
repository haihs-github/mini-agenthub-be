const authService = require("../services/authService");

class AuthController {
  //  BKAV HaiHS : xử lý đăng nhập - start
  async login(req, res, next) {
    try {
      // 1. Lấy dữ liệu từ Client
      const { email, password } = req.body;

      // Validate cơ bản (Có thể dùng thư viện Zod sau này)
      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Vui lòng nhập đầy đủ Email và Mật khẩu" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res
          .status(400)
          .json({ message: "Định dạng Email không hợp lệ!" });
      }

      // 2. Giao việc cho Service
      const result = await authService.login(email, password);

      // 3. Trả Response thành công
      res.status(200).json({
        message: "Đăng nhập thành công!",
        data: result,
      });
    } catch (error) {
      // Nếu Service ném ra lỗi, chuyển thẳng lỗi đó đến Middleware Error Handler
      next(error);
    }
  }
  //  BKAV HaiHS : xử lý đăng nhập - end

  // BKAV HaiHS : xử lý đổi mật khẩu - start
  async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.userId; // Lấy từ Middleware authMiddleware truyền qua

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          message: "Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới!",
        });
      }
      // kiểm tra mật khẩu cũ trùng với mật khẩu mới
      if (oldPassword === newPassword) {
        return res.status(400).json({
          message: "Mật khẩu mới không được trùng với mật khẩu cũ!",
        });
      }

      // Giao việc cho Service xử lý
      await authService.changePassword(userId, oldPassword, newPassword);

      res.status(200).json({
        message:
          "Đổi mật khẩu thành công! Vui lòng dùng mật khẩu mới cho lần đăng nhập sau.",
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra file errorHandler
    }
  }
  // BKAV HaiHS : xử lý đổi mật khẩu - end
}

module.exports = new AuthController();

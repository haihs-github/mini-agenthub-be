// Controller quant lý đăng nhập và đổi mật khẩu

const authService = require("../services/authService");

class AuthController {
  //  BKAV HaiHS : xử lý đăng nhập - start
  async login(req, res, next) {
    try {
      // Lấy dữ liệu từ req
      const { email, password } = req.body;

      // Validate cơ bản (Có thể dùng thư viện Zod sau này)
      if (!email || !password) {
        // kiểm tra thiếu email hay password ko?
        return res
          .status(400)
          .json({ message: "Vui lòng nhập đầy đủ Email và Mật khẩu" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // định dạng cho email
      if (!emailRegex.test(email)) {
        // kiểm tra email đúng định dạng ko?
        return res
          .status(400)
          .json({ message: "Định dạng Email không hợp lệ!" });
      }

      // gửi email & password xuống hàm login của authService
      const result = await authService.login(email, password);

      // Trả Response cho người dùng
      res.status(200).json({
        message: "Đăng nhập thành công!",
        data: result,
      });
    } catch (error) {
      // chuyển lỗi đó đến Middleware Error Handler
      next(error);
    }
  }
  //  BKAV HaiHS : xử lý đăng nhập - end

  // BKAV HaiHS : xử lý đổi mật khẩu - start
  async changePassword(req, res, next) {
    try {
      // lấy dữ liệu từ req
      const { oldPassword, newPassword } = req.body;
      const userId = req.userId;

      //  kiểm tra thiếu mật khẩu cũ hoặc mới ko?
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

      // Chuyển dữ liệu xuống hàm changePassword của authService để xử lý
      await authService.changePassword(userId, oldPassword, newPassword);

      // trả lại response cho người dùng
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

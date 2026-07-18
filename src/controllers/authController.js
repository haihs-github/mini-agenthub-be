// Controller quản lý đăng nhập và đổi mật khẩu
const authService = require("../services/authService");
const { COOKIE_MAX_AGE } = require("../constants/tokenInfo");
const { MESSAGES } = require("../constants/messages");

class AuthController {
  //  BKAV HaiHS : xử lý đăng nhập - start
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // Validate cơ bản
      if (!email || !password) {
        return res.status(400).json({ message: MESSAGES.AUTH.MISSING_FIELDS });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        // kiểm tra email đúng định dạng ko?
        return res.status(400).json({ message: MESSAGES.AUTH.INVALID_EMAIL });
      }

      const result = await authService.login(email, password);

      // Luu Refresh Token vao HttpOnly Cookie bao mat
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
      });

      res.status(200).json({
        message: MESSAGES.AUTH.LOGIN_SUCCESS,
        data: {
          token: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  //  BKAV HaiHS : xử lý đăng nhập - end

  // BKAV HaiHS : xử lý làm mới token (Refresh Token) - start
  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;
      const result = await authService.refresh(refreshToken);

      // Cập nhật Refresh Token mới vào Cookie HttpOnly để thực hiện Rolling Session
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
      });

      res.status(200).json({
        message: MESSAGES.AUTH.REFRESH_SUCCESS,
        data: {
          token: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý làm mới token (Refresh Token) - end

  // BKAV HaiHS : xử lý đăng xuất giải phóng token - start
  async logout(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;
      await authService.logout(refreshToken);

      res.clearCookie("refreshToken");
      res.status(200).json({
        message: MESSAGES.AUTH.LOGOUT_SUCCESS,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý đăng xuất giải phóng token - end

  // BKAV HaiHS : xử lý đổi mật khẩu - start
  async changePassword(req, res, next) {
    try {
      // lấy dữ liệu từ req
      const { oldPassword, newPassword } = req.body;
      const userId = req.userId;

      //  kiểm tra thiếu mật khẩu cũ hoặc mới ko?
      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          message: MESSAGES.AUTH.PASSWORD_REQUIRED,
        });
      }
      // kiểm tra mật khẩu cũ trùng với mật khẩu mới
      if (oldPassword === newPassword) {
        return res.status(400).json({
          message: MESSAGES.AUTH.PASSWORD_SAME,
        });
      }

      // Chuyển dữ liệu xuống hàm changePassword của authService để xử lý
      await authService.changePassword(userId, oldPassword, newPassword);

      // trả lại response cho người dùng
      res.status(200).json({
        message: MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS,
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra file errorHandler
    }
  }
  // BKAV HaiHS : xử lý đổi mật khẩu - end
}

module.exports = new AuthController();

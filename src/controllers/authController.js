// Controller quản lý đăng nhập và đổi mật khẩu
const authService = require("../services/authService");
const { COOKIE_MAX_AGE } = require("../constants/tokenInfo");
const { MESSAGES } = require("../constants/messages");

// BKAV HaiHS : Định nghĩa lớp AuthController quản lý xác thực và mật khẩu - start
class AuthController {
  constructor() {
    this.login = this.login.bind(this);
    this.refresh = this.refresh.bind(this);
    this.logout = this.logout.bind(this);
    this.changePassword = this.changePassword.bind(this);
  }
  
  // ==========================================
  // PUBLIC METHODS (Viết lên phía trên)
  // ==========================================

  // BKAV HaiHS : xử lý đăng nhập - start
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const validation = this.#validateLoginPayload(email, password);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }

      const result = await authService.login(email, password);

      this.#setRefreshTokenCookie(res, result.refreshToken);

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
  // BKAV HaiHS : xử lý đăng nhập - end

  // BKAV HaiHS : xử lý làm mới token (Refresh Token) - start
  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;
      const result = await authService.refresh(refreshToken);

      this.#setRefreshTokenCookie(res, result.refreshToken);

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
      const { oldPassword, newPassword } = req.body;
      const userId = req.userId;

      const validation = this.#validatePasswordPayload(oldPassword, newPassword);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }

      await authService.changePassword(userId, oldPassword, newPassword);

      res.status(200).json({
        message: MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý đổi mật khẩu - end

  // ==========================================
  // PRIVATE METHODS (Viết xuống phía dưới)
  // ==========================================

  // BKAV HaiHS : Hàm phụ kiểm tra định dạng email - start
  #isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  // BKAV HaiHS : Hàm phụ kiểm tra định dạng email - end

  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của thông tin đăng nhập - start
  #validateLoginPayload(email, password) {
    if (!email || !password) {
      return { valid: false, message: MESSAGES.AUTH.MISSING_FIELDS };
    }
    if (!this.#isValidEmail(email)) {
      return { valid: false, message: MESSAGES.AUTH.INVALID_EMAIL };
    }
    return { valid: true };
  }
  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của thông tin đăng nhập - end

  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của thông tin đổi mật khẩu - start
  #validatePasswordPayload(oldPassword, newPassword) {
    if (!oldPassword || !newPassword) {
      return { valid: false, message: MESSAGES.AUTH.PASSWORD_REQUIRED };
    }
    if (oldPassword === newPassword) {
      return { valid: false, message: MESSAGES.AUTH.PASSWORD_SAME };
    }
    return { valid: true };
  }
  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của thông tin đổi mật khẩu - end

  // BKAV HaiHS : Hàm phụ thiết lập cookie chứa Refresh Token - start
  #setRefreshTokenCookie(res, refreshToken) {
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  // BKAV HaiHS : Hàm phụ thiết lập cookie chứa Refresh Token - end
}
// BKAV HaiHS : Định nghĩa lớp AuthController quản lý xác thực và mật khẩu - end

module.exports = new AuthController();

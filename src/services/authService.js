const userRepository = require("../repositories/userRepository");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../errors/appError");
const ERROR = require("../constants/errorCodes");
const prisma = require("../models/prismaClient");

// BKAV HaiHS : Định nghĩa lớp AuthService xử lý logic xác thực, sinh token và đổi mật khẩu - start
class AuthService {
  // BKAV HaiHS : xử lý đăng nhập bằng 2 Token (Access + Refresh) - start
  async login(email, password) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError(ERROR.AUTH.INVALID_CREDENTIALS);
    }

    const allPermissions = this.#mergePermissions(user);
    const accessToken = this.#generateAccessToken(user, allPermissions);
    const refreshToken = this.#generateRefreshToken(user.id);

    await this.#saveRefreshTokenToDb(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
    };
  }
  // BKAV HaiHS : xử lý đăng nhập bằng 2 Token (Access + Refresh) - end

  // BKAV HaiHS : Làm mới Access Token từ Refresh Token (Cơ chế Rolling Session / Rotation) - start
  async refresh(refreshToken) {
    if (!refreshToken) {
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_REQUIRED",
        message: "Không tìm thấy token gia hạn!",
      });
    }

    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

    try {
      jwt.verify(refreshToken, REFRESH_SECRET);
    } catch (e) {
      await this.#deleteRefreshTokenFromDb(refreshToken);

      throw new AppError({
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_INVALID",
        message: "Refresh Token không hợp lệ hoặc đã hết hạn!",
      });
    }

    const dbToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { groups: true } } },
    });

    if (!dbToken || dbToken.expiresAt < new Date()) {
      if (dbToken) {
        await this.#deleteRefreshTokenFromDb(refreshToken);
      }
      throw new AppError({
        statusCode: 401,
        code: "AUTH_SESSION_EXPIRED",
        message: "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!",
      });
    }

    const user = dbToken.user;
    const allPermissions = this.#mergePermissions(user);

    await this.#deleteRefreshTokenFromDb(refreshToken);

    const accessToken = this.#generateAccessToken(user, allPermissions);
    const newRefreshToken = this.#generateRefreshToken(user.id);

    await this.#saveRefreshTokenToDb(user.id, newRefreshToken);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
    };
  }
  // BKAV HaiHS : Làm mới Access Token từ Refresh Token (Cơ chế Rolling Session / Rotation) - end

  // BKAV HaiHS : xử lý đăng xuất giải phóng token - start
  async logout(refreshToken) {
    if (refreshToken) {
      await this.#deleteRefreshTokenFromDb(refreshToken);
    }
    return true;
  }
  // BKAV HaiHS : xử lý đăng xuất giải phóng token - end

  // BKAV HaiHS : xử lý đổi mật khẩu - start
  async changePassword(userId, oldPassword, newPassword) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new AppError(ERROR.AUTH.WRONG_OLD_PASSWORD);
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await userRepository.updatePassword(userId, hashedNewPassword);

    return true;
  }
  // BKAV HaiHS : xử lý đổi mật khẩu - end

  // BKAV HaiHS : Hàm phụ tạo Access Token thời hạn ngắn - start
  #generateAccessToken(user, permissions) {
    const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        permissions: permissions,
        phone: user.phone,
        address: user.address,
      },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );
  }
  // BKAV HaiHS : Hàm phụ tạo Access Token thời hạn ngắn - end

  // BKAV HaiHS : Hàm phụ tạo Refresh Token thời hạn dài - start
  #generateRefreshToken(userId) {
    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
    return jwt.sign(
      {
        id: userId,
      },
      REFRESH_SECRET,
      { expiresIn: "7d" },
    );
  }
  // BKAV HaiHS : Hàm phụ tạo Refresh Token thời hạn dài - end

  // BKAV HaiHS : Hàm phụ gộp và loại trùng danh sách quyền của user và group - start
  #mergePermissions(user) {
    const groupPerms = user.groups
      ? user.groups.flatMap((g) => g.permissions)
      : [];
    return [...new Set([...user.permissions, ...groupPerms])];
  }
  // BKAV HaiHS : Hàm phụ gộp và loại trùng danh sách quyền của user và group - end

  // BKAV HaiHS : Hàm phụ lưu Refresh Token mới vào Database - start
  async #saveRefreshTokenToDb(userId, token) {
    await prisma.refreshToken.create({
      data: {
        token: token,
        userId: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày
      },
    });
  }
  // BKAV HaiHS : Hàm phụ lưu Refresh Token mới vào Database - end

  // BKAV HaiHS : Hàm phụ xóa Refresh Token khỏi Database - start
  async #deleteRefreshTokenFromDb(token) {
    await prisma.refreshToken.delete({ where: { token } }).catch(() => {});
  }
  // BKAV HaiHS : Hàm phụ xóa Refresh Token khỏi Database - end
}
// BKAV HaiHS : Định nghĩa lớp AuthService xử lý logic xác thực, sinh token và đổi mật khẩu - end

module.exports = new AuthService();

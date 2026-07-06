const userRepository = require("../repositories/userRepository");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");
const prisma = require("../models/prismaClient");

class AuthService {
  // BKAV HaiHS : xử lý đăng nhập bằng 2 Token (Access + Refresh) - start
  async login(email, password) {
    // Gọi Repo để lấy dữ liệu từ DB
    const user = await userRepository.findByEmail(email);

    // Nếu không có user, ném lỗi ra ngoài (Controller sẽ bắt)
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError(ERROR.AUTH.INVALID_CREDENTIALS);
    }

    // Tính toán logic nghiệp vụ: Hợp nhất quyền hạn
    const groupPerms = user.groups
      ? user.groups.flatMap((g) => g.permissions)
      : [];
    const allPermissions = [...new Set([...user.permissions, ...groupPerms])];

    // Cấu hình các mã khóa bí mật lấy từ env
    const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

    // Tạo Access Token (Hạn ngắn 15 phút)
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );

    // Tạo Refresh Token (Hạn dài 7 ngày)
    const refreshToken = jwt.sign(
      {
        id: user.id,
      },
      REFRESH_SECRET,
      { expiresIn: "7d" },
    );

    // Lưu Refresh Token vào Database PostgreSQL
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày
      },
    });

    // Trả kết quả sạch sẽ về cho Controller
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

  // BKAV HaiHS : Làm mới Access Token từ Refresh Token - start
  async refresh(refreshToken) {
    if (!refreshToken) {
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_REQUIRED",
        message: "Không tìm thấy token gia hạn!",
      });
    }

    const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch (e) {
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_INVALID",
        message: "Refresh Token không hợp lệ hoặc đã hết hạn!",
      });
    }

    // Đối chiếu với Database
    const dbToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { groups: true } } },
    });

    if (!dbToken || dbToken.expiresAt < new Date()) {
      if (dbToken) {
        await prisma.refreshToken
          .delete({ where: { token: refreshToken } })
          .catch(() => {});
      }
      throw new AppError({
        statusCode: 401,
        code: "AUTH_SESSION_EXPIRED",
        message: "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!",
      });
    }

    // Lấy thông tin user từ database
    const user = dbToken.user;
    const groupPerms = user.groups
      ? user.groups.flatMap((g) => g.permissions)
      : [];
    const allPermissions = [...new Set([...user.permissions, ...groupPerms])];

    // Tạo Access Token mới (15 phút)
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );

    return {
      accessToken,
      user: {
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
    };
  }

  async logout(refreshToken) {
    if (refreshToken) {
      await prisma.refreshToken
        .delete({ where: { token: refreshToken } })
        .catch(() => {});
    }
    return true;
  }
  // BKAV HaiHS : Làm mới Access Token từ Refresh Token - end

  // BKAV HaiHS : xử lý đổi mật khẩu - start
  async changePassword(userId, oldPassword, newPassword) {
    // Tìm thông tin user hiện tại trong DB
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    // Kiểm tra xem mật khẩu cũ (hoặc mật khẩu tạm thời) nhập vào có đúng không
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new AppError(ERROR.AUTH.WRONG_OLD_PASSWORD);
    }

    // Mã hóa mật khẩu mới
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Gọi Repo để lưu mật khẩu mới vào DB
    await userRepository.updatePassword(userId, hashedNewPassword);

    return true;
  }
  // BKAV HaiHS : xử lý đổi mật khẩu - end
}

module.exports = new AuthService();

const userRepository = require("../repositories/userRepository");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");

class AuthService {
  // BKAV HaiHS : xử lý đăng nhập - start
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

    // Ký Token (Trong thực tế nhớ để JWT_SECRET trong file .env)
    const SECRET_KEY = process.env.JWT_SECRET || "Sieu_Mat_Ma_Cua_Toi_123";
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
      SECRET_KEY,
      { expiresIn: "24h" },
    );

    // Trả kết quả sạch sẽ về cho Controller
    return {
      token: token,
      user: {
        email: user.email,
        fullname: user.fullname,
        permissions: allPermissions,
        phone: user.phone,
        address: user.address,
      },
    };
  }
  // BKAV HaiHS : xử lý đăng nhập - end

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

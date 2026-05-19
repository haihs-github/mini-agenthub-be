const userRepository = require('../repositories/userRepository');
const emailService = require('./emailService');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // Thư viện có sẵn của Node.js để tạo chuỗi ngẫu nhiên

class UserService {
// BKAV HaiHS : tạo người dùng mới - start
  async createUserByAdmin(email, permissions) {
    // 1. Kiểm tra email đã tồn tại chưa
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }

    // 2. Sinh mật khẩu ngẫu nhiên (8 ký tự)
    const tempPassword = crypto.randomBytes(4).toString('hex');

    // 3. Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 4. Lưu vào Database
    const newUser = await userRepository.create({
      email: email,
      password: hashedPassword,
      permissions: permissions || ["CHAT", "CONV_C", "CONV_R", "CONV_U", "CONV_D"] // Lấy quyền admin truyền vào, nếu không có thì lấy mặc định
    });

    // 5. Gửi Email thông báo
    await emailService.sendWelcomeEmail(email, tempPassword);

    // Không trả về password trong kết quả
    return {
      id: newUser.id,
      email: newUser.email,
      permissions: newUser.permissions
    };
  }
// BKAV HaiHS : tạo người dùng mới - end
}

module.exports = new UserService();
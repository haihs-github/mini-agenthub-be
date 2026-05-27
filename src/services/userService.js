const userRepository = require("../repositories/userRepository");
const emailService = require("./emailService");
const bcrypt = require("bcrypt");
const crypto = require("crypto"); // Thư viện có sẵn của Node.js để tạo chuỗi ngẫu nhiên

class UserService {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUserByAdmin(email, fullname, groupIds) {
    // Kiểm tra email đã tồn tại chưa
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }

    //  Sinh mật khẩu ngẫu nhiên (8 ký tự)
    const tempPassword = crypto.randomBytes(4).toString("hex");

    //  Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // đóng gói dữ liệu người dùng
    const userData = {
      email: email,
      password: hashedPassword,
      fullname: fullname || null, // Nếu admin không nhập họ tên thì để trống (null)
      permissions: ["CHAT", "CONV_C", "CONV_R", "CONV_U", "CONV_D"], // Quyền mặc định chuẩn SRS [cite: 10, 11]
    };

    // gán người dùng vào nhóm
    if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
      userData.groups = {
        // Biến mảng số [1, 2] thành dạng [{ id: 1 }, { id: 2 }] để ném vào kết nối với Prisma
        connect: groupIds.map((id) => ({ id: parseInt(id) })),
      };
    }

    // Lưu vào Database thông qua Repo
    const newUser = await userRepository.create(userData);

    // Gửi Email thông báo
    await emailService.sendWelcomeEmail(email, tempPassword);

    // Không trả về password trong kết quả
    delete newUser.password;
    return newUser;
  }
  // BKAV HaiHS : tạo người dùng mới - end
}

module.exports = new UserService();

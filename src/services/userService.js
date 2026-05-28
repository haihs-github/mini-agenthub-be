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

  // BKAV HaiHS : logic nghiệp vụ lấy danh sách phân trang - start
  async getAllUsers(page, limit) {
    // 1. Tính toán vị trí skip và take
    const skip = (page - 1) * limit;
    const take = limit;

    // 2. Gọi Repo lấy dữ liệu sạch từ DB
    const { users, total } = await userRepository.findAndCountAll(skip, take);

    // 3. Tính toán tổng số trang
    const totalPages = Math.ceil(total / limit);

    // 4. Trả về kết quả
    return {
      users,
      pagination: {
        totalItems: total,
        totalPages: totalPages,
        currentPage: page,
        limit: limit,
      },
    };
  }
  // BKAV HaiHS : logic nghiệp vụ lấy danh sách phân trang - end

  // BKAV HaiHS : lấy chi tiết người dùng - start
  async getUserDetail(userId) {
    // 1. Gọi Repo check DB lấy thông tin chi tiết
    const user = await userRepository.findByIdDetailed(userId);

    // 2. Nếu không tìm thấy, ném lỗi ra cho tầng errorHandler xử lý
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    return user;
  }
  // BKAV HaiHS : lấy chi tiết người dùng - end

  // BKAV HaiHS : cập nhật người dùng - start
  async updateUser(userId, email, fullname, groupIds) {
    // 1. Kiểm tra xem user có tồn tại không
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const updateData = {};

    // 2. Logic kiểm tra chặn trùng Email
    if (email && email !== user.email) {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }
      updateData.email = email;
    }

    // 3. Cập nhật họ tên (nếu truyền lên)
    if (fullname !== undefined) {
      updateData.fullname = fullname;
    }

    // 4. Logic cập nhật ghi đè danh sách Nhóm (Many-to-Many với 'set')
    if (groupIds) {
      if (!Array.isArray(groupIds)) {
        throw new Error("GROUP_IDS_MUST_BE_ARRAY");
      }
      updateData.groups = {
        // Xóa sạch liên kết cũ, nạp liên kết mới truyền lên
        set: groupIds.map((id) => ({ id: parseInt(id) })),
      };
    }

    // 5. Gọi Repo thực thi cập nhật xuống DB
    return await userRepository.update(userId, updateData);
  }
  // BKAV HaiHS : cập nhật người dùng - end
}

module.exports = new UserService();

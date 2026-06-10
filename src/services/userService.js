const userRepository = require("../repositories/userRepository");
const emailService = require("./emailService");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const AppError = require("../utils/appError");
const ERROR = require("../constants/errorCodes");
const jwt = require("jsonwebtoken");
class UserService {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUserByAdmin(email, fullname, groupIds) {
    // Kiểm tra email đã tồn tại chưa
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError(ERROR.USER.EMAIL_EXISTS);
    }

    // Sinh mật khẩu ngẫu nhiên (8 ký tự hex)
    const tempPassword = crypto.randomBytes(4).toString("hex");
    console.log("tempPassword:" + tempPassword); // dungf khi dev

    // Mã hóa mật khẩu bảo mật
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Đóng gói dữ liệu người dùng sạch
    const userData = {
      email,
      password: hashedPassword,
      fullname: fullname || null,
      permissions: ["CHAT", "CONV_C", "CONV_R", "CONV_U", "CONV_D"],
    };

    // Gán người dùng vào nhóm (Đã bỏ parseInt vì Controller mới đã ép kiểu chuẩn)
    if (groupIds && groupIds.length > 0) {
      userData.groups = {
        connect: groupIds.map((id) => ({ id })),
      };
    }

    // Lưu vào Database thông qua Repo thành công
    const newUser = await userRepository.create(userData);

    // Tách biệt hoàn toàn rủi ro của dịch vụ Email mạng ngoài với trạng thái DB
    try {
      await emailService.sendWelcomeEmail(email, tempPassword);
    } catch (emailError) {
      // Nếu dịch vụ email sập, ta ghi log lỗi chi tiết cho Kỹ sư hệ thống kiểm tra
      console.error(
        `[Email Service Error] Thất bại khi gửi mật khẩu tạm cho ${email}:`,
        emailError,
      );
    }

    // Không trả về password trong kết quả phản hồi Client
    delete newUser.password;
    return newUser;
  }
  // BKAV HaiHS : tạo người dùng mới - end

  // BKAV HaiHS : logic nghiệp vụ lấy danh sách phân trang - start
  async getAllUsers(page, limit) {
    const skip = (page - 1) * limit;
    const take = limit;

    const { users, total } = await userRepository.findAndCountAll(skip, take);
    const totalPages = Math.ceil(total / limit);

    return {
      users,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  }
  // BKAV HaiHS : logic nghiệp vụ lấy danh sách phân trang - end

  // BKAV HaiHS : lấy chi tiết người dùng - start
  async getUserDetail(userId) {
    const user = await userRepository.findByIdDetailed(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }
    return user;
  }
  // BKAV HaiHS : lấy chi tiết người dùng - end

  // BKAV HaiHS : cập nhật người dùng - start
  async updateUser(userId, email, fullname, groupIds) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    const updateData = {};

    // Logic kiểm tra chặn trùng Email
    if (email && email !== user.email) {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        throw new AppError(ERROR.USER.EMAIL_EXISTS);
      }
      updateData.email = email;
    }

    if (fullname !== undefined) {
      updateData.fullname = fullname;
    }

    // Cập nhật danh sách Nhóm (Đã xóa parseInt dư thừa)
    if (groupIds) {
      updateData.groups = {
        set: groupIds.map((id) => ({ id })),
      };
    }

    return await userRepository.update(userId, updateData);
  }
  // BKAV HaiHS : cập nhật người dùng - end

  // BKAV HaiHS : xóa người dùng - start
  async deleteUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    return await userRepository.delete(userId);
  }
  // BKAV HaiHS : xóa người dùng - end

  // BKAV HaiHS : tìm người dùng - start
  async searchUsers(keyword, page, limit) {
    const skip = (page - 1) * limit;
    const take = limit;
    const cleanKeyword = keyword ? keyword.trim() : "";

    const { users, total } = await userRepository.searchAndCount({
      keyword: cleanKeyword,
      skip,
      take,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      users,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  }

  async updateMyProfile(userId, { phone, address }) {
    // 1. Kiểm tra tài khoản có tồn tại thực tế không
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    const updateData = {};
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    // 2. Gọi Repo cập nhật thông tin vào DB
    await userRepository.update(userId, updateData);

    // 3. Kéo lại thông tin User kèm theo các Nhóm (Groups) để bốc quyền ký lại Token
    const updatedUser = await userRepository.findByIdDetailed(userId);

    // 4. Hợp nhất danh sách quyền hạn thời gian thực
    const groupPerms = updatedUser.groups
      ? updatedUser.groups.flatMap((g) => g.permissions)
      : [];
    const allPermissions = [
      ...new Set([...updatedUser.permissions, ...groupPerms]),
    ];

    // 5. Tiến hành tái ký JWT Token mới
    const SECRET_KEY = process.env.JWT_SECRET || "Sieu_Mat_Ma_Cua_Toi_123";
    const newToken = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        permissions: allPermissions,
      },
      SECRET_KEY,
      { expiresIn: "24h" },
    );

    return {
      token: newToken,
      user: {
        email: updatedUser.email,
        fullname: updatedUser.fullname,
        phone: updatedUser.phone,
        address: updatedUser.address,
        permissions: allPermissions,
      },
    };
  }
}
// BKAV HaiHS : tìm người dùng - end

module.exports = new UserService();

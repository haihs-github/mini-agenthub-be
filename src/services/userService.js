const userRepository = require("../repositories/userRepository");
const emailService = require("./emailService");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const AppError = require("../errors/appError");
const ERROR = require("../constants/errorCodes");
const jwt = require("jsonwebtoken");
const redisStreamService = require("./redisStreamService");

// BKAV HaiHS : Định nghĩa lớp UserService quản lý các logic nghiệp vụ cho tài khoản người dùng - start
class UserService {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUserByAdmin(email, fullname, groupIds) {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError(ERROR.USER.EMAIL_EXISTS);
    }

    const tempPassword = crypto.randomBytes(4).toString("hex");
    console.log("tempPassword:" + tempPassword);

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const userData = {
      email,
      password: hashedPassword,
      fullname: fullname || null,
      permissions: ["CHAT", "CONV_C", "CONV_R", "CONV_U", "CONV_D"],
    };

    if (groupIds && groupIds.length > 0) {
      userData.groups = {
        connect: groupIds.map((id) => ({ id })),
      };
    }

    const newUser = await userRepository.create(userData);

    await this.#clearUserPagesCache();
    await this.#clearGroupPagesCache();
    await this.#clearGroupsProfilesCache(groupIds);

    try {
      await emailService.sendWelcomeEmail(email, tempPassword);
    } catch (emailError) {
      console.error(
        `[Email Service Error] Thất bại khi gửi mật khẩu tạm cho ${email}:`,
        emailError,
      );
    }

    delete newUser.password;

    await redisStreamService.cacheDelPattern("users:page:*");

    return newUser;
  }
  // BKAV HaiHS : tạo người dùng mới - end

  // BKAV HaiHS : logic nghiệp vụ lấy danh sách phân trang - start
  async getAllUsers(page, limit) {
    const cacheKey = `users:page:${page}:limit:${limit}:search:none`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const skip = this.#calculatePaginationSkip(page, limit);
    const take = limit;

    const { users, total } = await userRepository.findAndCountAll(skip, take);
    const totalPages = Math.ceil(total / limit);

    const result = {
      users,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        limit,
      },
    };

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(result), 300);
    return result;
  }
  // BKAV HaiHS : logic nghiệp vụ lấy danh sách phân trang - end

  // BKAV HaiHS : lấy chi tiết người dùng - start
  async getUserDetail(userId) {
    const cacheKey = `user:${userId}:profile`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const user = await userRepository.findByIdDetailed(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(user), 86400);
    return user;
  }
  // BKAV HaiHS : lấy chi tiết người dùng - end

  // BKAV HaiHS : cập nhật người dùng - start
  async updateUser(userId, email, fullname, groupIds) {
    const userWithGroups = await userRepository.findByIdDetailed(userId);
    if (!userWithGroups) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }
    const previousGroupIds = userWithGroups.groups?.map((g) => g.id) || [];

    const updateData = {};

    if (email && email !== userWithGroups.email) {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        throw new AppError(ERROR.USER.EMAIL_EXISTS);
      }
      updateData.email = email;
    }

    if (fullname !== undefined) {
      updateData.fullname = fullname;
    }

    if (groupIds) {
      updateData.groups = {
        set: groupIds.map((id) => ({ id })),
      };
    }

    const result = await userRepository.update(userId, updateData);

    await this.#clearUserProfileCache(userId);
    await this.#clearUserPagesCache();
    await this.#clearGroupPagesCache();

    const allAffectedGroupIds = new Set([
      ...previousGroupIds,
      ...(groupIds || []),
    ]);
    await this.#clearGroupsProfilesCache([...allAffectedGroupIds]);

    return result;
  }
  // BKAV HaiHS : cập nhật người dùng - end

  // BKAV HaiHS : xóa người dùng - start
  async deleteUser(userId) {
    const userWithGroups = await userRepository.findByIdDetailed(userId);
    if (!userWithGroups) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }
    const affectedGroupIds = userWithGroups.groups?.map((g) => g.id) || [];

    const result = await userRepository.delete(userId);

    await this.#clearUserProfileCache(userId);
    await this.#clearUserPagesCache();
    await this.#clearGroupPagesCache();
    await this.#clearGroupsProfilesCache(affectedGroupIds);

    return result;
  }
  // BKAV HaiHS : xóa người dùng - end

  // BKAV HaiHS : tìm người dùng - start
  async searchUsers(keyword, page, limit) {
    const cleanKeyword = keyword ? keyword.trim() : "";
    const cacheKey = `users:page:${page}:limit:${limit}:search:${encodeURIComponent(cleanKeyword)}`;
    const cached = await redisStreamService.cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const skip = this.#calculatePaginationSkip(page, limit);
    const take = limit;

    const { users, total } = await userRepository.searchAndCount({
      keyword: cleanKeyword,
      skip,
      take,
    });

    const totalPages = Math.ceil(total / limit);

    const result = {
      users,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: page,
        limit,
      },
    };

    await redisStreamService.cacheSet(cacheKey, JSON.stringify(result), 300);
    return result;
  }
  // BKAV HaiHS : tìm người dùng - end

  // BKAV HaiHS : Tự cập nhật thông tin cá nhân (phone, address) - start
  async updateMyProfile(userId, { phone, address }) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    const updateData = {};
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    await userRepository.update(userId, updateData);

    const updatedUser = await userRepository.findByIdDetailed(userId);

    const groupPerms = updatedUser.groups
      ? updatedUser.groups.flatMap((g) => g.permissions)
      : [];
    const allPermissions = [
      ...new Set([...updatedUser.permissions, ...groupPerms]),
    ];

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

    await this.#clearUserProfileCache(userId);
    await redisStreamService.cacheDelPattern("users:page:*");

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
  // BKAV HaiHS : Tự cập nhật thông tin cá nhân (phone, address) - end

  // BKAV HaiHS : Logic tự xóa tài khoản - start
  async deleteMyAccount(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(ERROR.USER.NOT_FOUND);
    }

    const result = await userRepository.delete(userId);

    await this.#clearUserProfileCache(userId);
    await redisStreamService.cacheDelPattern("users:page:*");

    return result;
  }
  // BKAV HaiHS : Logic tự xóa tài khoản - end

  // BKAV HaiHS : Hàm phụ tính toán skip phân trang người dùng - start
  #calculatePaginationSkip(page, limit) {
    return (page - 1) * limit;
  }
  // BKAV HaiHS : Hàm phụ tính toán skip phân trang người dùng - end

  // BKAV HaiHS : Hàm phụ xóa cache danh sách phân trang người dùng - start
  async #clearUserPagesCache() {
    await redisStreamService.cacheDelPattern("users:page:*");
    await redisStreamService.cacheDelPattern("users:page:*:search:*");
  }
  // BKAV HaiHS : Hàm phụ xóa cache danh sách phân trang người dùng - end

  // BKAV HaiHS : Hàm phụ xóa cache danh sách phân trang nhóm - start
  async #clearGroupPagesCache() {
    await redisStreamService.cacheDelPattern("groups:page:*");
    await redisStreamService.cacheDelPattern("groups:page:*:search:*");
  }
  // BKAV HaiHS : Hàm phụ xóa cache danh sách phân trang nhóm - end

  // BKAV HaiHS : Hàm phụ dọn dẹp cache profile và permissions của user - start
  async #clearUserProfileCache(userId) {
    await redisStreamService.cacheDel(`user:${userId}:profile`);
    await redisStreamService.cacheDel(`user:${userId}:permissions`);
  }
  // BKAV HaiHS : Hàm phụ dọn dẹp cache profile và permissions của user - end

  // BKAV HaiHS : Hàm phụ xóa cache của một danh sách nhóm quyền - start
  async #clearGroupsProfilesCache(groupIds) {
    if (groupIds && groupIds.length > 0) {
      for (const gId of groupIds) {
        await redisStreamService.cacheDel(`group:${gId}:profile`);
      }
    }
  }
  // BKAV HaiHS : Hàm phụ xóa cache của một danh sách nhóm quyền - end
}
// BKAV HaiHS : Định nghĩa lớp UserService quản lý các logic nghiệp vụ cho tài khoản người dùng - end

module.exports = new UserService();

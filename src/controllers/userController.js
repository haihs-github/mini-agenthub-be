const userService = require("../services/userService");
const { MESSAGES } = require("../constants/messages");

// BKAV HaiHS : Định nghĩa lớp UserController quản lý thông tin người dùng và tài khoản - start
class UserController {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUser(req, res, next) {
    try {
      const email = req.body.email?.trim().toLowerCase();
      const fullname = req.body.fullname?.trim();
      const rawGroupIds = req.body.groupIds;

      if (!email) {
        return res.status(400).json({ message: MESSAGES.USER.EMPTY_EMAIL });
      }
      if (!fullname) {
        return res.status(400).json({ message: MESSAGES.USER.EMPTY_NAME });
      }

      if (!this.#isValidEmail(email)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_EMAIL });
      }

      let groupIds = [];
      if (rawGroupIds) {
        const parsed = this.#parseGroupIds(rawGroupIds);
        if (parsed === null) {
          return res.status(400).json({
            message: MESSAGES.USER.INVALID_ARRAY,
          });
        }
        groupIds = parsed;
      }

      const result = await userService.createUserByAdmin(
        email,
        fullname,
        groupIds,
      );

      res.status(201).json({
        message: MESSAGES.USER.CREATE,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : tạo người dùng mới - end

  // BKAV HaiHS : lấy danh sách người dùng phân trang - start
  async getAllUsers(req, res, next) {
    try {
      const { page: rawPage, limit: rawLimit } = req.query;

      const { page, limit } = this.#parsePagination(rawPage, rawLimit, 10);

      const result = await userService.getAllUsers(page, limit);

      res.status(200).json({
        message: MESSAGES.USER.GET_LIST,
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : lấy danh sách người dùng phân trang - end

  // BKAV HaiHS : lấy chi tiết người dùng - start
  async getUserDetail(req, res, next) {
    try {
      const userId = parseInt(req.params.id);

      if (!this.#validateUserId(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      const result = await userService.getUserDetail(userId);

      res.status(200).json({
        message: MESSAGES.USER.GET_DETAIL,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : lấy chi tiết người dùng - end

  // BKAV HaiHS : cập nhật người dùng - start
  async updateUser(req, res, next) {
    try {
      const userId = parseInt(req.params.id);
      const email = req.body.email?.trim().toLowerCase();
      const fullname = req.body.fullname?.trim();
      const rawGroupIds = req.body.groupIds;

      if (!this.#validateUserId(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      if (email && !this.#isValidEmail(email)) {
        return res
          .status(400)
          .json({ message: MESSAGES.USER.INVALID_NEW_EMAIL });
      }

      if (fullname !== undefined && fullname === "") {
        return res.status(400).json({ message: MESSAGES.USER.EMPTY_NAME });
      }

      let groupIds;
      if (rawGroupIds) {
        const parsed = this.#parseGroupIds(rawGroupIds);
        if (parsed === null) {
          return res.status(400).json({
            message: MESSAGES.USER.INVALID_ARRAY,
          });
        }
        groupIds = parsed;
      }

      const result = await userService.updateUser(
        userId,
        email,
        fullname,
        groupIds,
      );

      res.status(200).json({
        message: MESSAGES.USER.UPDATE,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : cập nhật người dùng - end

  // BKAV HaiHS : xóa người dùng - start
  async deleteUser(req, res, next) {
    try {
      const userId = parseInt(req.params.id);

      if (!this.#validateUserId(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      await userService.deleteUser(userId);

      res.status(200).json({
        message: MESSAGES.USER.DELETE,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xóa người dùng - end

  // BKAV HaiHS : tìm kiếm và phân trang người dùng - start
  async searchUsers(req, res, next) {
    try {
      const keyword = req.query.keyword?.trim() || "";
      const { page: rawPage, limit: rawLimit } = req.query;

      const { page, limit } = this.#parsePagination(rawPage, rawLimit, 10);

      const result = await userService.searchUsers(keyword, page, limit);

      res.status(200).json({
        message: MESSAGES.USER.SEARCH,
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : tìm kiếm và phân trang người dùng - end

  // BKAV HaiHS : Tự cập nhật thông tin cá nhân (phone, address) - start
  async updateMyProfile(req, res, next) {
    try {
      const userId = parseInt(req.userId);
      const phone = req.body.phone?.trim();
      const address = req.body.address?.trim();

      if (phone && !this.#isValidPhone(phone)) {
        return res.status(400).json({
          message: MESSAGES.USER.INVALID_PHONE,
        });
      }

      const result = await userService.updateMyProfile(userId, {
        phone,
        address,
      });

      res.status(200).json({
        message: MESSAGES.USER.UPDATE_PROFILE,
        data: {
          token: result.token,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Tự cập nhật thông tin cá nhân - end

  // BKAV HaiHS : Tự xóa tài khoản của chính mình - start
  async deleteMyAccount(req, res, next) {
    try {
      const userId = parseInt(req.userId);

      if (!this.#validateUserId(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      await userService.deleteMyAccount(userId);

      res.status(200).json({
        message: MESSAGES.USER.DELETE_MY_ACCOUNT,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Tự xóa tài khoản của chính mình - end

  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của User ID - start
  #validateUserId(userId) {
    return !isNaN(userId);
  }
  // BKAV HaiHS : Hàm phụ kiểm tra tính hợp lệ của User ID - end

  // BKAV HaiHS : Hàm phụ kiểm tra định dạng email - start
  #isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  // BKAV HaiHS : Hàm phụ kiểm tra định dạng email - end

  // BKAV HaiHS : Hàm phụ kiểm tra số điện thoại (10 chữ số) - start
  #isValidPhone(phone) {
    const phoneRegex = /^\d{10}$/;
    return phoneRegex.test(phone);
  }
  // BKAV HaiHS : Hàm phụ kiểm tra số điện thoại (10 chữ số) - end

  // BKAV HaiHS : Hàm phụ chuẩn hóa và kiểm tra mảng groupIds - start
  #parseGroupIds(groupIds) {
    if (!groupIds || !Array.isArray(groupIds)) {
      return null;
    }
    return groupIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
  }
  // BKAV HaiHS : Hàm phụ chuẩn hóa và kiểm tra mảng groupIds - end

  // BKAV HaiHS : Hàm phụ chuẩn hóa tham số phân trang - start
  #parsePagination(page, limit, defaultLimit) {
    let parsedPage = parseInt(page) || 1;
    let parsedLimit = parseInt(limit) || defaultLimit;

    if (parsedPage < 1) parsedPage = 1;
    if (parsedLimit < 1) parsedLimit = defaultLimit;
    if (parsedLimit > 100) parsedLimit = 100;

    return { page: parsedPage, limit: parsedLimit };
  }
  // BKAV HaiHS : Hàm phụ chuẩn hóa tham số phân trang - end
}
// BKAV HaiHS : Định nghĩa lớp UserController quản lý thông tin người dùng và tài khoản - end

module.exports = new UserController();

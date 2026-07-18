const userService = require("../services/userService");
const { MESSAGES } = require("../constants/messages");

class UserController {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUser(req, res, next) {
    try {
      // Lấy dữ liệu và chuẩn hóa
      const email = req.body.email?.trim().toLowerCase();
      const fullname = req.body.fullname?.trim();
      let groupIds = req.body.groupIds;

      // Kiểm tra các trường bắt buộc
      if (!email) {
        return res.status(400).json({ message: MESSAGES.USER.EMPTY_EMAIL });
      }
      if (!fullname) {
        return res.status(400).json({ message: MESSAGES.USER.EMPTY_NAME });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_EMAIL });
      }

      if (groupIds) {
        if (!Array.isArray(groupIds)) {
          return res.status(400).json({
            message: MESSAGES.USER.INVALID_ARRAY,
          });
        }
        groupIds = groupIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
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
      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100;

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

      if (isNaN(userId)) {
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
      let groupIds = req.body.groupIds;

      if (isNaN(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res
            .status(400)
            .json({ message: "Định dạng Email mới không hợp lệ!" });
        }
      }

      if (fullname !== undefined && fullname === "") {
        return res
          .status(400)
          .json({ message: "Họ và tên không được để trống!" });
      }

      if (groupIds) {
        if (!Array.isArray(groupIds)) {
          return res.status(400).json({
            message: MESSAGES.USER.INVALID_ARRAY,
          });
        }
        groupIds = groupIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
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

      if (isNaN(userId)) {
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
      let { page, limit } = req.query;

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100;

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
      // nhận dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.userId);
      const phone = req.body.phone?.trim();
      const address = req.body.address?.trim();

      if (phone) {
        const phoneRegex = /^\d{10}$/; // Chỉ chứa số và có đúng 10 ký tự
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({
            message:
              "Số điện thoại không hợp lệ! Bản chất phải chứa đúng 10 chữ số.",
          });
        }
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

      if (isNaN(userId)) {
        return res.status(400).json({ message: MESSAGES.USER.INVALID_ID });
      }

      // gọi hàm deleteMyAccount của userService để xóa tài khoản cá nhân
      await userService.deleteMyAccount(userId);

      // trả về kết quả cho người dùng
      res.status(200).json({
        message: MESSAGES.USER.DELETE_MY_ACCOUNT,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Tự xóa tài khoản của chính mình - end
}

module.exports = new UserController();

const userService = require("../services/userService");

class UserController {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUser(req, res, next) {
    try {
      // Lấy và chuẩn hóa dữ liệu chuỗi ngay tại Controller
      const email = req.body.email?.trim();
      const fullname = req.body.fullname?.trim();
      let groupIds = req.body.groupIds;

      // VALIDATE: Kiểm tra các trường bắt buộc
      if (!email) {
        return res.status(400).json({ message: "Bắt buộc phải nhập Email!" });
      }

      // VALIDATE: Kiểm tra định dạng cấu trúc Email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res
          .status(400)
          .json({ message: "Định dạng Email không hợp lệ!" });
      }

      // VALIDATE & ÉP KIỂU: Xử lý mảng groupIds đầu vào nếu có
      if (groupIds) {
        if (!Array.isArray(groupIds)) {
          return res.status(400).json({
            message: "Dữ liệu groupIds truyền lên bắt buộc phải là một mảng!",
          });
        }
        groupIds = groupIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      // Giao việc cho Service với dữ liệu đầu vào đã chuẩn hóa 100%
      const result = await userService.createUserByAdmin(
        email,
        fullname,
        groupIds,
      );

      res.status(201).json({
        message: "Tạo tài khoản và gửi Email thành công!",
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

      // Chốt chặn nghiêm ngặt giới hạn phân trang bảo vệ Database
      if (page < 1) page = 1;
      if (limit < 1) limit = 10;

      const result = await userService.getAllUsers(page, limit);

      res.status(200).json({
        message: "Lấy danh sách người dùng thành công!",
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
      // Ép kiểu ID từ URL về số nguyên nguyên bản ngay tại Controller
      const userId = parseInt(req.params.id);

      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "ID người dùng phải là một số nguyên hợp lệ!" });
      }

      const result = await userService.getUserDetail(userId);

      res.status(200).json({
        message: "Lấy thông tin chi tiết người dùng thành công!",
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
      const email = req.body.email?.trim();
      const fullname = req.body.fullname?.trim();
      let groupIds = req.body.groupIds;

      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "ID người dùng phải là một số nguyên hợp lệ!" });
      }

      // Kiểm tra định dạng Email nếu người dùng có truyền lên để cập nhật
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res
            .status(400)
            .json({ message: "Định dạng Email mới không hợp lệ!" });
        }
      }

      if (groupIds) {
        if (!Array.isArray(groupIds)) {
          return res.status(400).json({
            message: "Dữ liệu groupIds truyền lên bắt buộc phải là một mảng!",
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
        message: "Cập nhật thông tin người dùng thành công!",
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
        return res
          .status(400)
          .json({ message: "ID người dùng phải là một số nguyên hợp lệ!" });
      }

      await userService.deleteUser(userId);

      res.status(200).json({
        message: "Xóa tài khoản người dùng thành công!",
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

      // ĐÃ SỬA [tienpv]: Bổ sung kiểm tra giới hạn dưới và giới hạn trên phân trang cho API Search
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100;

      const result = await userService.searchUsers(keyword, page, limit);

      res.status(200).json({
        message: "Tìm kiếm người dùng thành công!",
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

      // 1. VALIDATE: Nếu người dùng có truyền số điện thoại, bắt buộc phải đúng định dạng
      if (phone) {
        const phoneRegex = /^\d{10}$/; // Chỉ chứa số và có đúng 10 ký tự
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({
            message:
              "Số điện thoại không hợp lệ! Bản chất phải chứa đúng 10 chữ số.",
          });
        }
      }

      // 2. Giao việc cho Service xử lý với dữ liệu đã được nén sạch
      const result = await userService.updateMyProfile(userId, {
        phone,
        address,
      });

      // 3. Trả về Token mới để Frontend cập nhật lại trạng thái đăng nhập
      res.status(200).json({
        message: "Cập nhật thông tin cá nhân thành công!",
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
      // Trích xuất danh tính tuyệt đối an toàn từ Token
      const userId = parseInt(req.userId);

      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "Danh tính người dùng không hợp lệ!" });
      }

      // Bàn giao việc cho Service xử lý logic nghiệp vụ
      await userService.deleteMyAccount(userId);

      res.status(200).json({
        message:
          "Xóa tài khoản cá nhân của bạn thành công! Toàn bộ lịch sử và dữ liệu liên quan đã được hủy bỏ hoàn toàn.",
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Tự xóa tài khoản của chính mình - end
}

module.exports = new UserController();

const userService = require("../services/userService");

class UserController {
  // BKAV HaiHS : tạo người dùng mới - start
  async createUser(req, res, next) {
    try {
      // Lấy dữ liệu và chuẩn hóa
      const email = req.body.email?.trim();
      const fullname = req.body.fullname?.trim();
      let groupIds = req.body.groupIds;

      // Kiểm tra các trường bắt buộc
      if (!email) {
        return res.status(400).json({ message: "Bắt buộc phải nhập Email!" });
      }

      // Kiểm tra định dạng cấu trúc Email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res
          .status(400)
          .json({ message: "Định dạng Email không hợp lệ!" });
      }

      // Kiểm tra và ép kiểu mảng groupIds đầu vào nếu có
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

      // gọi hàm createUserByAdmin của userService để tạo người dùng mới
      const result = await userService.createUserByAdmin(
        email,
        fullname,
        groupIds,
      );

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa
      let { page, limit } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      // Kiểm tra các giới hạn trên và dưới khi phân trang
      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100; // Bảo vệ hệ thống khỏi bão càn quét dữ liệu lớn

      // gọi hàm getAllUsers của userService để lấy danh sách người dùng có phân trang
      const result = await userService.getAllUsers(page, limit);

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.params.id);

      // Kiểm tra xem userId có phải là số nguyên không?
      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "ID người dùng phải là một số nguyên hợp lệ!" });
      }
      // gọi hàm getUserDetail của userService để lấy chi tiết thông tin người dùng
      const result = await userService.getUserDetail(userId);

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.params.id);
      const email = req.body.email?.trim();
      const fullname = req.body.fullname?.trim();
      let groupIds = req.body.groupIds;

      // Kiểm tra xem userId có phải là số nguyên không?
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

      // Kiểm tra và ép kiểu mảng groupIds đầu vào nếu có
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

      // gọi hàm updateUser của userService để cập nhật thông tin người dùng
      const result = await userService.updateUser(
        userId,
        email,
        fullname,
        groupIds,
      );

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.params.id);

      // Kiểm tra xem userId có phải là số nguyên không?
      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "ID người dùng phải là một số nguyên hợp lệ!" });
      }

      // gọi hàm deleteUser của userService để xóa người dùng
      await userService.deleteUser(userId);

      // trả về kết quả cho người dùng
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
      // lấy dữ liệu từ req và chuẩn hóa
      const keyword = req.query.keyword?.trim() || "";
      let { page, limit } = req.query;

      // ĐÃ SỬA [tienpv]: Bổ sung kiểm tra giới hạn dưới và giới hạn trên phân trang cho API Search
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      if (page < 1) page = 1;
      if (limit < 1) limit = 10;
      if (limit > 100) limit = 100;

      // gọi hàm searchUsers của userService để tìm kiếm người dùng theo từ khóa và phân trang
      const result = await userService.searchUsers(keyword, page, limit);

      // trả về kết quả cho người dùng
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
      // nhận dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.userId);
      const phone = req.body.phone?.trim();
      const address = req.body.address?.trim();

      // Nếu người dùng có truyền số điện thoại, bắt buộc phải đúng định dạng
      if (phone) {
        const phoneRegex = /^\d{10}$/; // Chỉ chứa số và có đúng 10 ký tự
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({
            message:
              "Số điện thoại không hợp lệ! Bản chất phải chứa đúng 10 chữ số.",
          });
        }
      }

      // gọi hàm updateMyProfile của userService để cập nhật thông tin cá nhân
      const result = await userService.updateMyProfile(userId, {
        phone,
        address,
      });

      // trả về kết quả cho người dùng
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
      // nhận dữ liệu từ req và chuẩn hóa
      const userId = parseInt(req.userId);

      // kiểm tra xem userId có phải là số nguyên không?
      if (isNaN(userId)) {
        return res
          .status(400)
          .json({ message: "Danh tính người dùng không hợp lệ!" });
      }

      // gọi hàm deleteMyAccount của userService để xóa tài khoản cá nhân
      await userService.deleteMyAccount(userId);

      // trả về kết quả cho người dùng
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

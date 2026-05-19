const userService = require('../services/userService');

class UserController {
// BKAV HaiHS : tạo người dùng mới - start
  async createUser(req, res, next) {
    try {
      const { email, permissions } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Bắt buộc phải nhập Email!" });
      }

      // Giao việc cho Service
      const result = await userService.createUserByAdmin(email, permissions);

      res.status(201).json({
        message: "Tạo tài khoản và gửi Email thành công!",
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
// BKAV HaiHS : tạo người dùng mới - end
}

module.exports = new UserController();
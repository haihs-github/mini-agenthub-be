const groupService = require("../services/groupService");

class GroupController {
  // BKAV HaiHS : Xử lý tạo nhóm mới - start
  async createGroup(req, res, next) {
    try {
      // Lấy thêm userIds từ Body do Client gửi lên
      const { name, permissions, userIds } = req.body;

      // Kiểm tra dữ liệu đầu vào bắt buộc
      if (!name) {
        return res
          .status(400)
          .json({ message: "Bắt buộc phải nhập tên Nhóm (name)!" });
      }

      // Kiểm tra định dạng dữ liệu userIds nếu admin có truyền lên
      if (userIds && !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // Đẩy việc xuống tầng Service
      const result = await groupService.createGroup(name, permissions, userIds);

      res.status(201).json({
        message: "Tạo Nhóm mới và gán thành viên thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : Xử lý tao nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID nhóm từ URL
      const { name, permissions } = req.body; // Lấy cả name và permissions từ Body

      // Gọi Service xử lý logic nghiệp vụ nặng đầu
      const result = await groupService.updateGroup(id, name, permissions);

      res.status(200).json({
        message: "Cập nhật thông tin Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra errorHandler
    }
  }
  //   BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsers(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID Nhóm từ URL
      const { userIds } = req.body; // Lấy mảng ID người dùng từ Body

      // Kiểm tra dữ liệu đầu vào bắt buộc phải là mảng
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // Gọi Service xử lý
      const result = await groupService.addUsersToGroup(id, userIds);

      res.status(200).json({
        message: "Thêm các thành viên vào Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Gửi lỗi sang errorHandler gánh
    }
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end

  // BKAV HaiHS : xử lý xóa nhóm - start
  async deleteGroup(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID nhóm cần xóa từ URL

      // Giao việc cho Service xử lý logic nghiệp vụ
      await groupService.deleteGroup(id);

      res.status(200).json({
        message: "Xóa Nhóm thành công!",
      });
    } catch (error) {
      next(error); // Đẩy lỗi ra errorHandler
    }
  }
  // BKAV HaiHS : xử lý xóa nhóm - end

  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start
  async removeUsers(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID Nhóm từ URL
      const { userIds } = req.body; // Lấy mảng ID người dùng cần xóa từ Body

      // Kiểm tra dữ liệu đầu vào bắt buộc phải là mảng
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",
        });
      }

      // Đẩy việc xuống tầng Service xử lý
      const result = await groupService.removeUsersFromGroup(id, userIds);

      res.status(200).json({
        message: "Xóa các thành viên khỏi Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Gửi lỗi sang errorHandler
    }
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(req, res, next) {
    try {
      // Lấy tham số từ URL dạng: /api/groups?page=1&limit=5
      let { page, limit } = req.query;

      // Ép kiểu về số nguyên, nếu không truyền hoặc truyền sai thì lấy mặc định (Trang 1, mỗi trang 10 phần tử)
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;

      // Chặn trường hợp người dùng cố tình truyền số âm
      if (page < 1) page = 1;
      if (limit < 1) limit = 10;

      // Bàn giao cho tầng Service xử lý tính toán
      const result = await groupService.getAllGroups(page, limit);

      // Trả kết quả chuẩn RESTful
      res.status(200).json({
        message: "Lấy danh sách Nhóm thành công!",
        data: result.groups,
        pagination: result.pagination, // Gửi kèm thông tin phân trang cho Frontend vẽ nút bấm
      });
    } catch (error) {
      next(error);
    }
  }
  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - end

  // BKAV HaiHS : xử lý lấy chi tiết thông tin nhóm - start
  async getGroupDetail(req, res, next) {
    try {
      const { id } = req.params; // Lấy ID nhóm từ URL (ví dụ: /api/groups/1)

      // Đẩy việc xuống tầng Service
      const result = await groupService.getGroupDetail(id);

      // Trả kết quả thành công cho Client
      res.status(200).json({
        message: "Lấy chi tiết thông tin Nhóm thành công!",
        data: result,
      });
    } catch (error) {
      next(error); // Nếu có lỗi (ví dụ: GROUP_NOT_FOUND), đẩy ra errorHandler xử lý
    }
  }
  // BKAV HaiHS : xử lý lấy chi tiết thông tin nhóm - end
}

module.exports = new GroupController();

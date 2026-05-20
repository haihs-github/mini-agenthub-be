// BKAV HaiHS : Middleware xử lý lỗi - start
const errorHandler = (err, req, res, next) => {
  console.error("Lỗi hệ thống:", err.message);

  // Phân loại lỗi từ Service để trả về mã status phù hợp
  if (err.message === "USER_NOT_FOUND" || err.message === "WRONG_PASSWORD") {
    return res
      .status(401)
      .json({ message: "Email hoặc mật khẩu không chính xác!" });
  }

  // lỗi trùng email khi tạo user mới
  if (err.message === "EMAIL_ALREADY_EXISTS") {
    return res
      .status(409)
      .json({ message: "Email này đã tồn tại trong hệ thống!" });
  }

  // lỗi sai mật khẩu cũ khi đổi mật khẩu
  if (err.message === "WRONG_OLD_PASSWORD") {
    return res.status(400).json({ message: "Mật khẩu cũ không chính xác!" });
  }

  // Lỗi trùng tên nhóm khi tạo nhóm mới
  if (err.message === "GROUP_ALREADY_EXISTS") {
    return res
      .status(409)
      .json({ message: "Tên nhóm này đã tồn tại trên hệ thống!" });
  }

  // lỗi không tìm thấy nhóm khi cập nhật quyền cho nhóm
  if (err.message === "GROUP_NOT_FOUND") {
    return res
      .status(404)
      .json({ message: "Không tìm thấy Nhóm yêu cầu trên hệ thống!" });
  }

  // Các lỗi còn lại
  return res
    .status(500)
    .json({ message: "Lỗi hệ thống nội bộ", error: err.message });
};
// BKAV HaiHS : Middleware xử lý lỗi - end

module.exports = errorHandler;

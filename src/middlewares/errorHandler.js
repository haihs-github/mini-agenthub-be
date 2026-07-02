// BKAV HaiHS : Middleware xử lý lỗi tập trung đạt chuẩn Enterprise - start
const errorHandler = (err, req, res, next) => {
  //Lỗi Operational công khai (Lỗi do mình chủ động tạo ra ở tầng Service/Controller)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: "fail",
      code: err.errorCode, // Mã lỗi định danh
      message: err.message, // Message sạch
    });
  }

  // Lỗi Hệ thống ẩn danh (Lỗi 500, lỗi sập DB, crash luồng, lỗi cú pháp thư viện bên thứ 3)
  // Log toàn bộ Stack Trace chi tiết ra Console
  console.error("LỖI HỆ THỐNG NGHIÊM TRỌNG (500):", err);

  // giảú lỗi với người dùng
  return res.status(500).json({
    status: "error",
    code: "INTERNAL_SERVER_ERROR",
    message: "Hệ thống đang gặp sự cố, vui lòng thử lại sau ít phút!",
  });
};
// BKAV HaiHS : Middleware xử lý lỗi tập trung - end

module.exports = errorHandler;

const jwt = require("jsonwebtoken");

// BKAV HaiHS : middleware xác thực token người dùng - start
const authMiddleware = (req, res, next) => {
  // 1. Lấy token từ header "Authorization" (Định dạng chuẩn: Bearer <token>)
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  // Nếu không có token thì chặn truy cập
  if (!token) {
    return res
      .status(401)
      .json({ message: "Bạn cần đăng nhập để thực hiện hành động này!" });
  }

  try {
    // 2. Giải mã token xem có hợp lệ không
    const SECRET_KEY = process.env.JWT_SECRET || "Sieu_Mat_Ma_Cua_Toi_123";
    const decoded = jwt.verify(token, SECRET_KEY);

    // 3. Đính kèm ID người dùng vào req để các tầng sau (Controller/Service) biết ai đang gọi
    req.user = decoded; //Lưu toàn bộ thông tin đã giải mã (id, email, permissions) vào req.user
    req.userId = decoded.id;

    next(); // Cho phép đi tiếp vào Controller
  } catch (error) {
    return res
      .status(403)
      .json({ message: "Thẻ bài (Token) đã hết hạn hoặc không hợp lệ!" });
  }
};
// BKAV HaiHS : middleware xác thực token người dùng - end

module.exports = authMiddleware;

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// BKAV HaiHS - Tạo thư mục uploads nếu chưa tồn tại - start
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// BKAV HaiHS - Tạo thư mục uploads nếu chưa tồn tại - end

// BKAV HaiHS - Cấu hình multer để lưu trữ ảnh vào thư mục uploads - start
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Đặt tên file độc bản bằng timestamp + chuỗi ngẫu nhiên để tránh trùng lặp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
// BKAV HaiHS - Cấu hình multer để lưu trữ ảnh vào thư mục uploads - end

// BKAV HaiHS - Lọc file để chỉ chấp nhận các định dạng ảnh JPEG, PNG và WEBP - start
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận định dạng ảnh JPEG, PNG hoặc WEBP!"), false);
  }
};
// BKAV HaiHS - Lọc file để chỉ chấp nhận các định dạng ảnh JPEG, PNG và WEBP - end

// BKAV HaiHS - middleware upload với cấu hình đã thiết lập - start
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn tối đa 5MB / một ảnh
});
// BKAV HaiHS - middleware upload với cấu hình đã thiết lập - end

module.exports = upload;

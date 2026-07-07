const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const authController = require("../controllers/authController");
const {
  authLimiter,
  refreshLimiter,
} = require("../middlewares/rateLimitMiddleware");

// API đăng nhập
router.post("/login", authLimiter, authController.login);

// API làm mới Access Token (Gia hạn phiên)
router.post("/refresh", refreshLimiter, authController.refresh);

// API đăng xuất (Xóa phiên ở DB và cookie)
router.post("/logout", authController.logout);

// API đổi mật khẩu
router.put(
  "/change-password",
  authMiddleware,
  authLimiter,
  authController.changePassword,
);

module.exports = router;

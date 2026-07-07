const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const userController = require("../controllers/userController");
const {
  heavyQueryLimiter,
  writeDbLimiter,
} = require("../middlewares/rateLimitMiddleware");

// BKAV HaiHS : API lấy danh sách người dùng - start
router.get(
  "/",
  authMiddleware,
  permissionMiddleware("USER_R"),
  heavyQueryLimiter,
  userController.getAllUsers,
);
// BKAV HaiHS : API lấy danh sách người dùng - end

// BKAV HaiHS : API Admin tạo User mới - start
router.post(
  "/create",
  authMiddleware,
  permissionMiddleware("USER_C"),
  writeDbLimiter,
  userController.createUser,
);
// BKAV HaiHS : API Admin tạo User mới - end

// BKAV HaiHS : API tìm kiếm người dùng - start
router.get(
  "/search",
  authMiddleware,
  permissionMiddleware("USER_R"),
  heavyQueryLimiter,
  userController.searchUsers,
);
// BKAV HaiHS : API tìm kiếm người dùng - end

// BKAV HaiHS : API lấy chi tiết người dùng - start
router.get(
  "/:id",
  authMiddleware,
  permissionMiddleware("USER_R"),
  userController.getUserDetail,
);
// BKAV HaiHS : API lấy chi tiết người dùng - end

// API tự cập nhật thông tin bản thân (Cần đăng nhập) - start
router.put(
  "/profile",
  authMiddleware,
  writeDbLimiter,
  userController.updateMyProfile,
);
// API tự cập nhật thông tin bản thân (Cần đăng nhập) - start

// BKAV HaiHS : API cập nhật người dùng - start
router.put(
  "/:id",
  authMiddleware,
  permissionMiddleware("USER_U"),
  writeDbLimiter,
  userController.updateUser,
);
// BKAV HaiHS : API cập nhật người dùng - start

// BKAV HaiHS : API xóa tài khoản người dùng - start
router.delete(
  "/profile",
  authMiddleware,
  writeDbLimiter,
  userController.deleteMyAccount,
);
// BKAV HaiHS : API xóa tài khoản người dùng - end

// BKAV HaiHS : API xóa người dùng - start
router.delete(
  "/:id",
  authMiddleware,
  permissionMiddleware("USER_D"),
  writeDbLimiter,
  userController.deleteUser,
);
// BKAV HaiHS : API xóa người dùng - end

module.exports = router;

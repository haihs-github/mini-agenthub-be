const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const userController = require("../controllers/userController");

// BKAV HaiHS : API lấy danh sách người dùng - start
router.get(
  "/",
  authMiddleware,
  permissionMiddleware("USER_R"),
  userController.getAllUsers,
);
// BKAV HaiHS : API lấy danh sách người dùng - end

// BKAV HaiHS : API Admin tạo User mới - start
router.post(
  "/create",
  authMiddleware,
  permissionMiddleware("USER_C"),
  userController.createUser,
);
// BKAV HaiHS : API Admin tạo User mới - end

// BKAV HaiHS : API lấy chi tiết người dùng - start
router.get(
  "/:id",
  authMiddleware,
  permissionMiddleware("USER_R"),
  userController.getUserDetail,
);
// BKAV HaiHS : API lấy chi tiết người dùng - end

// BKAV HaiHS : API cập nhật người dùng - start
router.put(
  "/:id",
  authMiddleware,
  permissionMiddleware("USER_U"),
  userController.updateUser,
);
// BKAV HaiHS : API cập nhật người dùng - start

module.exports = router;

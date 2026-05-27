const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");

// BKAV HaiHS : API Tạo nhóm: Phải Đăng nhập + Có quyền GROUP_C - start
router.post(
  "/create",
  authMiddleware,
  permissionMiddleware("GROUP_C"),
  groupController.createGroup,
);
// BKAV HaiHS : API Tạo nhóm: Phải Đăng nhập + Có quyền GROUP_C - end

// BKAV HaiHS : API Sửa quyền của nhóm (GROUP_U) - start
router.put(
  "/:id",
  authMiddleware,
  permissionMiddleware("GROUP_U"),
  groupController.updateGroup,
);
// BKAV HaiHS : API Sửa quyền của nhóm (GROUP_U) - end

// BKAV HaiHS :API Thêm nhiều thành viên vào nhóm (GROUP_ADD_USER) - start
router.post(
  "/:id/users",
  authMiddleware,
  permissionMiddleware("GROUP_ADD_USER"),
  groupController.addUsers,
);
// BKAV HaiHS :API Thêm nhiều thành viên vào nhóm (GROUP_ADD_USER) - end

module.exports = router;

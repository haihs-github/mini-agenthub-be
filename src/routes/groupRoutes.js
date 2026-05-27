const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");

// BKAV HaiHS : API Lấy danh sách nhóm - Phải Đăng nhập + Có quyền GROUP_R - start
router.get(
  "/",
  authMiddleware,
  permissionMiddleware("GROUP_R"),
  groupController.getAllGroups,
);
// BKAV HaiHS : API Lấy danh sách nhóm - Phải Đăng nhập + Có quyền GROUP_R - end

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

// BKAV HaiHS : API Xóa nhóm (GROUP_D) - start
router.delete(
  "/:id",
  authMiddleware,
  permissionMiddleware("GROUP_D"),
  groupController.deleteGroup,
);
// BKAV HaiHS : API Xóa nhóm (GROUP_D) - end

// BKAV HaiHS : API Xóa thành viên khỏi nhóm (GROUP_DELETE_USER) - start
router.delete(
  "/:id/users",
  authMiddleware,
  permissionMiddleware("GROUP_DELETE_USER"),
  groupController.removeUsers,
);
// BKAV HaiHS : API Xóa thành viên khỏi nhóm (GROUP_DELETE_USER) - end

module.exports = router;

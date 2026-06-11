const express = require("express");
const router = express.Router();
const conversationController = require("../controllers/conversationController");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const upload = require("../middlewares/uploadMiddleware");

// BKAV HaiHS : API Tạo phòng chat mới (CONV_C) - start
router.post(
  "/",
  authMiddleware,
  permissionMiddleware("CONV_C"),
  conversationController.createConversation,
);
// BKAV HaiHS : API Tạo phòng chat mới (CONV_C) - end

// BKAV HaiHS : API Lấy toàn bộ danh sách phòng chat của chính mình (CONV_R) - start
router.get(
  "/",
  authMiddleware,
  permissionMiddleware("CONV_R"),
  conversationController.getMyConversations,
);
// BKAV HaiHS : API Lấy toàn bộ danh sách phòng chat của chính mình (CONV_R) - end

// BKAV HaiHS : API Lấy chi tiết phòng chat kèm tin nhắn cũ của chính mình (CONV_R) - start
router.get(
  "/:id",
  authMiddleware,
  permissionMiddleware("CONV_R"),
  conversationController.getConversationDetail,
);
// BKAV HaiHS : API Lấy chi tiết phòng chat kèm tin nhắn cũ của chính mình (CONV_R) - start

// BKAV HaiHS : API Cập nhật tiêu đề phòng chat của chính mình (CONV_U) - start
router.put(
  "/:id",
  authMiddleware,
  permissionMiddleware("CONV_U"),
  conversationController.updateTitle,
);
// BKAV HaiHS : API Cập nhật tiêu đề phòng chat của chính mình (CONV_U) - end

// BKAV HaiHS : Xóa toàn bộ lịch sử chat - start
router.delete(
  "/",
  authMiddleware,
  permissionMiddleware("CONV_D"),
  conversationController.clearAllConversations,
);
// BKAV HaiHS : Xóa toàn bộ lịch sử chat - end

// BKAV HaiHS : API Xóa phòng chat của chính mình (CONV_D) - start
router.delete(
  "/:id",
  authMiddleware,
  permissionMiddleware("CONV_D"),
  conversationController.deleteConversation,
);
// BKAV HaiHS : API Xóa phòng chat của chính mình (CONV_D) - end

// BKAV HaiHS : API Xử lý Chat - start
router.post(
  "/:id/chat",
  authMiddleware,
  permissionMiddleware("CHAT"),
  upload.array("images", 5),
  conversationController.handleChat,
);
// BKAV HaiHS : API Xử lý Chat - end

module.exports = router;

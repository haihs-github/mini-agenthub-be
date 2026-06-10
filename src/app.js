const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const groupRoutes = require("./routes/groupRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const errorHandler = require("./middlewares/errorHandler");
const path = require("path");

const app = express();

// Middleware cấu hình chung
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Gắn các Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/conversations", conversationRoutes);

// Middleware xử lý lỗi luôn phải nằm ở DƯỚI CÙNG
app.use(errorHandler);

module.exports = app;

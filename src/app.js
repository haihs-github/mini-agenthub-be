// file khởi tạo và cấu hình ứng dụng express (Middleware, CORS, Route mapping)
const express = require("express");
const cors = require("cors");
// BKAV HaiHS : Import cookie-parser de doc cookie tu client - start
const cookieParser = require("cookie-parser");
// BKAV HaiHS : Import cookie-parser de doc cookie tu client - end
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const groupRoutes = require("./routes/groupRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const errorHandler = require("./middlewares/errorHandler");
const path = require("path");
// BKAV HaiHS : Import global rate limiter - start
const { generalLimiter } = require("./middlewares/rateLimitMiddleware");
// BKAV HaiHS : Import global rate limiter - end

const app = express();

// Middleware cấu hình chung
// BKAV HaiHS : Cap nhat CORS de cho phep gui kem cookie - start
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  }),
);
// BKAV HaiHS : Cap nhat CORS de cho phep gui kem cookie - end

// BKAV HaiHS : Su dung cookie-parser - start
app.use(cookieParser());
// BKAV HaiHS : Su dung cookie-parser - end

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// BKAV HaiHS : Ap dung rate limit chung cho tat ca cac api - start
app.use("/api", generalLimiter);
// BKAV HaiHS : Ap dung rate limit chung cho tat ca cac api - end

// Gắn các Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/conversations", conversationRoutes);

// Middleware xử lý lỗi luôn phải nằm ở DƯỚI CÙNG
app.use(errorHandler);

module.exports = app;

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Middleware cấu hình chung
app.use(cors());
app.use(express.json());

// Gắn các Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Middleware xử lý lỗi luôn phải nằm ở DƯỚI CÙNG
app.use(errorHandler);

module.exports = app;
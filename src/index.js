const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Bkav HaiHS :  Cấu hình Prisma kết nối với Database PostgreSQL - start
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
// Bkav HaiHS :  Cấu hình Prisma kết nối với Database PostgreSQL - end

const app = express();

app.use(cors()); 
app.use(express.json());

// Bkav HaiHS : Tạo một API đầu tiên để kiểm tra xem server - start
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'ok', 
      message: 'Máy chủ Mini AgentHub và Database đều đang hoạt động hoàn hảo!' 
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Lỗi kết nối DB', error: error.message });
  }
});
// Bkav HaiHS : Tạo một API đầu tiên để kiểm tra xem server - end

// Bkav HaiHS : chạy server ở cổng 3000 - start 
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy mượt mà tại http://localhost:${PORT}`);
});
// Bkav HaiHS : chạy server ở cổng 3000 - end 

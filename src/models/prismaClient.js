// cấu hình kết nối với postgresql bằng Prisma

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

// BKAV HaiHS : Cấu hình kết nối postgresql - start
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
// BKAV HaiHS : Cấu hình kết nối postgresql - end

module.exports = prisma;

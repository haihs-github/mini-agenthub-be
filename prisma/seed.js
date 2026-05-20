require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
console.log("DATABASE_URL đang dùng:", process.env.DATABASE_URL);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// bkav HaiHS : tạo tài khoản admin mặc định - start
async function main() {
  const adminEmail = "admin@agenthub.com";
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      permissions: [
        "USER_C",
        "USER_R",
        "USER_U",
        "USER_D",
        "GROUP_C",
        "GROUP_R",
        "GROUP_U",
        "GROUP_D",
        "GROUP_ADD_USER",
        "GROUP_DELETE_USER",
        "CHAT",
        "CONV_C",
        "CONV_R",
        "CONV_U",
        "CONV_D",
      ],
    },
  });

  console.log("Đã tạo tài khoản Admin mặc định:", admin.email);
}
// bkav HaiHS : tạo tài khoản admin mặc định - end

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

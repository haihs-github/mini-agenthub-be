// file seed data dữ liệu mẫu
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

// Khởi tạo kết nối
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Cấu hình thông tin đăng nhập cho tài khoản tối cao
  const adminEmail = "superadmin@agenthub.com";
  const hashedPassword = await bcrypt.hash("superadmin123", 10); // Mật khẩu đăng nhập
  const fullname = "Super Admin AgentHub";

  // Mảng chứa TOÀN BỘ tất cả mã quyền của hệ thống theo đúng tài liệu thiết kế SRS
  const allPermissions = [
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
  ];

  console.log("Bắt đầu luồng gieo hạt dữ liệu hệ thống (Seeding)...");

  // BKAV HaiHS : Tạo hoặc cập nhật nhóm "Super Admin" - start
  const adminGroup = await prisma.group.upsert({
    where: { name: "Super Admin" },
    update: { permissions: allPermissions },
    create: {
      name: "Super Admin",
      permissions: allPermissions,
    },
  });
  console.log("Bước 1: Đã chuẩn bị xong nhóm quyền tối cao:", adminGroup.name);

  // BKAV HaiHS : Tạo hoặc cập nhật nhóm "Super Admin" - end

  // BKAV HaiHS : Tạo hoặc cập nhật tài khoản người dùng Super Admin - start
  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullname: fullname,
      permissions: allPermissions, // Cấp trực tiếp cho user làm dự phòng
      groups: {
        connect: { id: adminGroup.id }, // Gắn tài khoản này vào Nhóm Super Admin ở Bước 1
      },
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      fullname: fullname,
      permissions: allPermissions,
      groups: {
        connect: { id: adminGroup.id }, // Gắn tài khoản này vào Nhóm Super Admin ở Bước 1
      },
    },
  });
  // BKAV HaiHS : Tạo hoặc cập nhật tài khoản người dùng Super Admin - end

  console.log("Bước 2: Khởi tạo tài khoản Super Admin thành công!");
  console.log(`Email: ${superAdmin.email}`);
  console.log(`Mật khẩu: superadmin123`);
}

// BKAV HaiHS : Luồng chạy và bắt lỗi hệ thống - start
main()
  .catch((e) => {
    console.error(
      "Thất bại! Đã xảy ra lỗi trong quá trình gieo hạt dữ liệu:",
      e,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log(
      "Đã đóng toàn bộ kết nối Database an toàn. Tiến trình kết thúc.",
    );
  });

// BKAV HaiHS : Luồng chạy và bắt lỗi hệ thống - end

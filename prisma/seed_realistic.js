require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

// Khởi tạo kết nối
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const realisticNames = [
  "Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thị Mai", "Phạm Đức Hùng", "Hoàng Quốc Bảo",
  "Phan Thanh Bình", "Vũ Minh Triết", "Võ Hoàng Yến", "Đặng Quang Huy", "Bùi Quốc Anh",
  "Đỗ Thị Dung", "Hồ Hoàng Long", "Ngô Minh Khang", "Dương Văn Quyết", "Lý Thanh Hải",
  "Trần Văn An", "Nguyễn Đức Phúc", "Lê Minh Tuấn", "Phạm Hoàng Giang", "Hoàng Hữu Phước",
  "Phan Ngọc Linh", "Vũ Văn Tiến", "Võ Thị Hằng", "Đặng Minh Tâm", "Bùi Quang Ngọc",
  "Đỗ Minh Đạt", "Hồ Quốc Khánh", "Ngô Văn Hùng", "Dương Thu Trang", "Lý Minh Khoa",
  "Nguyễn Khánh Vân", "Trần Đức Trọng", "Lê Thị Lan", "Phạm Văn Nam", "Hoàng Thanh Sơn",
  "Phan Quốc Trung", "Vũ Thị Thảo", "Võ Văn Dũng", "Đặng Quang Minh", "Bùi Thị Tuyết",
  "Đỗ Hoàng Lâm", "Hồ Minh Quân", "Ngô Quốc Việt", "Dương Văn Sơn", "Lý Thị Hà",
  "Nguyễn Văn Bình", "Trần Thị Minh", "Lê Đức Thắng", "Phạm Quang Vinh", "Hoàng Minh Trí",
  "Phan Thị Ngọc", "Vũ Hoàng Sơn", "Võ Quốc Cường", "Đặng Văn Toàn", "Bùi Minh Tuấn",
  "Đỗ Thị Oanh", "Hồ Văn Thanh", "Ngô Thị Thu", "Dương Minh Hoàng", "Lý Văn Hòa",
  "Nguyễn Quốc Đạt", "Trần Văn Việt", "Lê Thị Hồng", "Phạm Minh Đức", "Hoàng Hữu Nghĩa",
  "Phan Thanh Nam", "Vũ Minh Quân", "Võ Thị Bích", "Đặng Đức Huy", "Bùi Văn Thành",
  "Đỗ Quốc Bảo", "Hồ Thị Hương", "Ngô Minh Đăng", "Dương Văn Hải", "Lý Hoàng Nam",
  "Nguyễn Thị Phương", "Trần Hữu Thắng", "Lê Văn Tùng", "Phạm Hoàng Anh", "Hoàng Quốc Khánh",
  "Phan Đức Mạnh", "Vũ Thị Hoa", "Võ Văn Khải", "Đặng Minh Nhật", "Bùi Quốc Huy",
  "Đỗ Văn Kiên", "Hồ Minh Đạt", "Ngô Thị Mai", "Dương Quốc Anh", "Lý Văn Thịnh",
  "Nguyễn Minh Quang", "Trần Văn Long", "Lê Thị Trang", "Phạm Đức Thắng", "Hoàng Văn Hùng",
  "Phan Minh Tuấn", "Vũ Quốc Cường", "Võ Thị Diệu", "Đặng Hoàng Nam", "Bùi Hữu Phước"
];

function removeAccents(str) {
  return str.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "D")
            .toLowerCase();
}

function generateEmail(fullname, index) {
  const cleanName = removeAccents(fullname).split(" ");
  const lastName = cleanName[0];
  const firstName = cleanName[cleanName.length - 1];
  const middleNames = cleanName.slice(1, cleanName.length - 1).join("");
  return `${firstName}.${lastName}${middleNames}${index}@agenthub.com`;
}

// BKAV HaiHS : Ham seed 100 users va 100 groups vao database - start
async function main() {
  console.log("Bắt đầu luồng gieo hạt dữ liệu ngẫu nhiên thực tế...");

  const departments = ["Phòng R&D", "Phòng Kỹ thuật", "Ban Dự án", "Đội Kiểm thử", "Phòng Kinh doanh", "Đội Thiết kế", "Phòng Đào tạo", "Ban Vận hành", "Bộ phận CSKH", "Đội Hỗ trợ"];
  const areas = ["Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Cần Thơ", "Hải Phòng", "Alpha", "Beta", "Gamma", "Omega", "Sigma"];

  // 1. Tạo 100 nhóm quyền (departments x areas = 100 nhóm)
  console.log("Đang khởi tạo 100 nhóm quyền...");
  const createdGroups = [];
  for (const dept of departments) {
    for (const area of areas) {
      const groupName = `${dept} - ${area}`;
      const group = await prisma.group.upsert({
        where: { name: groupName },
        update: {},
        create: {
          name: groupName,
          permissions: ["CHAT", "CONV_C", "CONV_R"],
        }
      });
      createdGroups.push(group);
    }
  }
  console.log(`Đã gieo xong ${createdGroups.length} nhóm quyền.`);

  // 2. Tạo 100 người dùng thực tế với mật khẩu user123
  console.log("Đang tạo 100 người dùng thực tế...");
  const hashedPassword = await bcrypt.hash("user123", 10);
  
  for (let i = 0; i < realisticNames.length; i++) {
    const fullname = realisticNames[i];
    const email = generateEmail(fullname, i + 1);
    
    // Liên kết ngẫu nhiên từ 1 đến 3 nhóm cho mỗi người dùng
    const numGroups = Math.floor(Math.random() * 3) + 1;
    const shuffledGroups = [...createdGroups].sort(() => 0.5 - Math.random());
    const groupConnect = shuffledGroups.slice(0, numGroups).map(g => ({ id: g.id }));

    await prisma.user.upsert({
      where: { email: email },
      update: {
        fullname: fullname,
        password: hashedPassword,
        groups: {
          set: groupConnect
        }
      },
      create: {
        fullname: fullname,
        email: email,
        password: hashedPassword,
        permissions: ["CHAT", "CONV_C", "CONV_R", "CONV_U", "CONV_D"],
        groups: {
          connect: groupConnect
        }
      }
    });
  }
  console.log("Đã gieo xong 100 người dùng thành công!");
}
// BKAV HaiHS : Ham seed 100 users va 100 groups vao database - end

// BKAV HaiHS : Luong chay va dong ket noi an toan - start
main()
  .catch((e) => {
    console.error("Thất bại khi gieo dữ liệu:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log("Đã đóng toàn bộ kết nối cơ sở dữ liệu an toàn.");
  });
// BKAV HaiHS : Luong chay va dong ket noi an toan - end

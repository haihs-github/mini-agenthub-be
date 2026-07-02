//  khởi chạy server express

// Nếu dùng dotenv để đọc file .env
require("dotenv").config();

const app = require("./app");
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

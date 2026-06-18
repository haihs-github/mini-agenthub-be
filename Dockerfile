# Sử dụng Node.js 20 phiên bản Alpine để giảm dung lượng image
FROM node:20-alpine

# Cài đặt các thư viện cần thiết cho Prisma (openssl)
RUN apk add --no-cache openssl

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Sao chép file định nghĩa dependencies
COPY package*.json ./

# Cài đặt các dependencies (chỉ các dependency cần thiết cho production)
RUN npm install --production

# Sao chép thư mục prisma và generate Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# Sao chép toàn bộ mã nguồn vào container
COPY . .

# Mở cổng 3000 (cổng mặc định của ứng dụng backend)
EXPOSE 3000

# Lệnh chạy ứng dụng khi container khởi động
CMD ["npm", "start"]

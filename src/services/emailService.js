const nodemailer = require("nodemailer");
class EmailService {
  // BKAV HaiHS : cấu hình transporter để gửi email - start
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      proxy: "process.env.PROXY",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Bỏ qua lỗi chứng chỉ
      },
      family: 4, // Ép IPv4
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  // BKAV HaiHS : cấu hình transporter để gửi email - end

  // BKAV HaiHS : hàm gửi email - start
  async sendWelcomeEmail(toEmail, tempPassword) {
    const loginLink = `${process.env.APP_URL}/login`; // Link dẫn tới trang đăng nhập Frontend

    const mailOptions = {
      from: `"Mini AgentHub Admin" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "🚀 Chào mừng bạn gia nhập hệ thống Mini AgentHub!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #2c3e50; text-align: center;">Chào mừng đến với Mini AgentHub</h2>
          <p>Xin chào,</p>
          <p>Tài khoản của bạn đã được quản trị viên khởi tạo thành công trên hệ thống. Dưới đây là thông tin đăng nhập của bạn:</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
            <p><strong>Tên đăng nhập (Email):</strong> ${toEmail}</p>
            <p><strong>Mật khẩu tạm thời:</strong> <span style="color: #e74c3c; font-weight: bold; font-size: 16px;">${tempPassword}</span></p>
          </div>

          <p style="color: #e67e22; font-weight: bold;">⚠️ Lưu ý quan trọng:</p>
          <p>Vì lý do bảo mật, hệ thống sẽ yêu cầu bạn <strong>đổi mật khẩu ngay trong lần đăng nhập đầu tiên</strong>.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${loginLink}" style="background-color: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Đăng nhập ngay</a>
          </div>
          
          <p style="margin-top: 30px; font-size: 12px; color: #7f8c8d; text-align: center;">
            Đây là email tự động, vui lòng không trả lời email này.
          </p>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }
  // BKAV HaiHS : hàm gửi email - end
}

module.exports = new EmailService();

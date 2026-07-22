// fix me: tý để sang errormiddleware
// BKAV HaiHS : lớp custom AppError kế thừa Error - start
class AppError extends Error {
  /**
   * @param {Object} errorConfig - Object cấu hình lỗi lấy từ file từ điển errorCodes
   */
  constructor(errorConfig) {
    // Nạp message từ Object cấu hình vào lớp cha Error
    super(errorConfig.message);

    this.statusCode = errorConfig.statusCode;
    this.errorCode = errorConfig.code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// BKAV HaiHS : lớp custom AppError kế thừa Error - start

module.exports = AppError;

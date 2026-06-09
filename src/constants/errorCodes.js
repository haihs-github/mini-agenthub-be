const ERROR_CODES = {
  AUTH: {
    INVALID_CREDENTIALS: {
      statusCode: 401,
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Email hoặc mật khẩu không chính xác!",
    },
    WRONG_OLD_PASSWORD: {
      statusCode: 400,
      code: "AUTH_WRONG_OLD_PASSWORD",
      message: "Mật khẩu cũ không chính xác!",
    },
  },
  USER: {
    NOT_FOUND: {
      statusCode: 404,
      code: "USER_NOT_FOUND",
      message: "Không tìm thấy người dùng yêu cầu trên hệ thống!",
    },
    EMAIL_EXISTS: {
      statusCode: 409,
      code: "USER_EMAIL_ALREADY_EXISTS",
      message: "Email này đã tồn tại trong hệ thống!",
    },
  },
  CONVERSATION: {
    NOT_FOUND: {
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND",
      message: "Cuộc hội thoại không tồn tại hoặc bạn không có quyền truy cập!",
    },
  },
  GROUP: {
    NOT_FOUND: {
      statusCode: 404,
      code: "GROUP_NOT_FOUND",
      message: "Không tìm thấy Nhóm yêu cầu trên hệ thống!",
    },
    ALREADY_EXISTS: {
      statusCode: 409,
      code: "GROUP_ALREADY_EXISTS",
      message: "Tên nhóm này đã tồn tại trên hệ thống!",
    },
  },
};

module.exports = ERROR_CODES;

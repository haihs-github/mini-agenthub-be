const MESSAGES = {
  AUTH: {
    MISSING_FIELDS: "Vui lòng nhập đầy đủ Email và Mật khẩu",
    INVALID_EMAIL: "Định dạng Email không hợp lệ!",
    LOGIN_SUCCESS: "Đăng nhập thành công!",
    REFRESH_SUCCESS: "Gia hạn phiên đăng nhập thành công!",
    LOGOUT_SUCCESS: "Đăng xuất tài khoản thành công!",
    PASSWORD_REQUIRED: "Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới!",
    PASSWORD_SAME: "Mật khẩu mới không được trùng với mật khẩu cũ!",
    CHANGE_PASSWORD_SUCCESS:
      "Đổi mật khẩu thành công! Vui lòng dùng mật khẩu mới cho lần đăng nhập sau.",
    LOGIN_REQUIRED: "Bạn cần đăng nhập để thực hiện hành động này!",
    INVALID_TOKEN: "Thẻ bài (Token) đã hết hạn hoặc không hợp lệ!",
  },
  CONVERSATION: {
    INVALID_ID: "ID cuộc hội thoại phải là một số nguyên hợp lệ!",
    EMPTY_TITLE: "Tiêu đề cuộc hội thoại không được để trống!",
    EMPTY_PROMPT: "Nội dung câu hỏi không được để trống!",
    EMPTY_MODEL: "Tên mô hình AI không được để trống!",
    INVALID_USER: "Danh tính người dùng không hợp lệ!",

    CREATED: "Khởi tạo cuộc hội thoại mới thành công!",
    GET_LIST: "Lấy danh sách cuộc hội thoại thành công!",
    GET_DETAIL: "Lấy chi tiết cuộc hội thoại và lịch sử tin nhắn thành công!",
    UPDATE_TITLE: "Cập nhật tiêu đề cuộc hội thoại thành công!",
    DELETE: "Xóa cuộc hội thoại thành công!",
    CLEAR_ALL: "Xóa toàn bộ lịch sử các cuộc hội thoại thành công!",
    ABORT_SIGNAL: "Phát tín hiệu dừng luồng thành công!",
    STOP_STREAM: "Dừng luồng stream thành công!",

    ACTIVE_STREAM_ERROR: "Phòng chat đang có luồng xử lý hoạt động!",
  },
  GROUP: {
    INVALID_ID: "ID nhóm phải là một số nguyên hợp lệ!",
    EMPTY_NAME: "Bắt buộc phải nhập tên Nhóm (name)!",
    INVALID_ARRAY: "Dữ liệu userIds truyền lên bắt buộc phải là một mảng!",

    CREATE: "Tạo Nhóm mới và gán thành viên thành công!",
    UPDATE: "Cập nhật thông tin Nhóm thành công!",
    ADD_USERS: "Thêm các thành viên vào Nhóm thành công!",
    DELETE: "Xóa Nhóm thành công!",
    REMOVE_USERS: "Xóa các thành viên khỏi Nhóm thành công!",
    GET_LIST: "Lấy danh sách Nhóm thành công!",
    GET_DETAIL: "Lấy chi tiết thông tin Nhóm thành công!",
    SEARCH: "Tìm kiếm danh sách nhóm thành công!",
  },
  USER: {
    INVALID_ID: "ID người dùng phải là một số nguyên hợp lệ!",
    INVALID_USER: "Danh tính người dùng không hợp lệ!",
    EMPTY_EMAIL: "Bắt buộc phải nhập Email!",
    EMPTY_NAME: "Bắt buộc phải nhập Họ và tên!",
    INVALID_EMAIL: "Định dạng Email không hợp lệ!",
    INVALID_NEW_EMAIL: "Định dạng Email mới không hợp lệ!",
    INVALID_ARRAY: "Dữ liệu groupIds truyền lên bắt buộc phải là một mảng!",
    INVALID_PHONE:
      "Số điện thoại không hợp lệ! Bản chất phải chứa đúng 10 chữ số.",

    CREATE: "Tạo tài khoản và gửi Email thành công!",
    GET_LIST: "Lấy danh sách người dùng thành công!",
    GET_DETAIL: "Lấy thông tin chi tiết người dùng thành công!",
    UPDATE: "Cập nhật thông tin người dùng thành công!",
    DELETE: "Xóa tài khoản người dùng thành công!",
    SEARCH: "Tìm kiếm người dùng thành công!",
    UPDATE_PROFILE: "Cập nhật thông tin cá nhân thành công!",
    DELETE_MY_ACCOUNT:
      "Xóa tài khoản cá nhân của bạn thành công! Toàn bộ lịch sử và dữ liệu liên quan đã được hủy bỏ hoàn toàn.",
  },
  PERMISSION: {
    UNAUTHORIZED: "Không tìm thấy thông tin xác thực. Vui lòng đăng nhập!",
    NOT_FOUND: "Tài khoản của bạn không còn tồn tại trên hệ thống!",
    FORBIDDEN: (requiredPermission) =>
      `Bạn không có quyền thực hiện hành động này! (Yêu cầu quyền: ${requiredPermission})`,
  },
};

module.exports = { MESSAGES };

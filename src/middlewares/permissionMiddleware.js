// BKAV HaiHS : middleware kiểm tra quyền - start
const permissionMiddleware = (requiredPermission) => {
  return (req, res, next) => {
    // Lấy mảng quyền từ req.user do authMiddleware chuẩn bị trước đó
    const userPermissions = req.user && req.user.permissions;

    // Nếu không có quyền hoặc quyền yêu cầu không nằm trong mảng quyền của User thì chặn lại
    if (!userPermissions || !userPermissions.includes(requiredPermission)) {
      return res.status(403).json({
        message: `Bạn không có quyền thực hiện hành động này! (Yêu cầu quyền: ${requiredPermission})`,
      });
    }

    next(); // Hợp lệ thì cho qua cửa để vào Controller
  };
};
// BKAV HaiHS : middleware kiểm tra quyền - end

module.exports = permissionMiddleware;

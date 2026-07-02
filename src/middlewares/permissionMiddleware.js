// middleware kiểm tra quyền

const userRepository = require("../repositories/userRepository");

// BKAV HaiHS : Middleware kiểm tra quyền - start
const permissionMiddleware = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Lấy userId từ authMiddleware đã gài cắm trước đó
      const userId = req.userId;

      // kiểm tra xem userId có tồn tại không?
      if (!userId) {
        return res.status(401).json({
          message: "Không tìm thấy thông tin xác thực. Vui lòng đăng nhập!",
        });
      }

      // lấy quyền từ db
      const user = await userRepository.findByIdWithGroups(userId);

      // Kiểm tra xem user có tồn tại không
      if (!user) {
        return res.status(404).json({
          message: "Tài khoản của bạn không còn tồn tại trên hệ thống!",
        });
      }

      // hợp nhất quyền hạn của user và group của user
      const userPerms = user.permissions || [];
      const groupPerms = user.groups
        ? user.groups.flatMap((g) => g.permissions)
        : [];

      // Gộp 2 mảng lại và loại bỏ các phần tử trùng lặp bằng Set
      const effectivePermissions = [...new Set([...userPerms, ...groupPerms])];

      // kiểm tra xem có quyền cần thiết ko?
      if (!effectivePermissions.includes(requiredPermission)) {
        return res.status(403).json({
          message: `Bạn không có quyền thực hiện hành động này! (Yêu cầu quyền: ${requiredPermission})`,
        });
      }

      // đính kèm quyền của người dùng vào req
      req.effectivePermissions = effectivePermissions;

      next(); // cho qua
    } catch (error) {
      next(error);
    }
  };
};
// BKAV HaiHS : Middleware kiểm tra quyền - end

module.exports = permissionMiddleware;

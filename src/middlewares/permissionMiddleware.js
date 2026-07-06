// middleware kiểm tra quyền
const userRepository = require("../repositories/userRepository");
//redisStreamService de dung Cache-Aside
const redisStreamService = require("../services/redisStreamService");

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

      // BKAV HaiHS : Áp dụng Cache-Aside đọc quyền hạn từ Cache trước - start
      const cacheKey = `user:${userId}:permissions`;
      let effectivePermissions;
      const cachedPermissions = await redisStreamService.cacheGet(cacheKey);

      if (cachedPermissions) {
        effectivePermissions = JSON.parse(cachedPermissions);
      } else {
        // [CACHE MISS] - Đọc từ database và gộp quyền
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
        effectivePermissions = [...new Set([...userPerms, ...groupPerms])];

        // Ghi ngược lại vào Cache Redis với TTL là 1 tiếng (3600 giây)
        await redisStreamService.cacheSet(
          cacheKey,
          JSON.stringify(effectivePermissions),
          3600,
        );
      }
      // BKAV HaiHS : Áp dụng Cache-Aside đọc quyền hạn từ Cache trước - end

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

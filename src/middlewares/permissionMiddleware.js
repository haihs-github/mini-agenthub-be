// middleware kiểm tra quyền
const userRepository = require("../repositories/userRepository");
const redisStreamService = require("../services/redisStreamService");
const { MESSAGES } = require("../constants/messages");

// BKAV HaiHS: Hàm phụ lấy và gộp quyền của các nhóm mà user tham gia - start
const getGroupPermissions = (groups) => {
  if (!groups) return [];
  return groups.flatMap((g) => g.permissions || []);
};
// BKAV HaiHS: Hàm phụ lấy và gộp quyền của các nhóm mà user tham gia - end

// BKAV HaiHS: Hàm phụ hợp nhất quyền hạn của user và group - start
const mergeUserAndGroupPermissions = (user) => {
  const userPerms = user.permissions || [];
  const groupPerms = getGroupPermissions(user.groups);
  return [...new Set([...userPerms, ...groupPerms])];
};
// BKAV HaiHS: Hàm phụ hợp nhất quyền hạn của user và group - end

// BKAV HaiHS: Hàm phụ đọc quyền hạn từ Cache (Cache-Aside) hoặc DB - start
const getEffectivePermissions = async (userId) => {
  const cacheKey = `user:${userId}:permissions`;

  // 1. Đọc từ Cache trước
  const cachedPermissions = await redisStreamService.cacheGet(cacheKey);
  if (cachedPermissions) {
    return JSON.parse(cachedPermissions);
  }

  // 2. [CACHE MISS] - Đọc từ database
  const user = await userRepository.findByIdWithGroups(userId);
  if (!user) {
    return null; // Trả về null nếu user không tồn tại
  }

  // 3. Hợp nhất quyền hạn và lưu lại vào cache
  const effectivePermissions = mergeUserAndGroupPermissions(user);
  await redisStreamService.cacheSet(
    cacheKey,
    JSON.stringify(effectivePermissions),
    3600,
  );

  return effectivePermissions;
};
// BKAV HaiHS: Hàm phụ đọc quyền hạn từ Cache (Cache-Aside) hoặc DB - end

// BKAV HaiHS : Middleware kiểm tra quyền - start
const permissionMiddleware = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.userId;

      // 1. Kiểm tra thông tin xác thực
      if (!userId) {
        return res.status(401).json({
          message: MESSAGES.PERMISSION.UNAUTHORIZED,
        });
      }

      // 2. Lấy danh sách quyền hạn hiệu lực (từ Cache/DB)
      const effectivePermissions = await getEffectivePermissions(userId);
      if (!effectivePermissions) {
        return res.status(404).json({
          message: MESSAGES.PERMISSION.NOT_FOUND,
        });
      }

      // 3. Kiểm tra xem user có quyền yêu cầu hay không
      if (!effectivePermissions.includes(requiredPermission)) {
        return res.status(403).json({
          message: MESSAGES.PERMISSION.FORBIDDEN(requiredPermission),
        });
      }

      // Đính kèm quyền vào request để các tầng sau sử dụng nếu cần
      req.effectivePermissions = effectivePermissions;
      next(); // Cho phép đi tiếp
    } catch (error) {
      next(error); // Chuyển lỗi tới error handler middleware
    }
  };
};
// BKAV HaiHS : Middleware kiểm tra quyền - end

module.exports = permissionMiddleware;

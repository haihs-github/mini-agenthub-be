const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default;
const redisStreamService = require("../services/redisStreamService");

// BKAV HaiHS : Định nghĩa lớp Store động kết hợp giữa RedisStore và MemoryStore dự phòng - start
class DynamicStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.localCache = new Map();
    this.redisStore = null;
    this.options = null;
  }

  init(options) {
    this.options = options;
    // KHÔNG khởi tạo và gọi init của RedisStore ở đây để tránh crash khi Redis chưa online lúc khởi động server
  }

  // Khởi tạo RedisStore trễ (Lazy Initialization) khi có kết nối thực sự
  async ensureRedisStoreInitialized() {
    if (this.redisStore) return true;

    if (redisStreamService.isRedisConnected && redisStreamService.ioredisClient) {
      try {
        this.redisStore = new RedisStore({
          sendCommand: (...args) => {
            if (redisStreamService.ioredisClient) {
              return redisStreamService.ioredisClient.call(...args);
            }
            throw new Error("Redis client is null");
          },
          prefix: `rl:${this.prefix}:`,
        });

        // Gọi khởi động nạp kịch bản Lua vào Redis
        if (typeof this.redisStore.init === "function") {
          await this.redisStore.init(this.options);
        }
        return true;
      } catch (err) {
        console.warn(`[RateLimit] Failed to initialize RedisStore lazily:`, err.message);
        this.redisStore = null; // Reset để thử lại ở request sau
        return false;
      }
    }
    return false;
  }

  async increment(key) {
    // 1. Thử khởi tạo trễ và ghi nhận lượt gọi thông qua Redis
    const isRedisReady = await this.ensureRedisStoreInitialized();
    if (isRedisReady && this.redisStore) {
      try {
        return await this.redisStore.increment(key);
      } catch (err) {
        console.warn(`[RateLimit Warning] RedisStore error, falling back to MemoryStore:`, err.message);
        this.redisStore = null; // Reset để khởi tạo lại khi Redis kết nối lại
      }
    }

    // 2. Dự phòng: Tự xử lý bằng bộ đệm RAM cục bộ của máy chủ Node.js nếu Redis sập
    const now = Date.now();
    const windowMs = this.options.windowMs;

    let record = this.localCache.get(key);
    if (!record || record.resetTime < now) {
      record = {
        totalHits: 0,
        resetTime: now + windowMs,
      };
    }

    record.totalHits += 1;
    this.localCache.set(key, record);

    return {
      totalHits: record.totalHits,
      resetTime: new Date(record.resetTime),
    };
  }

  async decrement(key) {
    const isRedisReady = await this.ensureRedisStoreInitialized();
    if (isRedisReady && this.redisStore) {
      try {
        if (typeof this.redisStore.decrement === "function") {
          return await this.redisStore.decrement(key);
        }
      } catch (err) {
        this.redisStore = null;
      }
    }

    let record = this.localCache.get(key);
    if (record && record.totalHits > 0) {
      record.totalHits -= 1;
      this.localCache.set(key, record);
    }
  }

  async resetKey(key) {
    const isRedisReady = await this.ensureRedisStoreInitialized();
    if (isRedisReady && this.redisStore) {
      try {
        return await this.redisStore.resetKey(key);
      } catch (err) {
        this.redisStore = null;
      }
    }
    this.localCache.delete(key);
  }
}
// BKAV HaiHS : Định nghĩa lớp Store động kết hợp giữa RedisStore và MemoryStore dự phòng - end

// 1. Giới hạn chung cho toàn hệ thống (General API Rate Limiter) - tối đa 60 requests/phút
const generalLimiter = rateLimit({
  store: new DynamicStore("general"),
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: {
    status: "fail",
    code: "RATE_LIMIT_GENERAL",
    message: "Bạn đang thao tác quá nhanh. Vui lòng thử lại sau 1 phút!",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Tắt toàn bộ cảnh báo khởi động của express-rate-limit
});

// 2. Giới hạn Đăng nhập & Đổi mật khẩu (Auth Rate Limiter) - tối đa 5 requests/phút
const authLimiter = rateLimit({
  store: new DynamicStore("auth"),
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: {
    status: "fail",
    code: "RATE_LIMIT_AUTH",
    message: "Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau 1 phút!",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// 3. Giới hạn gia hạn Token (Token Refresh Rate Limiter) - tối đa 20 requests/phút
const refreshLimiter = rateLimit({
  store: new DynamicStore("refresh"),
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: {
    status: "fail",
    code: "RATE_LIMIT_REFRESH",
    message: "Yêu cầu gia hạn quá nhanh. Vui lòng thử lại sau!",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// 4. Giới hạn chat với AI (AI Chat Rate Limiter) - tối đa 10 requests/phút
const chatLimiter = rateLimit({
  store: new DynamicStore("chat"),
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    status: "fail",
    code: "RATE_LIMIT_CHAT",
    message: "Bạn đã vượt giới hạn chat 10 tin nhắn/phút. Vui lòng đợi và thử lại!",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ? String(req.userId) : req['ip'],
  validate: false,
});

// 5. Giới hạn tìm kiếm / phân trang nặng (Heavy Query Rate Limiter) - tối đa 30 requests/phút
const heavyQueryLimiter = rateLimit({
  store: new DynamicStore("heavy"),
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    status: "fail",
    code: "RATE_LIMIT_HEAVY",
    message: "Hệ thống đang bận xử lý truy vấn của bạn. Vui lòng thử lại sau!",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ? String(req.userId) : req['ip'],
  validate: false,
});

// 6. Giới hạn ghi dữ liệu (Write DB Rate Limiter) - tối đa 20 requests/phút
const writeDbLimiter = rateLimit({
  store: new DynamicStore("write"),
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: {
    status: "fail",
    code: "RATE_LIMIT_WRITE",
    message: "Bạn đang thực hiện quá nhiều thao tác thay đổi dữ liệu. Vui lòng đợi!",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ? String(req.userId) : req['ip'],
  validate: false,
});

module.exports = {
  generalLimiter,
  authLimiter,
  refreshLimiter,
  chatLimiter,
  heavyQueryLimiter,
  writeDbLimiter,
};

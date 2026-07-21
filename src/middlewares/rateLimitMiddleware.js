const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default;
const redisStreamService = require("../services/redisStreamService");
const RATE = require("../constants/ratelimits");
// BKAV HaiHS : Định nghĩa lớp Store động kết hợp giữa RedisStore và MemoryStore dự phòng - start
class DynamicStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.localCache = new Map();
    this.redisStore = null;
    this.options = null;
  }

  init(options) {
    this.options = options; // KHÔNG khởi tạo và gọi init của RedisStore ở đây để tránh crash khi Redis chưa online lúc khởi động server
  }

  // Khởi tạo RedisStore bên trong hàm phụ
  buildRedisStore() {
    return new RedisStore({
      sendCommand: (...args) => {
        const client = redisStreamService.ioredisClient;
        if (!client) {
          throw new Error("Redis client is null");
        }
        return client.call(...args);
      },
      prefix: `rl:${this.prefix}:`,
    });
  }

  // Khởi tạo và nạp kịch bản vào RedisStore
  async initRedisStore() {
    this.redisStore = this.buildRedisStore();
    if (typeof this.redisStore.init === "function") {
      await this.redisStore.init(this.options);
    }
  }

  // Khởi tạo RedisStore trễ (Lazy Initialization) khi có kết nối thực sự
  async ensureRedisStoreInitialized() {
    if (this.redisStore) {
      return true;
    }

    const isConnected =
      redisStreamService.isRedisConnected && redisStreamService.ioredisClient;
    if (!isConnected) {
      return false;
    }

    try {
      await this.initRedisStore();
      return true;
    } catch (err) {
      console.warn(
        `[RateLimit] Failed to initialize RedisStore lazily:`,
        err.message,
      );
      this.redisStore = null; // Reset để thử lại ở request sau
      return false;
    }
  }

  // Hàm phụ tăng giá trị trong Redis
  async incrementRedis(key) {
    try {
      return await this.redisStore.increment(key);
    } catch (err) {
      console.warn(
        `[RateLimit Warning] RedisStore error, falling back to MemoryStore:`,
        err.message,
      );
      this.redisStore = null; // Reset để khởi tạo lại khi Redis kết nối lại
      return null;
    }
  }

  // Hàm phụ tăng giá trị trong Memory cục bộ
  incrementMemory(key) {
    const now = Date.now();
    const windowMs = this.options.windowMs;

    let record = this.localCache.get(key);
    const isExpired = !record || record.resetTime < now;
    if (isExpired) {
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

  async increment(key) {
    // 1. Thử khởi tạo trễ và ghi nhận lượt gọi thông qua Redis
    const isRedisReady = await this.ensureRedisStoreInitialized();
    if (isRedisReady && this.redisStore) {
      const result = await this.incrementRedis(key);
      if (result) {
        return result;
      }
    }
    // 2. Dự phòng: Tự xử lý bằng bộ đệm RAM cục bộ nếu Redis sập
    return this.incrementMemory(key);
  }

  // Hàm phụ giảm giá trị trong Redis
  async decrementRedis(key) {
    try {
      const hasDecrement = typeof this.redisStore.decrement === "function";
      if (hasDecrement) {
        await this.redisStore.decrement(key);
        return true;
      }
    } catch (err) {
      this.redisStore = null;
    }
    return false;
  }

  // Hàm phụ giảm giá trị trong Memory cục bộ
  decrementMemory(key) {
    let record = this.localCache.get(key);
    const hasHits = record && record.totalHits > 0;
    if (hasHits) {
      record.totalHits -= 1;
      this.localCache.set(key, record);
    }
  }

  async decrement(key) {
    const isRedisReady = await this.ensureRedisStoreInitialized();
    if (isRedisReady && this.redisStore) {
      const done = await this.decrementRedis(key);
      if (done) {
        return;
      }
    }
    this.decrementMemory(key);
  }

  // Hàm phụ xóa key trong Redis
  async resetKeyRedis(key) {
    try {
      await this.redisStore.resetKey(key);
      return true;
    } catch (err) {
      this.redisStore = null;
    }
    return false;
  }

  async resetKey(key) {
    const isRedisReady = await this.ensureRedisStoreInitialized();
    if (isRedisReady && this.redisStore) {
      const done = await this.resetKeyRedis(key);
      if (done) {
        return;
      }
    }
    this.localCache.delete(key);
  }
}
// BKAV HaiHS : Định nghĩa lớp Store động kết hợp giữa RedisStore và MemoryStore dự phòng - end

// 1. Giới hạn chung cho toàn hệ thống (General API Rate Limiter) - tối đa 60 requests/phút
const generalLimiter = rateLimit({
  store: new DynamicStore("general"),
  windowMs: RATE.LIMIT_TIME,
  max: RATE.LIMIT_GENERAL,
  message: {
    status: "fail",
    code: "RATE_LIMIT_GENERAL",
    message: RATE.LIMIT_GENERAL_MESSAGE,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Tắt toàn bộ cảnh báo khởi động của express-rate-limit
});

// 2. Giới hạn Đăng nhập & Đổi mật khẩu (Auth Rate Limiter) - tối đa 5 requests/phút
const authLimiter = rateLimit({
  store: new DynamicStore("auth"),
  windowMs: RATE.LIMIT_TIME,
  max: RATE.LIMIT_AUTH,
  message: {
    status: "fail",
    code: "RATE_LIMIT_AUTH",
    message: RATE.LIMIT_AUTH_MESSAGE,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// 3. Giới hạn gia hạn Token (Token Refresh Rate Limiter) - tối đa 20 requests/phút
const refreshLimiter = rateLimit({
  store: new DynamicStore("refresh"),
  windowMs: RATE.LIMIT_TIME,
  max: RATE.LIMIT_REFRESH,
  message: {
    status: "fail",
    code: "RATE_LIMIT_REFRESH",
    message: RATE.LIMIT_REFRESH_MESSAGE,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// 4. Giới hạn chat với AI (AI Chat Rate Limiter) - tối đa 10 requests/phút
const chatLimiter = rateLimit({
  store: new DynamicStore("chat"),
  windowMs: RATE.LIMIT_TIME,
  max: RATE.LIMIT_CHAT,
  message: {
    status: "fail",
    code: "RATE_LIMIT_CHAT",
    message: RATE.LIMIT_CHAT_MESSAGE,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.userId ? String(req.userId) : req["ip"]),
  validate: false,
});

// 5. Giới hạn tìm kiếm / phân trang nặng (Heavy Query Rate Limiter) - tối đa 30 requests/phút
const heavyQueryLimiter = rateLimit({
  store: new DynamicStore("heavy"),
  windowMs: RATE.LIMIT_TIME,
  max: RATE.LIMIT_HEAVY,
  message: {
    status: "fail",
    code: "RATE_LIMIT_HEAVY",
    message: RATE.LIMIT_HEAVY_MESSAGE,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.userId ? String(req.userId) : req["ip"]),
  validate: false,
});

// 6. Giới hạn ghi dữ liệu (Write DB Rate Limiter) - tối đa 20 requests/phút
const writeDbLimiter = rateLimit({
  store: new DynamicStore("write"),
  windowMs: RATE.LIMIT_TIME,
  max: RATE.LIMIT_WRITE,
  message: {
    status: "fail",
    code: "RATE_LIMIT_WRITE",
    message: RATE.LIMIT_WRITE_MESSAGE,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.userId ? String(req.userId) : req["ip"]),
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

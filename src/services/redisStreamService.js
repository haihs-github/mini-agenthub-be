const Redis = require("ioredis");

// BKAV HaiHS : Định nghĩa lớp RedisStreamService điều hành việc đồng bộ hóa dữ liệu chéo máy chủ qua Redis - start
class RedisStreamService {
  constructor() {
    this.isRedisConnected = false;
    this.ioredisClient = null;
    this.subscriberClient = null;
    this.memoryStreams = new Map();
    this.memoryActiveFlags = new Set();
    this.memorySubscribers = new Map();
    this.memoryCache = new Map();
    this.localSeqCounters = new Map();

    try {
      const redisConfig = {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        maxRetriesPerRequest: 1,
      };

      this.ioredisClient = new Redis(redisConfig);
      this.#setupConnectionListeners(this.ioredisClient);

      this.subscriberClient = new Redis(redisConfig);
      this.subscriberClient.on("error", () => {});
    } catch (e) {
      this.isRedisConnected = false;
    }
  }

  // BKAV HaiHS : Cấp số thứ tự cho chunk để tránh mất số thứ tự - start
  async getNextSequence(streamId) {
    const seqKey = `stream:${streamId}:seq`;
    if (this.isRedisConnected) {
      try {
        const pipeline = this.ioredisClient.pipeline();
        pipeline.incr(seqKey);
        pipeline.expire(seqKey, 86400);
        const results = await pipeline.exec();
        const seq = results[0][1];
        return seq - 1;
      } catch (e) {}
    }
    return this.#fallbackSequence(streamId);
  }
  // BKAV HaiHS : Cấp số thứ tự cho chunk để tránh mất số thứ tự - end

  // BKAV HaiHS : ghi dữ liệu vào lịch sử chat - start
  async appendChunk(streamId, event) {
    const streamKey = `stream:${streamId}:chunks`;
    if (this.isRedisConnected) {
      try {
        const pipeline = this.ioredisClient.pipeline();
        pipeline.xadd(streamKey, "*", "data", JSON.stringify(event));
        pipeline.expire(streamKey, 1200);
        await pipeline.exec();
        return;
      } catch (e) {}
    }

    if (!this.memoryStreams.has(streamId)) {
      this.memoryStreams.set(streamId, []);
    }
    this.memoryStreams.get(streamId).push(event);
  }
  // BKAV HaiHS : ghi dữ liệu vào lịch sử chat - end

  // BKAV HaiHS : Phát chunk qua pub/sub - start
  async publishChunk(streamId, event) {
    const channel = `stream:${streamId}:events`;
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.publish(channel, JSON.stringify(event));
        return;
      } catch (e) {}
    }
    this.#fallbackPublishChunk(channel, event);
  }
  // BKAV HaiHS : Phát chunk qua pub/sub - end

  // BKAV HaiHS : Đăng ký kênh - start
  async subscribeToChannel(streamId, callback) {
    const channel = `stream:${streamId}:events`;
    if (this.isRedisConnected) {
      try {
        await this.subscriberClient.subscribe(channel);
        const handler = (ch, message) => {
          if (ch === channel) {
            try {
              const event = JSON.parse(message);
              callback(event);
            } catch (e) {}
          }
        };
        this.subscriberClient.on("message", handler);
        return async () => {
          this.subscriberClient.off("message", handler);
          try {
            await this.subscriberClient.unsubscribe(channel);
          } catch (e) {}
        };
      } catch (e) {}
    }
    return this.#fallbackSubscribe(channel, callback);
  }
  // BKAV HaiHS : Đăng ký kênh - end

  // BKAV HaiHS : kiểm tra xem stream có tồn tại ko? - start
  async hasStream(streamId) {
    const streamKey = `stream:${streamId}:chunks`;
    if (this.isRedisConnected) {
      try {
        const exists = await this.ioredisClient.exists(streamKey);
        return exists === 1;
      } catch (e) {}
    }
    return this.memoryStreams.has(streamId);
  }
  // BKAV HaiHS : kiểm tra xem stream có tồn tại ko? - end

  // BKAV HaiHS : Đọc toàn bộ lịch sử bằng XRANGE - start
  async getChunks(streamId) {
    const streamKey = `stream:${streamId}:chunks`;
    const events = [];

    if (this.isRedisConnected) {
      try {
        const results = await this.ioredisClient.xrange(streamKey, "-", "+");
        for (const [, fields] of results) {
          for (let i = 0; i < fields.length; i += 2) {
            if (fields[i] === "data") {
              try {
                events.push(JSON.parse(fields[i + 1]));
              } catch (e) {}
            }
          }
        }
        return events;
      } catch (e) {}
    }

    return this.memoryStreams.get(streamId) || [];
  }
  // BKAV HaiHS : Đọc toàn bộ lịch sử bằng XRANGE - end

  // BKAV HaiHS : Phát tín hiệu hủy bằng pub/sub - start
  async publishAbort(streamId) {
    const channel = `stream:${streamId}:events`;
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.publish(
          channel,
          JSON.stringify({ type: "ABORT" }),
        );
      } catch (e) {}
    }
  }
  // BKAV HaiHS : Phát tín hiệu hủy bằng pub/sub - end

  // BKAV HaiHS : set stream active - start
  async setStreamActive(streamId) {
    const activeKey = `stream:${streamId}:active`;
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.set(activeKey, "1", "EX", 1200);
        return;
      } catch (e) {}
    }
    this.memoryActiveFlags.add(streamId);
  }
  // BKAV HaiHS : set stream active - end

  // BKAV HaiHS : xóa trạng thái stream active - start
  async clearStreamActive(streamId) {
    const activeKey = `stream:${streamId}:active`;
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.del(activeKey);
        return;
      } catch (e) {}
    }
    this.memoryActiveFlags.delete(streamId);
  }
  // BKAV HaiHS : xóa trạng thái stream active - end

  // BKAV HaiHS : kiểm tra xem stream có đang active ko? - start
  async isStreamActive(streamId) {
    const activeKey = `stream:${streamId}:active`;
    if (this.isRedisConnected) {
      try {
        const [activeExists, streamExists] = await Promise.all([
          this.ioredisClient.exists(activeKey),
          this.ioredisClient.exists(`stream:${streamId}:chunks`),
        ]);
        return activeExists === 1 || streamExists === 1;
      } catch (e) {}
    }
    return (
      this.memoryActiveFlags.has(streamId) || this.memoryStreams.has(streamId)
    );
  }
  // BKAV HaiHS : kiểm tra xem stream có đang active ko? - end

  // BKAV HaiHS : Xóa hoàn toàn stream sau khi chat xong - start
  async deleteStream(streamId) {
    const streamKey = `stream:${streamId}:chunks`;
    const seqKey = `stream:${streamId}:seq`;
    const activeKey = `stream:${streamId}:active`;
    this.localSeqCounters.delete(streamId);
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.del(streamKey, seqKey, activeKey);
        return;
      } catch (e) {}
    }
    this.memoryStreams.delete(streamId);
    this.memoryActiveFlags.delete(streamId);
  }
  // BKAV HaiHS : Xóa hoàn toàn stream sau khi chat xong - end

  // BKAV HaiHS : Hệ thống lưu trữ Cache-Aside hỗ trợ cả Redis và RAM cục bộ - start
  async cacheGet(key) {
    if (this.isRedisConnected) {
      try {
        return await this.ioredisClient.get(key);
      } catch (e) {}
    }
    return this.#fallbackCacheGet(key);
  }

  async cacheSet(key, value, ttlSeconds) {
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.set(key, value, "EX", ttlSeconds);
        return;
      } catch (e) {}
    }
    this.#fallbackCacheSet(key, value, ttlSeconds);
  }

  async cacheDel(key) {
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.del(key);
        return;
      } catch (e) {}
    }
    this.memoryCache.delete(key);
  }

  async cacheDelPattern(pattern) {
    if (this.isRedisConnected) {
      try {
        const keys = await this.ioredisClient.keys(pattern);
        if (keys.length > 0) {
          await this.ioredisClient.del(...keys);
        }
        return;
      } catch (e) {}
    }
    this.#clearMemoryCacheByPattern(pattern);
  }
  // BKAV HaiHS : Hệ thống lưu trữ Cache-Aside hỗ trợ cả Redis và RAM cục bộ - end

  // BKAV HaiHS : Hàm phụ đăng ký lắng nghe sự kiện kết nối của Redis Client - start
  #setupConnectionListeners(client) {
    client.on("connect", () => {
      this.isRedisConnected = true;
    });
    client.on("error", () => {
      this.isRedisConnected = false;
    });
  }
  // BKAV HaiHS : Hàm phụ đăng ký lắng nghe sự kiện kết nối của Redis Client - end

  // BKAV HaiHS : Hàm phụ cấp số thứ tự local khi mất kết nối Redis - start
  #fallbackSequence(streamId) {
    const current = this.localSeqCounters.get(streamId) || 0;
    this.localSeqCounters.set(streamId, current + 1);
    return current;
  }
  // BKAV HaiHS : Hàm phụ cấp số thứ tự local khi mất kết nối Redis - end

  // BKAV HaiHS : Hàm phụ phát sự kiện qua bộ nhớ RAM local - start
  #fallbackPublishChunk(channel, event) {
    const handlers = this.memorySubscribers.get(channel);
    if (handlers) {
      for (const cb of handlers) {
        try {
          cb(event);
        } catch (e) {}
      }
    }
  }
  // BKAV HaiHS : Hàm phụ phát sự kiện qua bộ nhớ RAM local - end

  // BKAV HaiHS : Hàm phụ đăng ký nhận sự kiện cục bộ - start
  #fallbackSubscribe(channel, callback) {
    const handlers = this.memorySubscribers.get(channel) || new Set();
    handlers.add(callback);
    this.memorySubscribers.set(channel, handlers);
    return async () => {
      handlers.delete(callback);
      if (handlers.size === 0) this.memorySubscribers.delete(channel);
    };
  }
  // BKAV HaiHS : Hàm phụ đăng ký nhận sự kiện cục bộ - end

  // BKAV HaiHS : Hàm phụ đọc dữ liệu cache từ RAM - start
  #fallbackCacheGet(key) {
    const item = this.memoryCache.get(key);
    if (item) {
      if (item.expiresAt && item.expiresAt < Date.now()) {
        this.memoryCache.delete(key);
        return null;
      }
      return item.value;
    }
    return null;
  }
  // BKAV HaiHS : Hàm phụ đọc dữ liệu cache từ RAM - end

  // BKAV HaiHS : Hàm phụ ghi dữ liệu cache vào RAM - start
  #fallbackCacheSet(key, value, ttlSeconds) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryCache.set(key, { value, expiresAt });
  }
  // BKAV HaiHS : Hàm phụ ghi dữ liệu cache vào RAM - end

  // BKAV HaiHS : Hàm phụ tìm kiếm và xóa cache RAM hàng loạt bằng biểu thức - start
  #clearMemoryCacheByPattern(pattern) {
    const escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("^" + escapedPattern.replace(/\*/g, ".*") + "$");
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }
  // BKAV HaiHS : Hàm phụ tìm kiếm và xóa cache RAM hàng loạt bằng biểu thức - end
}
// BKAV HaiHS : Định nghĩa lớp RedisStreamService điều hành việc đồng bộ hóa dữ liệu chéo máy chủ qua Redis - end

module.exports = new RedisStreamService();

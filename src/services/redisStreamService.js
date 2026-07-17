const Redis = require("ioredis");

// BKAV HaiHS : Khoi tao 2 ket noi Redis rieng biet - start
class RedisStreamService {
  constructor() {
    this.isRedisConnected = false; // biến kiểm tra xem đã kết nối redis chưa
    this.ioredisClient = null; // kết nối cho ghi/đọc thông thường
    this.subscriberClient = null; // kết nối chuyên dụng cho Pub/Sub
    this.memoryStreams = new Map(); // map lưu các chunk chữ của phòng chat trong RAM khi redis sập
    this.memoryActiveFlags = new Set(); // Lưu các stream trong ram khi redis sập
    this.memorySubscribers = new Map(); // Fallback cho Pub/Sub subscribers
    this.memoryCache = new Map(); // BKAV HaiHS : Fallback luu tru cap key-value da nang - start / end
    this.localSeqCounters = new Map(); // streamId -> so nguyen tang dan

    // BKAV HaiHS : Khởi tạo 2 kết nối đến redis - start
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        maxRetriesPerRequest: 1,
      };

      // Kết nối 1: luồng ghi/đọc thông thường
      this.ioredisClient = new Redis(redisConfig);
      this.ioredisClient.on("connect", () => {
        this.isRedisConnected = true;
      });
      this.ioredisClient.on("error", () => {
        this.isRedisConnected = false;
      });

      // Kết nối 2: luồng chuyên dụng cho Subscribe (không dùng cho lệnh khác)
      this.subscriberClient = new Redis(redisConfig);
      this.subscriberClient.on("error", () => {
        // Im lặng bắt lỗi kết nối subscriber
      });
    } catch (e) {
      this.isRedisConnected = false;
    }
  }
  // BKAV HaiHS : Khởi tạo 2 kết nối đến redis - end

  // BKAV HaiHS : Cấp số thứ tự cho chunk để tránh mất số thứ tự - start
  async getNextSequence(streamId) {
    const seqKey = `stream:${streamId}:seq`;
    if (this.isRedisConnected) {
      try {
        // thiết lập key đếm số thứ tự cho chunk
        const pipeline = this.ioredisClient.pipeline();
        pipeline.incr(seqKey);
        pipeline.expire(seqKey, 86400); // TTL 24 gio
        const results = await pipeline.exec();
        const seq = results[0][1]; // Gia tri tra ve cua INCR
        return seq - 1; // Bat dau tu 0
      } catch (e) {
        // Neu Redis loi thi roi xuong fallback cuc bo
      }
    }
    // BKAV HaiHS : Fallback cuc bo: dung Map tang dan thay vi Date.now() de dam bao thu tu
    const current = this.localSeqCounters.get(streamId) || 0;
    this.localSeqCounters.set(streamId, current + 1);
    return current;
  }

  //  BKAV HaiHS : ghi dữ liệu vào lịch sử chat - start
  async appendChunk(streamId, event) {
    const streamKey = `stream:${streamId}:chunks`;
    if (this.isRedisConnected) {
      try {
        // Dùng Pipeline để gửi XADD + EXPIRE trong một lần gọi duy nhất
        const pipeline = this.ioredisClient.pipeline();
        // add chunk vừa nhận được vào stream
        pipeline.xadd(streamKey, "*", "data", JSON.stringify(event));
        pipeline.expire(streamKey, 1200); // TTL 20 phút
        await pipeline.exec();
        return;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }

    // Fallback: lưu vào bộ nhớ tạm
    if (!this.memoryStreams.has(streamId)) {
      this.memoryStreams.set(streamId, []);
    }
    this.memoryStreams.get(streamId).push(event);
  }
  //  BKAV HaiHS : ghi dữ liệu vào lịch sử chat - start

  // BKAV HaiHS : Phát chunk qua pub/sub - start
  async publishChunk(streamId, event) {
    // xác định luồng stream và gửi chuỗi json lên
    const channel = `stream:${streamId}:events`;
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.publish(channel, JSON.stringify(event));
        return;
      } catch (e) {
        // Bỏ qua lỗi publish
      }
    }
    // BKAV HaiHS : Fallback memory Pub/Sub khi Redis mat ket noi - start
    const handlers = this.memorySubscribers.get(channel);
    if (handlers) {
      for (const cb of handlers) {
        try {
          cb(event);
        } catch (e) {}
      }
    }
    // BKAV HaiHS : Fallback memory Pub/Sub khi Redis mat ket noi - end
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
            } catch (e) {
              // Bỏ qua lỗi parse
            }
          }
        };
        this.subscriberClient.on("message", handler);
        // Trả về hàm unsubscribe để cleanup sau
        return async () => {
          this.subscriberClient.off("message", handler);
          try {
            await this.subscriberClient.unsubscribe(channel);
          } catch (e) {
            // Bỏ qua lỗi unsubscribe
          }
        };
      } catch (e) {
        // Bỏ qua lỗi subscribe
      }
    }
    // BKAV HaiHS : Fallback memory Pub/Sub khi Redis mat ket noi - start
    // channel da duoc khai bao o dau ham, dung lai truc tiep
    const handlers = this.memorySubscribers.get(channel) || new Set();
    handlers.add(callback);
    this.memorySubscribers.set(channel, handlers);
    return async () => {
      handlers.delete(callback);
      if (handlers.size === 0) this.memorySubscribers.delete(channel);
    };
    // BKAV HaiHS : Fallback memory Pub/Sub khi Redis mat ket noi - end
  }
  // BKAV HaiHS : Đăng ký kênh - end

  // BKAV HaiHS : kiểm tra xem stream có tồn tại ko?- start
  async hasStream(streamId) {
    const streamKey = `stream:${streamId}:chunks`;
    if (this.isRedisConnected) {
      try {
        const exists = await this.ioredisClient.exists(streamKey);
        return exists === 1;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }
    return this.memoryStreams.has(streamId);
  }
  // BKAV HaiHS : kiểm tra xem stream có tồn tại ko?- end

  // BKAV HaiHS : Đọc toàn bộ lịch sử bằng XRANGE - start
  async getChunks(streamId) {
    const streamKey = `stream:${streamId}:chunks`;
    const events = [];

    if (this.isRedisConnected) {
      try {
        // XRANGE lấy toàn bộ từ đầu đến cuối
        const results = await this.ioredisClient.xrange(streamKey, "-", "+");
        for (const [, fields] of results) {
          for (let i = 0; i < fields.length; i += 2) {
            if (fields[i] === "data") {
              try {
                events.push(JSON.parse(fields[i + 1]));
              } catch (e) {
                // Bỏ qua dòng lỗi parse
              }
            }
          }
        }
        return events;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
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
      } catch (e) {
        // Bỏ qua lỗi publish
      }
    }
  }
  // BKAV HaiHS : Phát tín hiệu hủy bằng pub/sub - end

  // BKAV HaiHS : set stream active - start
  async setStreamActive(streamId) {
    const activeKey = `stream:${streamId}:active`;
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.set(activeKey, "1", "EX", 1200); // TTL 20 phút
        return;
      } catch (e) {
        // Bỏ qua lỗi Redis
      }
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
      } catch (e) {
        // Bỏ qua lỗi Redis
      }
    }
    this.memoryActiveFlags.delete(streamId);
  }
  // BKAV HaiHS : xóa trạng thái stream active - end

  // BkAV HaiHS : kiểm tra xem stream có đang active ko? - start
  async isStreamActive(streamId) {
    const activeKey = `stream:${streamId}:active`;
    if (this.isRedisConnected) {
      try {
        const [activeExists, streamExists] = await Promise.all([
          this.ioredisClient.exists(activeKey),
          this.ioredisClient.exists(`stream:${streamId}:chunks`),
        ]);
        return activeExists === 1 || streamExists === 1;
      } catch (e) {
        // Bỏ qua lỗi Redis
      }
    }
    return (
      this.memoryActiveFlags.has(streamId) || this.memoryStreams.has(streamId)
    );
  }
  // BKAV HaiHS : xóa trạng thái stream active - end

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
  // lấy cache
  async cacheGet(key) {
    if (this.isRedisConnected) {
      try {
        return await this.ioredisClient.get(key);
      } catch (e) {
        // Bỏ qua lỗi quay sang đọc bộ đệm RAM
      }
    }
    const item = this.memoryCache.get(key);
    if (item) {
      // Kiểm tra xem RAM cache đã hết hạn chưa
      if (item.expiresAt && item.expiresAt < Date.now()) {
        this.memoryCache.delete(key);
        return null;
      }
      return item.value;
    }
    return null;
  }

  // ghi cache
  async cacheSet(key, value, ttlSeconds) {
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.set(key, value, "EX", ttlSeconds);
        return;
      } catch (e) {
        // Bỏ qua lỗi quay sang lưu vào bộ đệm RAM
      }
    }
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryCache.set(key, { value, expiresAt });
  }

  // xóa cache
  async cacheDel(key) {
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.del(key);
        return;
      } catch (e) {
        // Bỏ qua lỗi
      }
    }
    this.memoryCache.delete(key);
  }

  // xóa hàng loạt
  async cacheDelPattern(pattern) {
    if (this.isRedisConnected) {
      try {
        // Quét tìm các key khớp với pattern
        const keys = await this.ioredisClient.keys(pattern);
        if (keys.length > 0) {
          await this.ioredisClient.del(...keys);
        }
        return;
      } catch (e) {
        // Bỏ qua lỗi
      }
    }
    // Xóa trong bộ nhớ RAM
    // Tránh lỗi chỉ replace ký tự * đầu tiên, dùng Regex thay thế toàn bộ dấu * thành .*
    const escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("^" + escapedPattern.replace(/\*/g, ".*") + "$");
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }
  // BKAV HaiHS : Hệ thống lưu trữ Cache-Aside hỗ trợ cả Redis và RAM cục bộ - end
}

module.exports = new RedisStreamService();

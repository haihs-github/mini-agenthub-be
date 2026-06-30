const Redis = require("ioredis");

// BKAV HaiHS : Khoi tao 2 ket noi Redis rieng biet - start
class RedisStreamService {
  constructor() {
    this.isRedisConnected = false;
    this.ioredisClient = null; // Client ghi/đọc thông thường
    this.subscriberClient = null; // Client chuyên dụng cho Pub/Sub
    this.memoryStreams = new Map(); // Fallback khi Redis mất kết nối
    this.memoryActiveFlags = new Set(); // Fallback cho stream active flags
    this.memorySubscribers = new Map(); // Fallback cho Pub/Sub subscribers
    // BKAV HaiHS : Bo dem so thu tu cuc bo phong khi Redis mat ket noi - start
    this.localSeqCounters = new Map(); // streamId -> so nguyen tang dan
    // BKAV HaiHS : Bo dem so thu tu cuc bo phong khi Redis mat ket noi - end

    try {
      const redisConfig = {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        maxRetriesPerRequest: 1,
      };

      // Kết nối 1: Client ghi/đọc thông thường
      this.ioredisClient = new Redis(redisConfig);
      this.ioredisClient.on("connect", () => {
        this.isRedisConnected = true;
      });
      this.ioredisClient.on("error", () => {
        this.isRedisConnected = false;
      });

      // Kết nối 2: Client chuyên dụng cho Subscribe (không dùng cho lệnh khác)
      this.subscriberClient = new Redis(redisConfig);
      this.subscriberClient.on("error", () => {
        // Im lặng bắt lỗi kết nối subscriber
      });
    } catch (e) {
      this.isRedisConnected = false;
    }
  }
  // BKAV HaiHS : Khoi tao 2 ket noi Redis rieng biet - end

  // BKAV HaiHS : Cap so thu tu cho tung chunk de chong mat thu tu - start
  async getNextSequence(streamId) {
    const seqKey = `stream:${streamId}:seq`;
    if (this.isRedisConnected) {
      try {
        // BKAV HaiHS : Dung Pipeline de INCR + EXPIRE trong 1 round-trip duy nhat - start
        const pipeline = this.ioredisClient.pipeline();
        pipeline.incr(seqKey);
        pipeline.expire(seqKey, 86400); // TTL 24 gio
        const results = await pipeline.exec();
        const seq = results[0][1]; // Gia tri tra ve cua INCR
        // BKAV HaiHS : Dung Pipeline de INCR + EXPIRE trong 1 round-trip duy nhat - end
        return seq - 1; // Bat dau tu 0
      } catch (e) {
        // Neu Redis loi thi roi xuong fallback cuc bo
      }
    }
    // BKAV HaiHS : Fallback cuc bo: dung Map tang dan thay vi Date.now() de dam bao thu tu - start
    const current = this.localSeqCounters.get(streamId) || 0;
    this.localSeqCounters.set(streamId, current + 1);
    return current;
    // BKAV HaiHS : Fallback cuc bo: dung Map tang dan thay vi Date.now() de dam bao thu tu - end
  }
  // BKAV HaiHS : Cap so thu tu cho tung chunk de chong mat thu tu - end

  // BKAV HaiHS : Ghi chunk vao Redis Stream va dat TTL 20 phut - start
  async appendChunk(streamId, event) {
    const streamKey = `stream:${streamId}:chunks`;
    if (this.isRedisConnected) {
      try {
        // Dùng Pipeline để gửi XADD + EXPIRE trong một lần gọi duy nhất
        const pipeline = this.ioredisClient.pipeline();
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
  // BKAV HaiHS : Ghi chunk vao Redis Stream va dat TTL 20 phut - end

  // BKAV HaiHS : Phat chunk qua Redis Pub/Sub - start
  async publishChunk(streamId, event) {
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
        try { cb(event); } catch (e) {}
      }
    }
    // BKAV HaiHS : Fallback memory Pub/Sub khi Redis mat ket noi - end
  }
  // BKAV HaiHS : Phat chunk qua Redis Pub/Sub - end

  // BKAV HaiHS : Dang ky lang nghe kenh Pub/Sub dua tren 1 ket noi chung - start
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
  // BKAV HaiHS : Dang ky lang nghe kenh Pub/Sub dua tren 1 ket noi chung - end

  // BKAV HaiHS : Kiem tra stream co ton tai khong - start
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
  // BKAV HaiHS : Kiem tra stream co ton tai khong - end

  // BKAV HaiHS : Doc toan bo lich su chunk tu Redis Stream bang XRANGE - start
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
  // BKAV HaiHS : Doc toan bo lich su chunk tu Redis Stream bang XRANGE - end

  // BKAV HaiHS : Phat tin hieu HUY cheo may chu qua Pub/Sub - start
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
  // BKAV HaiHS : Phat tin hieu HUY cheo may chu qua Pub/Sub - end

  // BKAV HaiHS : Dat co trang thai stream active phan tan tren Redis - start
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
    // BKAV HaiHS : Fallback memory khi Redis mat ket noi - start
    this.memoryActiveFlags.add(streamId);
    // BKAV HaiHS : Fallback memory khi Redis mat ket noi - end
  }

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
    // BKAV HaiHS : Fallback memory: kiem tra ca flag va chunks - start
    return this.memoryActiveFlags.has(streamId) || this.memoryStreams.has(streamId);
    // BKAV HaiHS : Fallback memory: kiem tra ca flag va chunks - end
  }
  // BKAV HaiHS : Dat co trang thai stream active phan tan tren Redis - end

  // BKAV HaiHS : Xoa bo Stream khi hoan tat cuoc goi - start
  async deleteStream(streamId) {
    const streamKey = `stream:${streamId}:chunks`;
    const seqKey = `stream:${streamId}:seq`;
    const activeKey = `stream:${streamId}:active`;
    // BKAV HaiHS : Xoa bo dem so thu tu cuc bo cung voi stream - start
    this.localSeqCounters.delete(streamId);
    // BKAV HaiHS : Xoa bo dem so thu tu cuc bo cung voi stream - end
    if (this.isRedisConnected) {
      try {
        await this.ioredisClient.del(streamKey, seqKey, activeKey);
        return;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }
    this.memoryStreams.delete(streamId);
    this.memoryActiveFlags.delete(streamId);
  }
  // BKAV HaiHS : Xoa bo Stream khi hoan tat cuoc goi - end
}

module.exports = new RedisStreamService();

const Redis = require("ioredis");

// BKAV HaiHS : Khoi tao ket noi den co so du lieu Redis - start
class RedisStreamService {
  constructor() {
    this.isRedisConnected = false;
    this.redis = null;
    this.memoryStreams = new Map();

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        maxRetriesPerRequest: 1,
      });

      this.redis.on("connect", () => {
        this.isRedisConnected = true;
      });

      this.redis.on("error", () => {
        this.isRedisConnected = false;
      });
    } catch (e) {
      this.isRedisConnected = false;
    }
  }
  // BKAV HaiHS : Khoi tao ket noi den co so du lieu Redis - end

  // BKAV HaiHS : Them mot chunk moi vao Redis Stream hoac bo nho tam - start
  async addChunk(conversationId, chunk) {
    const key = `stream:conversation:${conversationId}`;
    if (this.isRedisConnected) {
      try {
        await this.redis.xadd(key, "*", "chunk", chunk);
        return;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }

    if (!this.memoryStreams.has(key)) {
      this.memoryStreams.set(key, []);
    }
    this.memoryStreams.get(key).push({
      id: Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      chunk,
    });
  }
  // BKAV HaiHS : Them mot chunk moi vao Redis Stream hoac bo nho tam - end

  // BKAV HaiHS : Doc toan bo cac chunk da luu trong Stream - start
  async readAll(conversationId) {
    const key = `stream:conversation:${conversationId}`;
    const chunks = [];
    if (this.isRedisConnected) {
      try {
        const results = await this.redis.xread("STREAMS", key, "0");
        if (results && results.length > 0) {
          const streamData = results[0][1];
          for (const item of streamData) {
            const fields = item[1];
            for (let i = 0; i < fields.length; i += 2) {
              if (fields[i] === "chunk") {
                chunks.push(fields[i + 1]);
              }
            }
          }
        }
        return chunks;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }

    const memList = this.memoryStreams.get(key) || [];
    return memList.map((item) => item.chunk);
  }
  // BKAV HaiHS : Doc toan bo cac chunk da luu trong Stream - end

  // BKAV HaiHS : Xoa bo Stream khi hoan tat cuoc goi - start
  async deleteStream(conversationId) {
    const key = `stream:conversation:${conversationId}`;
    if (this.isRedisConnected) {
      try {
        await this.redis.del(key);
        return;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }
    this.memoryStreams.delete(key);
  }
  // BKAV HaiHS : Xoa bo Stream khi hoan tat cuoc goi - end
}

module.exports = new RedisStreamService();

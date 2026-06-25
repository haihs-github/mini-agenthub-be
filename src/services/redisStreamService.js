const Redis = require("ioredis");

// BKAV HaiHS : Khoi tao ket noi den co so du lieu Redis - start
class RedisStreamService {
  constructor() {
    this.isRedisConnected = false;
    this.redis = null;
    this.memoryStreams = new Map();

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
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
        // BKAV HaiHS : Cấu hình TTL 10 phút để tự động dọn dẹp stream khi server crash - start
        await this.redis.expire(key, 600);
        // BKAV HaiHS : Cấu hình TTL 10 phút để tự động dọn dẹp stream khi server crash - end
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

  // BKAV HaiHS : Kiểm tra xem Stream có tồn tại không - start
  async hasStream(conversationId) {
    const key = `stream:conversation:${conversationId}`;
    if (this.isRedisConnected) {
      try {
        const exists = await this.redis.exists(key);
        return exists === 1;
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }
    return this.memoryStreams.has(key);
  }
  // BKAV HaiHS : Kiểm tra xem Stream có tồn tại không - end

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

  // BKAV HaiHS : Đọc các chunk mới từ một ID nhất định - start
  async readNext(conversationId, lastId, blockMs = 0) {
    const key = `stream:conversation:${conversationId}`;
    if (this.isRedisConnected) {
      try {
        let results;
        if (blockMs > 0) {
          results = await this.redis.xread(
            "BLOCK",
            blockMs,
            "STREAMS",
            key,
            lastId,
          );
        } else {
          results = await this.redis.xread("STREAMS", key, lastId);
        }

        const chunks = [];
        let nextLastId = lastId;

        if (results && results.length > 0) {
          const streamData = results[0][1];
          if (streamData.length > 0) {
            for (const item of streamData) {
              const entryId = item[0];
              nextLastId = entryId;
              const fields = item[1];
              for (let i = 0; i < fields.length; i += 2) {
                if (fields[i] === "chunk") {
                  chunks.push({ id: entryId, chunk: fields[i + 1] });
                }
              }
            }
          }
        }
        return { chunks, lastId: nextLastId };
      } catch (e) {
        // Tự động bỏ qua lỗi và chuyển sang bộ nhớ tạm
      }
    }

    const memList = this.memoryStreams.get(key) || [];
    const chunks = [];
    let nextLastId = lastId;

    const startIndex = memList.findIndex((item) => item.id === lastId);
    const sliceStart = startIndex === -1 ? 0 : startIndex + 1;
    const newItems = memList.slice(sliceStart);

    for (const item of newItems) {
      chunks.push({ id: item.id, chunk: item.chunk });
      nextLastId = item.id;
    }

    if (blockMs > 0 && chunks.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, blockMs));
    }

    return { chunks, lastId: nextLastId };
  }
  // BKAV HaiHS : Đọc các chunk mới từ một ID nhất định - end

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

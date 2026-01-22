import { createClient, RedisClientType } from 'redis';

class RedisService {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      // Don't throw error - allow app to continue without Redis
      this.client = null;
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.client = null;
      this.isConnected = false;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  // Cache operations
  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady()) {
      return null;
    }

    try {
      const value = await this.client!.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client!.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client!.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  // Cache with automatic expiration
  async cache<T>(
    key: string, 
    fetchFunction: () => Promise<T>, 
    ttlSeconds: number = 300
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const freshData = await fetchFunction();
    
    // Cache the result
    await this.set(key, freshData, ttlSeconds);
    
    return freshData;
  }

  // Invalidate cache patterns
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length > 0) {
        await this.client!.del(keys);
      }
    } catch (error) {
      console.error('Redis INVALIDATE PATTERN error:', error);
    }
  }

  // Session management
  async setSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<boolean> {
    return this.set(`session:${sessionId}`, data, ttlSeconds);
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    return this.get<T>(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.del(`session:${sessionId}`);
  }

  // Rate limiting
  async incrementCounter(key: string, ttlSeconds: number = 3600): Promise<number> {
    if (!this.isReady()) {
      return 0;
    }

    try {
      const multi = this.client!.multi();
      multi.incr(key);
      multi.expire(key, ttlSeconds);
      const results = await multi.exec();
      
      return results && results.length > 0 ? Number(results[0]) : 0;
    } catch (error) {
      console.error('Redis INCREMENT error:', error);
      return 0;
    }
  }

  // Leaderboard operations
  async addToLeaderboard(leaderboardKey: string, member: string, score: number): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      await this.client!.zAdd(leaderboardKey, { score, value: member });
      return true;
    } catch (error) {
      console.error('Redis ZADD error:', error);
      return false;
    }
  }

  async getLeaderboard(leaderboardKey: string, start: number = 0, end: number = -1): Promise<Array<{ member: string; score: number }>> {
    if (!this.isReady()) {
      return [];
    }

    try {
      const results = await this.client!.zRangeWithScores(leaderboardKey, start, end, { REV: true });
      return results.map(item => ({
        member: item.value,
        score: item.score
      }));
    } catch (error) {
      console.error('Redis ZRANGE error:', error);
      return [];
    }
  }
}

// Create singleton instance
export const redisService = new RedisService();

// Cache key generators
export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userProfile: (id: string) => `user:profile:${id}`,
  community: (id: string) => `community:${id}`,
  communityMembers: (id: string) => `community:members:${id}`,
  course: (id: string) => `course:${id}`,
  courseLessons: (id: string) => `course:lessons:${id}`,
  posts: (communityId: string, page: number = 1) => `posts:${communityId}:page:${page}`,
  leaderboard: (communityId: string) => `leaderboard:${communityId}`,
  userPoints: (userId: string) => `points:${userId}`,
  searchResults: (query: string, filters: string) => `search:${query}:${filters}`,
  notifications: (userId: string) => `notifications:${userId}`,
  rateLimit: (ip: string, endpoint: string) => `rate_limit:${ip}:${endpoint}`
};

// Cache TTL constants (in seconds)
export const CacheTTL = {
  SHORT: 60,        // 1 minute
  MEDIUM: 300,      // 5 minutes
  LONG: 1800,       // 30 minutes
  VERY_LONG: 3600,  // 1 hour
  DAY: 86400        // 24 hours
};
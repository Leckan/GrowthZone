import { Request, Response, NextFunction } from 'express';
import { redisService, CacheTTL } from '../lib/redis';

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  varyBy?: string[];
}

// Cache middleware factory
export const cache = (options: CacheOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching if Redis is not available
    if (!redisService.isReady()) {
      return next();
    }

    // Check condition if provided
    if (options.condition && !options.condition(req)) {
      return next();
    }

    // Generate cache key
    let cacheKey: string;
    if (options.keyGenerator) {
      cacheKey = options.keyGenerator(req);
    } else {
      // Default key generation
      const baseKey = `${req.method}:${req.path}`;
      const queryString = Object.keys(req.query).length > 0 ? 
        `:${JSON.stringify(req.query)}` : '';
      const varyString = options.varyBy ? 
        `:${options.varyBy.map(header => req.get(header) || '').join(':')}` : '';
      cacheKey = `cache:${baseKey}${queryString}${varyString}`;
    }

    try {
      // Try to get cached response
      const cachedResponse = await redisService.get<{
        statusCode: number;
        data: any;
        headers?: Record<string, string>;
      }>(cacheKey);

      if (cachedResponse) {
        // Set cached headers if available
        if (cachedResponse.headers) {
          Object.entries(cachedResponse.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        
        // Add cache hit header
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        return res.status(cachedResponse.statusCode).json(cachedResponse.data);
      }

      // Cache miss - intercept response
      const originalSend = res.json;
      const originalStatus = res.status;
      let statusCode = 200;

      // Override status method to capture status code
      res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json method to cache response
      res.json = function(data: any) {
        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
          const responseToCache = {
            statusCode,
            data,
            headers: {
              'Content-Type': 'application/json'
            }
          };

          // Cache asynchronously (don't wait)
          redisService.set(cacheKey, responseToCache, options.ttl || CacheTTL.MEDIUM)
            .catch(err => console.error('Cache set error:', err));
        }

        // Add cache miss header
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Key', cacheKey);

        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

// Specific cache middleware for common patterns
export const cacheUserProfile = cache({
  ttl: CacheTTL.MEDIUM,
  keyGenerator: (req) => `user:profile:${(req as any).user?.id}`,
  condition: (req) => req.method === 'GET'
});

export const cacheCommunityData = cache({
  ttl: CacheTTL.LONG,
  keyGenerator: (req) => `community:${req.params.id}:${JSON.stringify(req.query)}`,
  condition: (req) => req.method === 'GET'
});

export const cacheCourseData = cache({
  ttl: CacheTTL.LONG,
  keyGenerator: (req) => `course:${req.params.id}:${JSON.stringify(req.query)}`,
  condition: (req) => req.method === 'GET'
});

export const cacheSearchResults = cache({
  ttl: CacheTTL.SHORT,
  keyGenerator: (req) => `search:${JSON.stringify(req.query)}`,
  condition: (req) => req.method === 'GET' && Object.keys(req.query).length > 0
});

// Cache invalidation helpers
export const invalidateUserCache = async (userId: string) => {
  await redisService.invalidatePattern(`user:*${userId}*`);
  await redisService.invalidatePattern(`cache:*user*${userId}*`);
};

export const invalidateCommunityCache = async (communityId: string) => {
  await redisService.invalidatePattern(`community:*${communityId}*`);
  await redisService.invalidatePattern(`cache:*communities*${communityId}*`);
  await redisService.invalidatePattern(`posts:${communityId}:*`);
  await redisService.invalidatePattern(`leaderboard:${communityId}`);
};

export const invalidateCourseCache = async (courseId: string) => {
  await redisService.invalidatePattern(`course:*${courseId}*`);
  await redisService.invalidatePattern(`cache:*courses*${courseId}*`);
};

export const invalidateSearchCache = async () => {
  await redisService.invalidatePattern(`search:*`);
  await redisService.invalidatePattern(`cache:*search*`);
};
import { PrismaClient } from '@prisma/client';
import { redisService, CacheKeys, CacheTTL } from './redis';

// Optimized query patterns for common operations
export class QueryOptimizer {
  constructor(private prisma: PrismaClient) {}

  // Optimized user queries with caching
  async getUserWithProfile(userId: string) {
    return redisService.cache(
      CacheKeys.userProfile(userId),
      async () => {
        return this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            bio: true,
            avatarUrl: true,
            totalPoints: true,
            emailVerified: true,
            createdAt: true,
            // Optimize: Only get essential membership data
            memberships: {
              select: {
                id: true,
                role: true,
                status: true,
                joinedAt: true,
                community: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                }
              },
              where: {
                status: 'active'
              }
            }
          }
        });
      },
      CacheTTL.MEDIUM
    );
  }

  // Optimized community queries with member count caching
  async getCommunityWithStats(communityId: string) {
    return redisService.cache(
      CacheKeys.community(communityId),
      async () => {
        // Use aggregation for better performance
        const [community, memberCount, courseCount] = await Promise.all([
          this.prisma.community.findUnique({
            where: { id: communityId },
            include: {
              creator: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true
                }
              }
            }
          }),
          this.prisma.communityMembership.count({
            where: {
              communityId,
              status: 'active'
            }
          }),
          this.prisma.course.count({
            where: {
              communityId,
              isPublished: true
            }
          })
        ]);

        return community ? {
          ...community,
          memberCount,
          courseCount
        } : null;
      },
      CacheTTL.LONG
    );
  }

  // Optimized course queries with lesson progress
  async getCourseWithProgress(courseId: string, userId?: string) {
    const cacheKey = userId ? 
      `course:${courseId}:progress:${userId}` : 
      CacheKeys.course(courseId);

    return redisService.cache(
      cacheKey,
      async () => {
        const course = await this.prisma.course.findUnique({
          where: { id: courseId },
          include: {
            community: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            },
            lessons: {
              select: {
                id: true,
                title: true,
                contentType: true,
                isFree: true,
                sortOrder: true,
                createdAt: true,
                // Include progress if user is provided
                ...(userId && {
                  progress: {
                    where: { userId },
                    select: {
                      completedAt: true,
                      timeSpent: true
                    }
                  }
                })
              },
              orderBy: {
                sortOrder: 'asc'
              }
            }
          }
        });

        if (!course) return null;

        // Calculate completion stats if user provided
        if (userId && course.lessons.length > 0) {
          const completedLessons = course.lessons.filter(
            lesson => lesson.progress && lesson.progress.length > 0
          ).length;
          
          return {
            ...course,
            completionStats: {
              totalLessons: course.lessons.length,
              completedLessons,
              completionPercentage: Math.round((completedLessons / course.lessons.length) * 100)
            }
          };
        }

        return course;
      },
      userId ? CacheTTL.SHORT : CacheTTL.LONG
    );
  }

  // Optimized post queries with pagination
  async getPostsWithEngagement(communityId: string, page: number = 1, limit: number = 20) {
    return redisService.cache(
      CacheKeys.posts(communityId, page),
      async () => {
        const skip = (page - 1) * limit;
        
        return this.prisma.post.findMany({
          where: { communityId },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true
              }
            },
            // Optimize: Only get comment count, not all comments
            _count: {
              select: {
                comments: true,
                likes: true
              }
            }
          },
          orderBy: [
            { createdAt: 'desc' }
          ],
          skip,
          take: limit
        });
      },
      CacheTTL.SHORT
    );
  }

  // Optimized leaderboard queries
  async getCommunityLeaderboard(communityId: string, limit: number = 10) {
    // Try Redis sorted set first for better performance
    const cachedLeaderboard = await redisService.getLeaderboard(
      CacheKeys.leaderboard(communityId),
      0,
      limit - 1
    );

    if (cachedLeaderboard.length > 0) {
      // Get user details for cached leaderboard
      const userIds = cachedLeaderboard.map(item => item.member);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true
        }
      });

      const userMap = new Map(users.map(user => [user.id, user]));
      
      return cachedLeaderboard.map(item => ({
        ...userMap.get(item.member),
        points: item.score
      })).filter(Boolean);
    }

    // Fallback to database query
    return redisService.cache(
      `leaderboard:db:${communityId}`,
      async () => {
        const leaderboard = await this.prisma.pointsTransaction.groupBy({
          by: ['userId'],
          where: { communityId },
          _sum: {
            points: true
          },
          orderBy: {
            _sum: {
              points: 'desc'
            }
          },
          take: limit
        });

        const userIds = leaderboard.map(item => item.userId);
        const users = await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        });

        const userMap = new Map(users.map(user => [user.id, user]));

        const result = leaderboard.map(item => ({
          ...userMap.get(item.userId),
          points: item._sum.points || 0
        })).filter((item): item is NonNullable<typeof item> => Boolean(item));

        // Cache in Redis sorted set for faster future access
        for (const item of result) {
          if (item.id) {
            await redisService.addToLeaderboard(
              CacheKeys.leaderboard(communityId),
              item.id,
              item.points
            );
          }
        }

        return result;
      },
      CacheTTL.MEDIUM
    );
  }

  // Optimized search with caching
  async searchCommunities(query: string, filters: any = {}) {
    const cacheKey = CacheKeys.searchResults(query, JSON.stringify(filters));
    
    return redisService.cache(
      cacheKey,
      async () => {
        const whereClause: any = {
          isPublic: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } }
          ]
        };

        // Apply filters
        if (filters.priceRange) {
          if (filters.priceRange === 'free') {
            whereClause.AND = [
              { priceMonthly: null },
              { priceYearly: null }
            ];
          } else if (filters.priceRange === 'paid') {
            whereClause.OR = [
              { priceMonthly: { gt: 0 } },
              { priceYearly: { gt: 0 } }
            ];
          }
        }

        return this.prisma.community.findMany({
          where: whereClause,
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true
              }
            },
            _count: {
              select: {
                memberships: {
                  where: { status: 'active' }
                },
                courses: {
                  where: { isPublished: true }
                }
              }
            }
          },
          orderBy: [
            { memberCount: 'desc' },
            { createdAt: 'desc' }
          ],
          take: 50
        });
      },
      CacheTTL.MEDIUM
    );
  }

  // Batch operations for better performance
  async batchUpdateUserPoints(updates: Array<{ userId: string; communityId: string; points: number; reason: string }>) {
    // Use transaction for consistency
    return this.prisma.$transaction(async (tx) => {
      const transactions = await Promise.all(
        updates.map(update =>
          tx.pointsTransaction.create({
            data: {
              userId: update.userId,
              communityId: update.communityId,
              points: update.points,
              reason: update.reason
            }
          })
        )
      );

      // Update user total points in batch
      const userPointUpdates = updates.reduce((acc, update) => {
        acc[update.userId] = (acc[update.userId] || 0) + update.points;
        return acc;
      }, {} as Record<string, number>);

      await Promise.all(
        Object.entries(userPointUpdates).map(([userId, pointsToAdd]) =>
          tx.user.update({
            where: { id: userId },
            data: {
              totalPoints: {
                increment: pointsToAdd
              }
            }
          })
        )
      );

      // Invalidate relevant caches
      for (const update of updates) {
        await redisService.del(CacheKeys.userProfile(update.userId));
        await redisService.del(CacheKeys.leaderboard(update.communityId));
      }

      return transactions;
    });
  }
}

// Create singleton instance
export const queryOptimizer = new QueryOptimizer(
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
  })
);
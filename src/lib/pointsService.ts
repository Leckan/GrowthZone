import { PrismaClient } from '@prisma/client';
import prisma from './prisma';

export interface PointsRule {
  action: string;
  points: number;
  description: string;
}

export interface CreatePointsTransactionData {
  userId: string;
  communityId: string;
  points: number;
  reason: string;
  referenceId?: string;
}

export interface PointsQueryOptions {
  limit?: number;
  offset?: number;
  userId?: string;
  communityId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface LeaderboardOptions {
  communityId?: string;
  timeframe?: 'all' | 'month' | 'week' | 'day';
  limit?: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
  badgeIcon: string;
}

// Default point rules for different activities
export const DEFAULT_POINT_RULES: Record<string, PointsRule> = {
  POST_CREATED: {
    action: 'POST_CREATED',
    points: 10,
    description: 'Created a new post'
  },
  COMMENT_CREATED: {
    action: 'COMMENT_CREATED',
    points: 5,
    description: 'Added a comment'
  },
  POST_LIKED: {
    action: 'POST_LIKED',
    points: 2,
    description: 'Received a like on post'
  },
  COMMENT_LIKED: {
    action: 'COMMENT_LIKED',
    points: 1,
    description: 'Received a like on comment'
  },
  LESSON_COMPLETED: {
    action: 'LESSON_COMPLETED',
    points: 15,
    description: 'Completed a lesson'
  },
  COURSE_COMPLETED: {
    action: 'COURSE_COMPLETED',
    points: 50,
    description: 'Completed a course'
  },
  DAILY_LOGIN: {
    action: 'DAILY_LOGIN',
    points: 3,
    description: 'Daily login bonus'
  },
  FIRST_POST: {
    action: 'FIRST_POST',
    points: 25,
    description: 'Created first post in community'
  },
  COMMUNITY_JOINED: {
    action: 'COMMUNITY_JOINED',
    points: 5,
    description: 'Joined a community'
  }
};

// Default achievement milestones
export const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'newcomer',
    name: 'Newcomer',
    description: 'Earned your first 10 points',
    pointsRequired: 10,
    badgeIcon: '🌱'
  },
  {
    id: 'contributor',
    name: 'Contributor',
    description: 'Earned 100 points',
    pointsRequired: 100,
    badgeIcon: '⭐'
  },
  {
    id: 'active_member',
    name: 'Active Member',
    description: 'Earned 500 points',
    pointsRequired: 500,
    badgeIcon: '🏆'
  },
  {
    id: 'community_champion',
    name: 'Community Champion',
    description: 'Earned 1000 points',
    pointsRequired: 1000,
    badgeIcon: '👑'
  },
  {
    id: 'legend',
    name: 'Legend',
    description: 'Earned 5000 points',
    pointsRequired: 5000,
    badgeIcon: '💎'
  }
];

export class PointsService {
  /**
   * Award points to a user for a specific action
   */
  static async awardPoints(data: CreatePointsTransactionData) {
    const transaction = await prisma.$transaction(async (tx) => {
      // Create the points transaction
      const pointsTransaction = await tx.pointsTransaction.create({
        data: {
          userId: data.userId,
          communityId: data.communityId,
          points: data.points,
          reason: data.reason,
          referenceId: data.referenceId
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              totalPoints: true
            }
          },
          community: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      });

      // Update user's total points
      const updatedUser = await tx.user.update({
        where: { id: data.userId },
        data: {
          totalPoints: {
            increment: data.points
          }
        },
        select: {
          id: true,
          totalPoints: true
        }
      });

      return {
        transaction: pointsTransaction,
        newTotalPoints: updatedUser.totalPoints
      };
    });

    return transaction;
  }

  /**
   * Award points based on predefined rules
   */
  static async awardPointsForAction(
    userId: string,
    communityId: string,
    action: string,
    referenceId?: string,
    customPoints?: number
  ) {
    const rule = DEFAULT_POINT_RULES[action];
    if (!rule && !customPoints) {
      throw new Error(`Unknown action: ${action}`);
    }

    const points = customPoints || rule.points;
    const reason = rule?.description || `Custom action: ${action}`;

    return this.awardPoints({
      userId,
      communityId,
      points,
      reason,
      referenceId
    });
  }

  /**
   * Get user's points history with filtering
   */
  static async getUserPointsHistory(userId: string, options: PointsQueryOptions = {}) {
    const {
      limit = 50,
      offset = 0,
      communityId,
      startDate,
      endDate
    } = options;

    const where: any = { userId };

    if (communityId) {
      where.communityId = communityId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      prisma.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          community: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      }),
      prisma.pointsTransaction.count({ where })
    ]);

    return {
      transactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Get community leaderboard
   */
  static async getCommunityLeaderboard(options: LeaderboardOptions = {}) {
    const {
      communityId,
      timeframe = 'all',
      limit = 10
    } = options;

    let dateFilter: any = {};
    const now = new Date();

    // Calculate date range based on timeframe
    switch (timeframe) {
      case 'day':
        dateFilter.gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        dateFilter.gte = weekStart;
        break;
      case 'month':
        dateFilter.gte = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'all':
      default:
        // No date filter for all-time
        break;
    }

    const where: any = {};
    if (communityId) {
      where.communityId = communityId;
    }
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter;
    }

    // Get aggregated points by user
    const leaderboardData = await prisma.pointsTransaction.groupBy({
      by: ['userId'],
      where,
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

    // Get user details for the leaderboard
    const userIds = leaderboardData.map(entry => entry.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        totalPoints: true
      }
    });

    // Combine data and add ranking
    const leaderboard = leaderboardData.map((entry, index) => {
      const user = users.find(u => u.id === entry.userId);
      return {
        rank: index + 1,
        user,
        points: entry._sum.points || 0,
        totalPoints: user?.totalPoints || 0
      };
    });

    return leaderboard;
  }

  /**
   * Get global leaderboard across all communities
   */
  static async getGlobalLeaderboard(limit: number = 10) {
    const users = await prisma.user.findMany({
      orderBy: { totalPoints: 'desc' },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        totalPoints: true
      }
    });

    return users.map((user, index) => ({
      rank: index + 1,
      user,
      points: user.totalPoints
    }));
  }

  /**
   * Get user's achievements based on their total points
   */
  static async getUserAchievements(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const earnedAchievements = DEFAULT_ACHIEVEMENTS.filter(
      achievement => user.totalPoints >= achievement.pointsRequired
    );

    const nextAchievement = DEFAULT_ACHIEVEMENTS.find(
      achievement => user.totalPoints < achievement.pointsRequired
    );

    return {
      earned: earnedAchievements,
      next: nextAchievement,
      totalPoints: user.totalPoints
    };
  }

  /**
   * Get user's points summary for a specific community
   */
  static async getUserCommunityPointsSummary(userId: string, communityId: string) {
    // Get total points earned in this community
    const communityPoints = await prisma.pointsTransaction.aggregate({
      where: {
        userId,
        communityId
      },
      _sum: {
        points: true
      }
    });

    // Get recent transactions
    const recentTransactions = await prisma.pointsTransaction.findMany({
      where: {
        userId,
        communityId
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        points: true,
        reason: true,
        createdAt: true
      }
    });

    // Get user's rank in this community
    const higherRankedUsers = await prisma.pointsTransaction.groupBy({
      by: ['userId'],
      where: { communityId },
      _sum: { points: true },
      having: {
        points: {
          _sum: {
            gt: communityPoints._sum.points || 0
          }
        }
      }
    });

    const rank = higherRankedUsers.length + 1;

    return {
      totalPoints: communityPoints._sum.points || 0,
      rank,
      recentTransactions
    };
  }

  /**
   * Check if user should receive points for first-time actions
   */
  static async checkFirstTimeBonus(userId: string, communityId: string, action: string) {
    const existingTransaction = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        communityId,
        reason: { contains: action }
      }
    });

    return !existingTransaction;
  }

  /**
   * Award daily login bonus (only once per day)
   */
  static async awardDailyLoginBonus(userId: string, communityId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if user already received daily bonus today
    const existingBonus = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        communityId,
        reason: DEFAULT_POINT_RULES.DAILY_LOGIN.description,
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    if (existingBonus) {
      return null; // Already received bonus today
    }

    return this.awardPointsForAction(userId, communityId, 'DAILY_LOGIN');
  }

  /**
   * Get points statistics for a community
   */
  static async getCommunityPointsStats(communityId: string) {
    const [totalPoints, totalTransactions, topUsers] = await Promise.all([
      prisma.pointsTransaction.aggregate({
        where: { communityId },
        _sum: { points: true }
      }),
      prisma.pointsTransaction.count({
        where: { communityId }
      }),
      this.getCommunityLeaderboard({ communityId, limit: 3 })
    ]);

    return {
      totalPointsAwarded: totalPoints._sum.points || 0,
      totalTransactions,
      topUsers
    };
  }
}
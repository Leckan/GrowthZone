import prisma from './prisma';
import { DEFAULT_ACHIEVEMENTS, Achievement } from './pointsService';

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  earnedAt: Date;
  achievement: Achievement;
}

export interface AchievementProgress {
  achievement: Achievement;
  progress: number;
  isEarned: boolean;
  earnedAt?: Date;
}

export class AchievementService {
  /**
   * Check and award new achievements for a user based on their total points
   */
  static async checkAndAwardAchievements(userId: string): Promise<Achievement[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get user's current achievements (we'll store these in a separate table in the future)
    // For now, we'll determine achievements based on total points
    const newAchievements: Achievement[] = [];

    for (const achievement of DEFAULT_ACHIEVEMENTS) {
      if (user.totalPoints >= achievement.pointsRequired) {
        // Check if user already has this achievement
        // For now, we'll just return all eligible achievements
        // In a full implementation, we'd store earned achievements in a database table
        newAchievements.push(achievement);
      }
    }

    return newAchievements;
  }

  /**
   * Get all achievements with user's progress
   */
  static async getUserAchievementProgress(userId: string): Promise<AchievementProgress[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return DEFAULT_ACHIEVEMENTS.map(achievement => {
      const isEarned = user.totalPoints >= achievement.pointsRequired;
      const progress = Math.min(user.totalPoints / achievement.pointsRequired, 1);

      return {
        achievement,
        progress,
        isEarned,
        earnedAt: isEarned ? new Date() : undefined // In real implementation, this would come from database
      };
    });
  }

  /**
   * Get leaderboard with achievement counts
   */
  static async getAchievementLeaderboard(limit: number = 10) {
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

    return users.map((user, index) => {
      const earnedAchievements = DEFAULT_ACHIEVEMENTS.filter(
        achievement => user.totalPoints >= achievement.pointsRequired
      );

      return {
        rank: index + 1,
        user,
        totalPoints: user.totalPoints,
        achievementCount: earnedAchievements.length,
        achievements: earnedAchievements
      };
    });
  }

  /**
   * Get milestone tracking for a user
   */
  static async getUserMilestones(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const currentPoints = user.totalPoints;
    const earnedAchievements = DEFAULT_ACHIEVEMENTS.filter(
      achievement => currentPoints >= achievement.pointsRequired
    );

    const nextAchievement = DEFAULT_ACHIEVEMENTS.find(
      achievement => currentPoints < achievement.pointsRequired
    );

    // Calculate points needed for next milestone
    const pointsToNext = nextAchievement 
      ? nextAchievement.pointsRequired - currentPoints 
      : 0;

    // Calculate progress to next milestone
    const progressToNext = nextAchievement 
      ? currentPoints / nextAchievement.pointsRequired 
      : 1;

    return {
      currentPoints,
      earnedAchievements,
      nextAchievement,
      pointsToNext,
      progressToNext: Math.min(progressToNext, 1)
    };
  }

  /**
   * Get achievement statistics
   */
  static async getAchievementStats() {
    // Get total users
    const totalUsers = await prisma.user.count();

    // Calculate achievement distribution
    const achievementStats = await Promise.all(
      DEFAULT_ACHIEVEMENTS.map(async (achievement) => {
        const usersWithAchievement = await prisma.user.count({
          where: {
            totalPoints: {
              gte: achievement.pointsRequired
            }
          }
        });

        return {
          achievement,
          usersEarned: usersWithAchievement,
          percentage: totalUsers > 0 ? (usersWithAchievement / totalUsers) * 100 : 0
        };
      })
    );

    return {
      totalUsers,
      totalAchievements: DEFAULT_ACHIEVEMENTS.length,
      achievementStats
    };
  }

  /**
   * Get recent achievement earners
   */
  static async getRecentAchievementEarners(achievementId: string, limit: number = 10) {
    const achievement = DEFAULT_ACHIEVEMENTS.find(a => a.id === achievementId);
    
    if (!achievement) {
      throw new Error('Achievement not found');
    }

    // Get users who recently reached this achievement level
    // This is a simplified implementation - in a real system, we'd track when achievements were earned
    const users = await prisma.user.findMany({
      where: {
        totalPoints: {
          gte: achievement.pointsRequired
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        totalPoints: true,
        updatedAt: true
      }
    });

    return users.map(user => ({
      user,
      achievement,
      earnedAt: user.updatedAt // In real implementation, this would be the actual earned date
    }));
  }
}
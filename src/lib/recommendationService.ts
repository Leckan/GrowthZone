import prisma from './prisma';

export interface UserInterestData {
  category: string;
  score?: number;
}

export interface RecommendationOptions {
  limit?: number;
  excludeJoined?: boolean;
  minScore?: number;
}

export class RecommendationService {
  /**
   * Track user interest based on activity
   */
  static async trackUserInterest(userId: string, category: string, activityWeight: number = 0.1) {
    if (!category) return;

    try {
      await prisma.userInterest.upsert({
        where: {
          userId_category: {
            userId,
            category
          }
        },
        create: {
          userId,
          category,
          score: Math.min(activityWeight, 1.0)
        },
        update: {
          score: {
            increment: Math.min(activityWeight, 1.0 - 0.1) // Cap at 0.9 to allow for decay
          }
        }
      });
    } catch (error) {
      console.error('Failed to track user interest:', error);
    }
  }

  /**
   * Update user interests based on community membership
   */
  static async updateInterestsFromMembership(userId: string, communityId: string) {
    try {
      const community = await prisma.community.findUnique({
        where: { id: communityId },
        select: { category: true }
      });

      if (community?.category) {
        await this.trackUserInterest(userId, community.category, 0.3); // Higher weight for joining
      }
    } catch (error) {
      console.error('Failed to update interests from membership:', error);
    }
  }

  /**
   * Update user interests based on post engagement
   */
  static async updateInterestsFromEngagement(userId: string, communityId: string, engagementType: 'post' | 'comment' | 'like') {
    try {
      const community = await prisma.community.findUnique({
        where: { id: communityId },
        select: { category: true }
      });

      if (community?.category) {
        const weights = {
          post: 0.2,
          comment: 0.15,
          like: 0.05
        };
        
        await this.trackUserInterest(userId, community.category, weights[engagementType]);
      }
    } catch (error) {
      console.error('Failed to update interests from engagement:', error);
    }
  }

  /**
   * Get user's interests
   */
  static async getUserInterests(userId: string) {
    const interests = await prisma.userInterest.findMany({
      where: { userId },
      orderBy: { score: 'desc' }
    });

    return interests;
  }

  /**
   * Get personalized community recommendations
   */
  static async getPersonalizedRecommendations(userId: string, options: RecommendationOptions = {}) {
    const {
      limit = 10,
      excludeJoined = true,
      minScore = 0.1
    } = options;

    // Get user's interests
    const interests = await prisma.userInterest.findMany({
      where: {
        userId,
        score: { gte: minScore }
      },
      orderBy: { score: 'desc' },
      take: 5 // Top 5 interests
    });

    if (interests.length === 0) {
      // Fallback to popular communities if no interests
      return this.getPopularCommunities(limit, excludeJoined ? userId : undefined);
    }

    const categories = interests.map((i: any) => i.category);
    const categoryWeights = interests.reduce((acc: any, interest: any) => {
      acc[interest.category] = interest.score;
      return acc;
    }, {} as Record<string, number>);

    const where: any = {
      isPublic: true,
      category: { in: categories }
    };

    // Exclude communities user has already joined
    if (excludeJoined) {
      where.memberships = {
        none: { userId }
      };
    }

    const communities = await prisma.community.findMany({
      where,
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
            memberships: true,
            posts: true,
            courses: true
          }
        }
      },
      take: limit * 2 // Get more to allow for scoring
    });

    // Score and sort communities based on user interests and community popularity
    const scoredCommunities = communities.map((community: any) => {
      const categoryScore = categoryWeights[community.category || ''] || 0;
      const popularityScore = Math.log(community.memberCount + 1) / 10; // Logarithmic popularity
      const activityScore = Math.log(community._count.posts + 1) / 20; // Recent activity
      
      const totalScore = categoryScore * 0.6 + popularityScore * 0.3 + activityScore * 0.1;
      
      return {
        ...community,
        recommendationScore: totalScore
      };
    });

    // Sort by recommendation score and return top results
    return scoredCommunities
      .sort((a: any, b: any) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit)
      .map(({ recommendationScore, ...community }: any) => community);
  }

  /**
   * Get popular communities as fallback
   */
  static async getPopularCommunities(limit: number = 10, excludeUserId?: string) {
    const where: any = { isPublic: true };
    
    if (excludeUserId) {
      where.memberships = {
        none: { userId: excludeUserId }
      };
    }

    return prisma.community.findMany({
      where,
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
            memberships: true,
            posts: true,
            courses: true
          }
        }
      },
      orderBy: [
        { memberCount: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    });
  }

  /**
   * Get similar communities based on a given community
   */
  static async getSimilarCommunities(communityId: string, limit: number = 5) {
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      select: { category: true }
    });

    if (!community?.category) {
      return [];
    }

    return prisma.community.findMany({
      where: {
        category: community.category,
        id: { not: communityId },
        isPublic: true
      },
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
            memberships: true,
            posts: true,
            courses: true
          }
        }
      },
      orderBy: { memberCount: 'desc' },
      take: limit
    });
  }

  /**
   * Decay user interests over time (should be run periodically)
   */
  static async decayUserInterests(decayRate: number = 0.05) {
    try {
      await prisma.$executeRaw`
        UPDATE user_interests 
        SET score = GREATEST(score * ${1 - decayRate}, 0.01)
        WHERE score > 0.01
      `;
      
      // Remove interests that have decayed too much
      await prisma.userInterest.deleteMany({
        where: {
          score: { lte: 0.01 }
        }
      });
    } catch (error) {
      console.error('Failed to decay user interests:', error);
    }
  }

  /**
   * Set explicit user interests (for user preferences)
   */
  static async setUserInterests(userId: string, interests: UserInterestData[]) {
    try {
      // Remove existing interests not in the new list
      const newCategories = interests.map(i => i.category);
      await prisma.userInterest.deleteMany({
        where: {
          userId,
          category: { notIn: newCategories }
        }
      });

      // Upsert new interests
      for (const interest of interests) {
        await prisma.userInterest.upsert({
          where: {
            userId_category: {
              userId,
              category: interest.category
            }
          },
          create: {
            userId,
            category: interest.category,
            score: interest.score || 0.5
          },
          update: {
            score: interest.score || 0.5
          }
        });
      }
    } catch (error) {
      console.error('Failed to set user interests:', error);
      throw error;
    }
  }
}
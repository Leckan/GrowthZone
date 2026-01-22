import prisma from './prisma';
import { stripe } from './stripeService';

export interface RevenueMetrics {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  churnRate: number;
  averageRevenuePerUser: number;
  monthlyRecurringRevenue: number;
}

export interface CreatorPayout {
  creatorId: string;
  communityId: string;
  totalRevenue: number;
  platformFee: number;
  creatorEarnings: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface SubscriptionAnalytics {
  newSubscriptions: number;
  canceledSubscriptions: number;
  netGrowth: number;
  churnRate: number;
  period: {
    start: Date;
    end: Date;
  };
}

export class RevenueService {
  private static readonly PLATFORM_FEE_PERCENTAGE = 0.05; // 5% platform fee

  /**
   * Calculate revenue metrics for a specific period
   */
  static async getRevenueMetrics(
    startDate: Date,
    endDate: Date,
    communityId?: string
  ): Promise<RevenueMetrics> {
    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (communityId) {
      whereClause.communityId = communityId;
    }

    // Get all subscriptions in the period
    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      include: {
        community: {
          select: {
            priceMonthly: true,
            priceYearly: true,
          },
        },
      },
    });

    // Calculate total revenue from Stripe
    const totalRevenue = await this.calculateStripeRevenue(startDate, endDate, communityId);

    // Calculate active subscriptions
    const activeSubscriptions = await prisma.subscription.count({
      where: {
        status: { in: ['active', 'trialing'] },
        ...(communityId && { communityId }),
      },
    });

    // Calculate monthly revenue (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyRevenue = await this.calculateStripeRevenue(thirtyDaysAgo, new Date(), communityId);

    // Calculate churn rate
    const churnRate = await this.calculateChurnRate(startDate, endDate, communityId);

    // Calculate ARPU (Average Revenue Per User)
    const averageRevenuePerUser = activeSubscriptions > 0 ? totalRevenue / activeSubscriptions : 0;

    // Calculate MRR (Monthly Recurring Revenue)
    const monthlyRecurringRevenue = await this.calculateMRR(communityId);

    return {
      totalRevenue,
      monthlyRevenue,
      activeSubscriptions,
      churnRate,
      averageRevenuePerUser,
      monthlyRecurringRevenue,
    };
  }

  /**
   * Calculate creator payouts for a specific period
   */
  static async calculateCreatorPayouts(
    startDate: Date,
    endDate: Date,
    creatorId?: string
  ): Promise<CreatorPayout[]> {
    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (creatorId) {
      whereClause.creatorId = creatorId;
    }

    // Get communities and their revenue
    const communities = await prisma.community.findMany({
      where: whereClause,
      include: {
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing'] },
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    const payouts: CreatorPayout[] = [];

    for (const community of communities) {
      // Calculate revenue for this community from Stripe
      const totalRevenue = await this.calculateStripeRevenue(startDate, endDate, community.id);

      if (totalRevenue > 0) {
        const platformFee = totalRevenue * this.PLATFORM_FEE_PERCENTAGE;
        const creatorEarnings = totalRevenue - platformFee;

        payouts.push({
          creatorId: community.creatorId,
          communityId: community.id,
          totalRevenue,
          platformFee,
          creatorEarnings,
          period: {
            start: startDate,
            end: endDate,
          },
        });
      }
    }

    return payouts;
  }

  /**
   * Get subscription analytics for a period
   */
  static async getSubscriptionAnalytics(
    startDate: Date,
    endDate: Date,
    communityId?: string
  ): Promise<SubscriptionAnalytics> {
    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (communityId) {
      whereClause.communityId = communityId;
    }

    // New subscriptions in period
    const newSubscriptions = await prisma.subscription.count({
      where: whereClause,
    });

    // Canceled subscriptions in period
    const canceledSubscriptions = await prisma.subscription.count({
      where: {
        ...whereClause,
        status: { in: ['canceled', 'unpaid'] },
      },
    });

    const netGrowth = newSubscriptions - canceledSubscriptions;
    const churnRate = await this.calculateChurnRate(startDate, endDate, communityId);

    return {
      newSubscriptions,
      canceledSubscriptions,
      netGrowth,
      churnRate,
      period: {
        start: startDate,
        end: endDate,
      },
    };
  }

  /**
   * Get revenue breakdown by community
   */
  static async getRevenueBreakdown(
    startDate: Date,
    endDate: Date,
    creatorId?: string
  ): Promise<Array<{
    communityId: string;
    communityName: string;
    revenue: number;
    subscriptions: number;
    averageRevenuePerUser: number;
  }>> {
    const whereClause: any = {};

    if (creatorId) {
      whereClause.creatorId = creatorId;
    }

    const communities = await prisma.community.findMany({
      where: whereClause,
      include: {
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing'] },
          },
        },
      },
    });

    const breakdown = [];

    for (const community of communities) {
      const revenue = await this.calculateStripeRevenue(startDate, endDate, community.id);
      const subscriptions = community.subscriptions.length;
      const averageRevenuePerUser = subscriptions > 0 ? revenue / subscriptions : 0;

      breakdown.push({
        communityId: community.id,
        communityName: community.name,
        revenue,
        subscriptions,
        averageRevenuePerUser,
      });
    }

    return breakdown.sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Calculate revenue from Stripe for a specific period
   */
  private static async calculateStripeRevenue(
    startDate: Date,
    endDate: Date,
    communityId?: string
  ): Promise<number> {
    try {
      // Get all subscriptions for the period
      const whereClause: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: { in: ['active', 'trialing'] },
      };

      if (communityId) {
        whereClause.communityId = communityId;
      }

      const subscriptions = await prisma.subscription.findMany({
        where: whereClause,
        include: {
          community: {
            select: {
              priceMonthly: true,
              priceYearly: true,
            },
          },
        },
      });

      let totalRevenue = 0;

      // For each subscription, get the actual revenue from Stripe
      for (const subscription of subscriptions) {
        if (subscription.stripeSubscriptionId) {
          try {
            const invoices = await stripe.invoices.list({
              subscription: subscription.stripeSubscriptionId,
              created: {
                gte: Math.floor(startDate.getTime() / 1000),
                lte: Math.floor(endDate.getTime() / 1000),
              },
              status: 'paid',
            });

            for (const invoice of invoices.data) {
              totalRevenue += invoice.amount_paid / 100; // Convert from cents
            }
          } catch (error) {
            console.error(`Error fetching invoices for subscription ${subscription.stripeSubscriptionId}:`, error);
            // Fallback to estimated revenue based on subscription price
            const monthlyPrice = subscription.community.priceMonthly || 0;
            totalRevenue += Number(monthlyPrice);
          }
        }
      }

      return totalRevenue;
    } catch (error) {
      console.error('Error calculating Stripe revenue:', error);
      return 0;
    }
  }

  /**
   * Calculate churn rate for a specific period
   */
  private static async calculateChurnRate(
    startDate: Date,
    endDate: Date,
    communityId?: string
  ): Promise<number> {
    const whereClause: any = {};

    if (communityId) {
      whereClause.communityId = communityId;
    }

    // Get subscriptions at the start of the period
    const subscriptionsAtStart = await prisma.subscription.count({
      where: {
        ...whereClause,
        createdAt: { lte: startDate },
        status: { in: ['active', 'trialing'] },
      },
    });

    // Get canceled subscriptions during the period
    const canceledDuringPeriod = await prisma.subscription.count({
      where: {
        ...whereClause,
        updatedAt: {
          gte: startDate,
          lte: endDate,
        },
        status: { in: ['canceled', 'unpaid'] },
      },
    });

    return subscriptionsAtStart > 0 ? (canceledDuringPeriod / subscriptionsAtStart) * 100 : 0;
  }

  /**
   * Calculate Monthly Recurring Revenue (MRR)
   */
  private static async calculateMRR(communityId?: string): Promise<number> {
    const whereClause: any = {
      status: { in: ['active', 'trialing'] },
    };

    if (communityId) {
      whereClause.communityId = communityId;
    }

    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      include: {
        community: {
          select: {
            priceMonthly: true,
            priceYearly: true,
          },
        },
      },
    });

    let mrr = 0;

    for (const subscription of subscriptions) {
      // Assume monthly pricing for MRR calculation
      const monthlyPrice = subscription.community.priceMonthly || 0;
      mrr += Number(monthlyPrice);
    }

    return mrr;
  }

  /**
   * Get top performing communities by revenue
   */
  static async getTopCommunities(
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<Array<{
    communityId: string;
    communityName: string;
    creatorName: string;
    revenue: number;
    subscriptions: number;
  }>> {
    const communities = await prisma.community.findMany({
      include: {
        creator: {
          select: {
            displayName: true,
            username: true,
          },
        },
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing'] },
          },
        },
      },
    });

    const communityRevenues = [];

    for (const community of communities) {
      const revenue = await this.calculateStripeRevenue(startDate, endDate, community.id);
      
      if (revenue > 0) {
        communityRevenues.push({
          communityId: community.id,
          communityName: community.name,
          creatorName: community.creator.displayName || community.creator.username,
          revenue,
          subscriptions: community.subscriptions.length,
        });
      }
    }

    return communityRevenues
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }
}
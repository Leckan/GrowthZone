import express from 'express';
import { z } from 'zod';
import { RevenueService } from '../lib/revenueService';
import { authenticateToken } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = express.Router();

// Validation schemas
const dateRangeSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  communityId: z.string().optional(),
});

const creatorPayoutSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  creatorId: z.string().optional(),
});

/**
 * Get revenue metrics for a specific period
 */
router.get('/revenue/metrics', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, communityId } = dateRangeSchema.parse(req.query);
    const userId = req.user!.id;

    // If communityId is provided, verify user owns the community
    if (communityId) {
      const community = await prisma.community.findFirst({
        where: {
          id: communityId,
          creatorId: userId,
        },
      });

      if (!community) {
        return res.status(403).json({ error: 'Access denied to this community' });
      }
    }

    const metrics = await RevenueService.getRevenueMetrics(startDate, endDate, communityId);

    return res.json({
      metrics,
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error('Error fetching revenue metrics:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to fetch revenue metrics' });
  }
});

/**
 * Get creator payout calculations
 */
router.get('/revenue/payouts', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, creatorId } = creatorPayoutSchema.parse(req.query);
    const userId = req.user!.id;

    // If creatorId is provided and it's not the current user, check if user is admin
    if (creatorId && creatorId !== userId) {
      // For now, only allow users to see their own payouts
      return res.status(403).json({ error: 'Access denied' });
    }

    const payouts = await RevenueService.calculateCreatorPayouts(
      startDate,
      endDate,
      creatorId || userId
    );

    return res.json({
      payouts,
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error('Error calculating payouts:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to calculate payouts' });
  }
});

/**
 * Get subscription analytics
 */
router.get('/subscriptions/analytics', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, communityId } = dateRangeSchema.parse(req.query);
    const userId = req.user!.id;

    // If communityId is provided, verify user owns the community
    if (communityId) {
      const community = await prisma.community.findFirst({
        where: {
          id: communityId,
          creatorId: userId,
        },
      });

      if (!community) {
        return res.status(403).json({ error: 'Access denied to this community' });
      }
    }

    const analytics = await RevenueService.getSubscriptionAnalytics(startDate, endDate, communityId);

    return res.json(analytics);
  } catch (error) {
    console.error('Error fetching subscription analytics:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to fetch subscription analytics' });
  }
});

/**
 * Get revenue breakdown by community
 */
router.get('/revenue/breakdown', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const userId = req.user!.id;

    const breakdown = await RevenueService.getRevenueBreakdown(startDate, endDate, userId);

    return res.json({
      breakdown,
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error('Error fetching revenue breakdown:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to fetch revenue breakdown' });
  }
});

/**
 * Get top performing communities (admin only for now)
 */
router.get('/communities/top', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const { limit = '10' } = req.query;

    const topCommunities = await RevenueService.getTopCommunities(
      startDate,
      endDate,
      parseInt(limit as string)
    );

    return res.json({
      communities: topCommunities,
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error('Error fetching top communities:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to fetch top communities' });
  }
});

/**
 * Get creator dashboard summary
 */
router.get('/dashboard/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get user's communities
    const communities = await prisma.community.findMany({
      where: { creatorId: userId },
      include: {
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing'] },
          },
        },
      },
    });

    // Calculate overall metrics
    const totalCommunities = communities.length;
    const totalSubscriptions = communities.reduce((sum, community) => sum + community.subscriptions.length, 0);

    // Get revenue metrics for the last 30 days
    const revenueMetrics = await RevenueService.getRevenueMetrics(thirtyDaysAgo, now, undefined);

    // Get creator payouts for the last 30 days
    const payouts = await RevenueService.calculateCreatorPayouts(thirtyDaysAgo, now, userId);
    const totalEarnings = payouts.reduce((sum, payout) => sum + payout.creatorEarnings, 0);

    // Get revenue breakdown
    const breakdown = await RevenueService.getRevenueBreakdown(thirtyDaysAgo, now, userId);

    return res.json({
      summary: {
        totalCommunities,
        totalSubscriptions,
        totalEarnings,
        monthlyRevenue: revenueMetrics.monthlyRevenue,
        averageRevenuePerUser: revenueMetrics.averageRevenuePerUser,
        churnRate: revenueMetrics.churnRate,
      },
      breakdown,
      period: {
        start: thirtyDaysAgo,
        end: now,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
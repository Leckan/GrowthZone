import express from 'express';
import { PointsService } from '../lib/pointsService';
import { AchievementService } from '../lib/achievementService';
import { authenticateToken } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const awardPointsSchema = z.object({
  userId: z.string().min(1),
  communityId: z.string().min(1),
  points: z.number().int().min(1),
  reason: z.string().min(1),
  referenceId: z.string().optional()
});

const pointsHistoryQuerySchema = z.object({
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
  communityId: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().transform(str => new Date(str)).optional()
});

const leaderboardQuerySchema = z.object({
  communityId: z.string().optional(),
  timeframe: z.enum(['all', 'month', 'week', 'day']).optional(),
  limit: z.string().transform(Number).optional()
});

/**
 * POST /api/points/award
 * Award points to a user (admin/moderator only)
 */
router.post('/award', authenticateToken, async (req, res) => {
  try {
    const data = awardPointsSchema.parse(req.body);
    
    // TODO: Add authorization check - only admins/moderators should be able to manually award points
    
    const result = await PointsService.awardPoints(data);
    
    return res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to award points'
    });
  }
});

/**
 * GET /api/points/history/:userId
 * Get user's points history
 */
router.get('/history/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const query = pointsHistoryQuerySchema.parse(req.query);
    
    // Users can only view their own history unless they're admin/moderator
    if (req.user?.id !== userId) {
      // TODO: Add proper authorization check for admin/moderator roles
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const result = await PointsService.getUserPointsHistory(userId, query);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get points history'
    });
  }
});

/**
 * GET /api/points/leaderboard
 * Get leaderboard (community or global)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const query = leaderboardQuerySchema.parse(req.query);
    
    let result;
    if (query.communityId) {
      result = await PointsService.getCommunityLeaderboard(query);
    } else {
      result = await PointsService.getGlobalLeaderboard(query.limit);
    }
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get leaderboard'
    });
  }
});

/**
 * GET /api/points/achievements/:userId
 * Get user's achievements
 */
router.get('/achievements/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await PointsService.getUserAchievements(userId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get achievements'
    });
  }
});

/**
 * GET /api/points/community/:communityId/summary/:userId
 * Get user's points summary for a specific community
 */
router.get('/community/:communityId/summary/:userId', authenticateToken, async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    
    // Users can only view their own summary unless they're admin/moderator
    if (req.user?.id !== userId) {
      // TODO: Add proper authorization check for admin/moderator roles
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const result = await PointsService.getUserCommunityPointsSummary(userId, communityId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get points summary'
    });
  }
});

/**
 * POST /api/points/daily-bonus
 * Award daily login bonus
 */
router.post('/daily-bonus', authenticateToken, async (req, res) => {
  try {
    const { communityId } = req.body;
    
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }
    
    const result = await PointsService.awardDailyLoginBonus(req.user!.id, communityId);
    
    if (!result) {
      return res.json({
        success: true,
        message: 'Daily bonus already claimed today'
      });
    }
    
    return res.status(201).json({
      success: true,
      data: result,
      message: 'Daily bonus awarded successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to award daily bonus'
    });
  }
});

/**
 * GET /api/points/community/:communityId/stats
 * Get points statistics for a community
 */
router.get('/community/:communityId/stats', async (req, res) => {
  try {
    const { communityId } = req.params;
    
    const result = await PointsService.getCommunityPointsStats(communityId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get community stats'
    });
  }
});

/**
 * GET /api/points/achievements/progress/:userId
 * Get user's achievement progress
 */
router.get('/achievements/progress/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await AchievementService.getUserAchievementProgress(userId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get achievement progress'
    });
  }
});

/**
 * GET /api/points/achievements/leaderboard
 * Get achievement leaderboard
 */
router.get('/achievements/leaderboard', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    const result = await AchievementService.getAchievementLeaderboard(limit);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get achievement leaderboard'
    });
  }
});

/**
 * GET /api/points/milestones/:userId
 * Get user's milestone tracking
 */
router.get('/milestones/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await AchievementService.getUserMilestones(userId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get milestones'
    });
  }
});

/**
 * GET /api/points/achievements/stats
 * Get achievement statistics
 */
router.get('/achievements/stats', async (req, res) => {
  try {
    const result = await AchievementService.getAchievementStats();
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get achievement stats'
    });
  }
});

/**
 * GET /api/points/achievements/:achievementId/recent
 * Get recent earners of a specific achievement
 */
router.get('/achievements/:achievementId/recent', async (req, res) => {
  try {
    const { achievementId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    const result = await AchievementService.getRecentAchievementEarners(achievementId, limit);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get recent achievement earners'
    });
  }
});

export default router;
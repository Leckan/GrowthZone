import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../lib/validation';
import { RecommendationService } from '../lib/recommendationService';
import { z } from 'zod';

const router = Router();

// Validation schemas
const setInterestsSchema = z.object({
  interests: z.array(z.object({
    category: z.string().min(1, 'Category is required').max(50, 'Category must be less than 50 characters'),
    score: z.number().min(0).max(1).optional()
  })).min(1, 'At least one interest is required').max(10, 'Maximum 10 interests allowed')
});

const recommendationQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform(Number)
    .refine(val => val > 0 && val <= 20, 'Limit must be between 1 and 20')
    .optional()
    .or(z.number().min(1).max(20).optional()),
  
  excludeJoined: z
    .string()
    .transform(val => val === 'true')
    .optional()
    .or(z.boolean().optional()),
  
  minScore: z
    .string()
    .regex(/^\d*\.?\d+$/, 'Min score must be a number')
    .transform(Number)
    .refine(val => val >= 0 && val <= 1, 'Min score must be between 0 and 1')
    .optional()
    .or(z.number().min(0).max(1).optional())
});

/**
 * GET /api/v1/recommendations/interests
 * Get user's current interests
 */
router.get('/interests', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const interests = await RecommendationService.getUserInterests(req.user!.id);

    res.json({
      success: true,
      data: interests
    });
  } catch (error) {
    console.error('Get user interests error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch user interests'
    });
  }
});

/**
 * PUT /api/v1/recommendations/interests
 * Set user's interests
 */
router.put('/interests', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateRequest(setInterestsSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    await RecommendationService.setUserInterests(req.user!.id, validation.data!.interests);

    res.json({
      success: true,
      message: 'User interests updated successfully'
    });
  } catch (error) {
    console.error('Set user interests error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update user interests'
    });
  }
});

/**
 * GET /api/v1/recommendations/communities
 * Get personalized community recommendations
 */
router.get('/communities', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateRequest(recommendationQuerySchema, req.query);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const options: any = validation.data || {};
    
    const recommendations = await RecommendationService.getPersonalizedRecommendations(
      req.user!.id,
      options
    );

    res.json({
      success: true,
      data: {
        communities: recommendations,
        total: recommendations.length
      }
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch recommendations'
    });
  }
});

/**
 * GET /api/v1/recommendations/similar/:communityId
 * Get similar communities to a given community
 */
router.get('/similar/:communityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;

    if (limit < 1 || limit > 10) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Limit must be between 1 and 10'
      });
      return;
    }

    const similarCommunities = await RecommendationService.getSimilarCommunities(
      communityId,
      limit
    );

    res.json({
      success: true,
      data: {
        communities: similarCommunities,
        total: similarCommunities.length
      }
    });
  } catch (error) {
    console.error('Get similar communities error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch similar communities'
    });
  }
});

export default router;
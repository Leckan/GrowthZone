import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../lib/validation';
import { ProgressService } from '../lib/progressService';
import { z } from 'zod';

const router = Router();

// Progress update validation schema
const updateProgressSchema = z.object({
  timeSpent: z
    .number()
    .min(0, 'Time spent must be non-negative')
    .max(86400, 'Time spent cannot exceed 24 hours (86400 seconds)')
    .optional(),
  
  completed: z
    .boolean()
    .optional()
});

// Progress query validation schema
const progressQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform(Number)
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional()
    .or(z.number().min(1).max(100).optional()),
  
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a number')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be non-negative')
    .optional()
    .or(z.number().min(0).optional())
});

/**
 * PUT /api/v1/progress/lessons/:lessonId
 * Update progress for a specific lesson
 */
router.put('/lessons/:lessonId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { lessonId } = req.params;
    
    const validation = validateRequest(updateProgressSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const progress = await ProgressService.updateLessonProgress(
      lessonId, 
      req.user!.id, 
      validation.data!
    );

    res.json({
      success: true,
      data: progress,
      message: 'Progress updated successfully'
    });
  } catch (error) {
    console.error('Update lesson progress error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Lesson not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to lesson' || 
          error.message === 'Premium lesson requires active subscription') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update progress'
    });
  }
});

/**
 * GET /api/v1/progress/courses/:courseId
 * Get user's progress for a specific course
 */
router.get('/courses/:courseId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    
    const progress = await ProgressService.getCourseProgress(courseId, req.user!.id);

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Get course progress error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to course') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get course progress'
    });
  }
});

/**
 * GET /api/v1/progress/communities/:communityId
 * Get user's progress across all courses in a community
 */
router.get('/communities/:communityId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const progress = await ProgressService.getCommunityProgress(communityId, req.user!.id);

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Get community progress error:', error);
    
    if (error instanceof Error && error.message === 'Access denied to community') {
      res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get community progress'
    });
  }
});

/**
 * GET /api/v1/progress/analytics
 * Get user's overall progress analytics
 */
router.get('/analytics', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateRequest(progressQuerySchema, req.query);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const { courseId, communityId } = req.query;
    
    const options: any = validation.data || {};
    
    if (courseId && typeof courseId === 'string') {
      options.courseId = courseId;
    }
    
    if (communityId && typeof communityId === 'string') {
      options.communityId = communityId;
    }

    const analytics = await ProgressService.getUserProgressAnalytics(req.user!.id, options);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get progress analytics error:', error);

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get progress analytics'
    });
  }
});

/**
 * GET /api/v1/progress/communities/:communityId/leaderboard
 * Get community leaderboard based on progress
 */
router.get('/communities/:communityId/leaderboard', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    const { limit } = req.query;
    
    const leaderboardLimit = limit && typeof limit === 'string' 
      ? Math.min(parseInt(limit), 50) 
      : 10;

    const leaderboard = await ProgressService.getCommunityLeaderboard(
      communityId, 
      req.user!.id, 
      leaderboardLimit
    );

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Get community leaderboard error:', error);
    
    if (error instanceof Error && error.message === 'Access denied to community leaderboard') {
      res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get leaderboard'
    });
  }
});

/**
 * DELETE /api/v1/progress/lessons/:lessonId/users/:userId
 * Reset progress for a specific user and lesson (admin only)
 */
router.delete('/lessons/:lessonId/users/:userId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { lessonId, userId } = req.params;
    
    const result = await ProgressService.resetLessonProgress(lessonId, userId, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Reset lesson progress error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Lesson not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to reset progress') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to reset progress'
    });
  }
});

export default router;
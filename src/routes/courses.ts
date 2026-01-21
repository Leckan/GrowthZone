import { Router, Request, Response } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { 
  validateRequest, 
  createCourseSchema, 
  updateCourseSchema,
  createLessonSchema,
  updateLessonSchema,
  courseQuerySchema,
  reorderSchema,
  publishCourseSchema,
  bulkPublishSchema
} from '../lib/validation';
import { CourseService } from '../lib/courseService';

const router = Router();

/**
 * GET /api/v1/courses/community/:communityId
 * Get courses for a community
 */
router.get('/community/:communityId', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const validation = validateRequest(courseQuerySchema, req.query);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const result = await CourseService.getCourses(communityId, req.user?.id, validation.data || {});

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get courses error:', error);
    
    if (error instanceof Error && error.message === 'Access denied to community courses') {
      res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch courses'
    });
  }
});

/**
 * POST /api/v1/courses/community/:communityId
 * Create a new course in a community
 */
router.post('/community/:communityId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const validation = validateRequest(createCourseSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const course = await CourseService.createCourse(communityId, req.user!.id, validation.data!);

    res.status(201).json({
      success: true,
      data: course,
      message: 'Course created successfully'
    });
  } catch (error) {
    console.error('Create course error:', error);
    
    if (error instanceof Error && error.message === 'Insufficient permissions to create courses in this community') {
      res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create course'
    });
  }
});

/**
 * GET /api/v1/courses/:id
 * Get a single course with lessons
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const course = await CourseService.getCourse(id, req.user?.id);

    res.json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error('Get course error:', error);
    
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
      message: error instanceof Error ? error.message : 'Failed to fetch course'
    });
  }
});

/**
 * PUT /api/v1/courses/:id
 * Update a course
 */
router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(updateCourseSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const course = await CourseService.updateCourse(id, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: course,
      message: 'Course updated successfully'
    });
  } catch (error) {
    console.error('Update course error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to update course') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update course'
    });
  }
});

/**
 * DELETE /api/v1/courses/:id
 * Delete a course
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await CourseService.deleteCourse(id, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Delete course error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to delete course') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete course'
    });
  }
});

/**
 * POST /api/v1/courses/:id/lessons
 * Create a new lesson in a course
 */
router.post('/:id/lessons', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: courseId } = req.params;
    
    const validation = validateRequest(createLessonSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const lesson = await CourseService.createLesson(courseId, req.user!.id, validation.data!);

    res.status(201).json({
      success: true,
      data: lesson,
      message: 'Lesson created successfully'
    });
  } catch (error) {
    console.error('Create lesson error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to create lessons in this course') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create lesson'
    });
  }
});

/**
 * GET /api/v1/courses/:id/lessons
 * Get lessons for a course
 */
router.get('/:id/lessons', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: courseId } = req.params;
    
    const lessons = await CourseService.getLessons(courseId, req.user?.id);

    res.json({
      success: true,
      data: lessons
    });
  } catch (error) {
    console.error('Get lessons error:', error);
    
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
      message: error instanceof Error ? error.message : 'Failed to fetch lessons'
    });
  }
});

/**
 * GET /api/v1/lessons/:id
 * Get a single lesson
 */
router.get('/lessons/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const lesson = await CourseService.getLesson(id, req.user?.id);

    res.json({
      success: true,
      data: lesson
    });
  } catch (error) {
    console.error('Get lesson error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Lesson not found' || error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: 'Lesson not found'
        });
        return;
      }
      
      if (error.message === 'Access denied to course') {
        res.status(403).json({
          error: 'Access denied',
          message: 'Access denied to lesson'
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch lesson'
    });
  }
});

/**
 * PUT /api/v1/lessons/:id
 * Update a lesson
 */
router.put('/lessons/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(updateLessonSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const lesson = await CourseService.updateLesson(id, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: lesson,
      message: 'Lesson updated successfully'
    });
  } catch (error) {
    console.error('Update lesson error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Lesson not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to update lesson') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update lesson'
    });
  }
});

/**
 * DELETE /api/v1/lessons/:id
 * Delete a lesson
 */
router.delete('/lessons/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await CourseService.deleteLesson(id, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Delete lesson error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Lesson not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to delete lesson') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete lesson'
    });
  }
});

/**
 * PUT /api/v1/courses/:id/publish
 * Publish or unpublish a course
 */
router.put('/:id/publish', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(publishCourseSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const course = await CourseService.publishCourse(id, req.user!.id, validation.data!.isPublished);

    res.json({
      success: true,
      data: course,
      message: `Course ${validation.data!.isPublished ? 'published' : 'unpublished'} successfully`
    });
  } catch (error) {
    console.error('Publish course error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to publish course' ||
          error.message === 'Cannot publish course without lessons') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to publish course'
    });
  }
});

/**
 * GET /api/v1/courses/:id/publishing-info
 * Get course publishing status and validation
 */
router.get('/:id/publishing-info', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const publishingInfo = await CourseService.getCoursePublishingInfo(id, req.user!.id);

    res.json({
      success: true,
      data: publishingInfo
    });
  } catch (error) {
    console.error('Get course publishing info error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to view course publishing info') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get publishing info'
    });
  }
});

/**
 * PUT /api/v1/courses/community/:communityId/bulk-publish
 * Bulk publish/unpublish courses
 */
router.put('/community/:communityId/bulk-publish', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const validation = validateRequest(bulkPublishSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const result = await CourseService.bulkPublishCourses(
      communityId, 
      req.user!.id, 
      validation.data!.courseIds, 
      validation.data!.isPublished
    );

    res.json({
      success: true,
      data: result.courses,
      message: result.message
    });
  } catch (error) {
    console.error('Bulk publish courses error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to publish courses' ||
          error.message.includes('Cannot publish course')) {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to bulk publish courses'
    });
  }
});

/**
 * PUT /api/v1/courses/community/:communityId/reorder
 * Reorder courses in a community
 */
router.put('/community/:communityId/reorder', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const validation = validateRequest(reorderSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const result = await CourseService.reorderCourses(communityId, req.user!.id, validation.data!.ids);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Reorder courses error:', error);
    
    if (error instanceof Error && error.message === 'Insufficient permissions to reorder courses') {
      res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to reorder courses'
    });
  }
});

/**
 * PUT /api/v1/courses/:id/lessons/reorder
 * Reorder lessons in a course
 */
router.put('/:id/lessons/reorder', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: courseId } = req.params;
    
    const validation = validateRequest(reorderSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const result = await CourseService.reorderLessons(courseId, req.user!.id, validation.data!.ids);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Reorder lessons error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to reorder lessons') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to reorder lessons'
    });
  }
});

export default router;
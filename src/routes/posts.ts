import { Router, Request, Response } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { 
  validateRequest, 
  createPostSchema, 
  updatePostSchema,
  createCommentSchema,
  updateCommentSchema,
  postQuerySchema,
  reportContentSchema
} from '../lib/validation';
import { PostService, PostQueryOptions } from '../lib/postService';

const router = Router();

/**
 * GET /api/v1/posts/community/:communityId
 * Get posts from a community with filtering and pagination
 */
router.get('/community/:communityId', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const validation = validateRequest(postQuerySchema, req.query);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const result = await PostService.getCommunityPosts(communityId, req.user?.id, validation.data as PostQueryOptions);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get community posts error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Community not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch posts'
    });
  }
});

/**
 * POST /api/v1/posts/community/:communityId
 * Create a new post in a community
 */
router.post('/community/:communityId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { communityId } = req.params;
    
    const validation = validateRequest(createPostSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const post = await PostService.createPost(communityId, req.user!.id, validation.data!);

    // Emit real-time event for new post using SocketService
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.broadcastNewPost(communityId, post);
    }

    res.status(201).json({
      success: true,
      data: post,
      message: 'Post created successfully'
    });
  } catch (error) {
    console.error('Create post error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Access denied - not a member of this community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to create announcements') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create post'
    });
  }
});

/**
 * GET /api/v1/posts/:id
 * Get a single post with details
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const post = await PostService.getPost(id, req.user?.id);

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Get post error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch post'
    });
  }
});

/**
 * PUT /api/v1/posts/:id
 * Update a post
 */
router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(updatePostSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const post = await PostService.updatePost(id, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: post,
      message: 'Post updated successfully'
    });
  } catch (error) {
    console.error('Update post error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to edit this post' ||
          error.message === 'Insufficient permissions to create announcements') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update post'
    });
  }
});

/**
 * DELETE /api/v1/posts/:id
 * Delete a post
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await PostService.deletePost(id, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Delete post error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to delete this post') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete post'
    });
  }
});

/**
 * POST /api/v1/posts/:id/like
 * Toggle like on a post
 */
router.post('/:id/like', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await PostService.togglePostLike(id, req.user!.id);

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('Toggle post like error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to toggle post like'
    });
  }
});

/**
 * GET /api/v1/posts/:id/comments
 * Get comments for a post
 */
router.get('/:id/comments', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const comments = await PostService.getPostComments(id, req.user?.id);

    res.json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error('Get post comments error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch comments'
    });
  }
});

/**
 * POST /api/v1/posts/:id/comments
 * Create a comment on a post
 */
router.post('/:id/comments', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(createCommentSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const comment = await PostService.createComment(id, req.user!.id, validation.data!);

    // Emit real-time event for new comment using SocketService
    const socketService = req.app.get('socketService');
    if (socketService) {
      // Get the post to find the community ID
      const post = await PostService.getPost(id, req.user!.id);
      socketService.broadcastNewComment(post.communityId, id, comment);
    }

    res.status(201).json({
      success: true,
      data: comment,
      message: 'Comment created successfully'
    });
  } catch (error) {
    console.error('Create comment error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Parent comment not found or does not belong to this post') {
        res.status(400).json({
          error: 'Bad request',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create comment'
    });
  }
});

/**
 * PUT /api/v1/posts/comments/:commentId
 * Update a comment
 */
router.put('/comments/:commentId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    
    const validation = validateRequest(updateCommentSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const comment = await PostService.updateComment(commentId, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: comment,
      message: 'Comment updated successfully'
    });
  } catch (error) {
    console.error('Update comment error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Comment not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to edit this comment') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update comment'
    });
  }
});

/**
 * DELETE /api/v1/posts/comments/:commentId
 * Delete a comment
 */
router.delete('/comments/:commentId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    
    const result = await PostService.deleteComment(commentId, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Comment not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Insufficient permissions to delete this comment') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete comment'
    });
  }
});

/**
 * POST /api/v1/posts/comments/:commentId/like
 * Toggle like on a comment
 */
router.post('/comments/:commentId/like', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    
    const result = await PostService.toggleCommentLike(commentId, req.user!.id);

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('Toggle comment like error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Comment not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to toggle comment like'
    });
  }
});

/**
 * POST /api/v1/posts/:id/report
 * Report a post for inappropriate content
 */
router.post('/:id/report', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(reportContentSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const report = await PostService.reportPost(id, req.user!.id, validation.data!);

    res.status(201).json({
      success: true,
      data: report,
      message: 'Post reported successfully'
    });
  } catch (error) {
    console.error('Report post error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Post not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'You have already reported this post') {
        res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to report post'
    });
  }
});

/**
 * POST /api/v1/posts/comments/:commentId/report
 * Report a comment for inappropriate content
 */
router.post('/comments/:commentId/report', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    
    const validation = validateRequest(reportContentSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const report = await PostService.reportComment(commentId, req.user!.id, validation.data!);

    res.status(201).json({
      success: true,
      data: report,
      message: 'Comment reported successfully'
    });
  } catch (error) {
    console.error('Report comment error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Comment not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'You have already reported this comment') {
        res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to report comment'
    });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';
import { 
  updateProfileSchema, 
  activityQuerySchema, 
  validateRequest 
} from '../lib/validation';

const router = Router();

/**
 * GET /api/v1/users/profile
 * Get current user's profile information
 */
router.get('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    // Fetch complete user profile with statistics
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        totalPoints: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            posts: true,
            comments: true,
            memberships: true,
            createdCommunities: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({
        error: 'User not found',
        message: 'User profile not found'
      });
      return;
    }

    res.status(200).json({
      message: 'Profile retrieved successfully',
      user: {
        ...user,
        statistics: {
          postsCount: user._count.posts,
          commentsCount: user._count.comments,
          communitiesJoined: user._count.memberships,
          communitiesCreated: user._count.createdCommunities
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve profile'
    });
  }
});

/**
 * PUT /api/v1/users/profile
 * Update current user's profile information
 */
router.put('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    // Validate request body
    const validation = validateRequest(updateProfileSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const updateData = validation.data!;

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(updateData.displayName !== undefined && { displayName: updateData.displayName }),
        ...(updateData.bio !== undefined && { bio: updateData.bio }),
        ...(updateData.avatarUrl !== undefined && { avatarUrl: updateData.avatarUrl })
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        totalPoints: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update profile'
    });
  }
});

/**
 * GET /api/v1/users/activity
 * Get current user's activity history
 */
router.get('/activity', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    // Parse and validate query parameters manually
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const type = req.query.type as string | undefined;

    // Validate parsed parameters
    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({
        error: 'Validation failed',
        details: { limit: ['Limit must be a number between 1 and 100'] }
      });
      return;
    }

    if (isNaN(offset) || offset < 0) {
      res.status(400).json({
        error: 'Validation failed',
        details: { offset: ['Offset must be a non-negative number'] }
      });
      return;
    }

    if (type && !['posts', 'comments', 'progress', 'points'].includes(type)) {
      res.status(400).json({
        error: 'Validation failed',
        details: { type: ['Type must be one of: posts, comments, progress, points'] }
      });
      return;
    }

    let activities: any[] = [];

    if (!type || type === 'posts') {
      // Get user's posts
      const posts = await prisma.post.findMany({
        where: { authorId: req.user.id },
        select: {
          id: true,
          title: true,
          content: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          community: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      activities.push(...posts.map(post => ({
        type: 'post',
        id: post.id,
        title: post.title,
        content: post.content?.substring(0, 200) + (post.content && post.content.length > 200 ? '...' : ''),
        engagement: {
          likes: post.likeCount,
          comments: post.commentCount
        },
        community: post.community,
        createdAt: post.createdAt
      })));
    }

    if (!type || type === 'comments') {
      // Get user's comments
      const comments = await prisma.comment.findMany({
        where: { authorId: req.user.id },
        select: {
          id: true,
          content: true,
          likeCount: true,
          createdAt: true,
          post: {
            select: {
              id: true,
              title: true,
              community: {
                select: {
                  id: true,
                  name: true,
                  slug: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      activities.push(...comments.map(comment => ({
        type: 'comment',
        id: comment.id,
        content: comment.content.substring(0, 200) + (comment.content.length > 200 ? '...' : ''),
        engagement: {
          likes: comment.likeCount
        },
        post: comment.post,
        community: comment.post.community,
        createdAt: comment.createdAt
      })));
    }

    if (!type || type === 'progress') {
      // Get user's lesson progress
      const progress = await prisma.userProgress.findMany({
        where: { 
          userId: req.user.id,
          completedAt: { not: null }
        },
        select: {
          id: true,
          completedAt: true,
          timeSpent: true,
          lesson: {
            select: {
              id: true,
              title: true,
              course: {
                select: {
                  id: true,
                  title: true,
                  community: {
                    select: {
                      id: true,
                      name: true,
                      slug: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { completedAt: 'desc' },
        take: limit,
        skip: offset
      });

      activities.push(...progress.map(p => ({
        type: 'progress',
        id: p.id,
        lesson: p.lesson,
        course: p.lesson.course,
        community: p.lesson.course.community,
        timeSpent: p.timeSpent,
        createdAt: p.completedAt
      })));
    }

    if (!type || type === 'points') {
      // Get user's points transactions
      const pointsTransactions = await prisma.pointsTransaction.findMany({
        where: { userId: req.user.id },
        select: {
          id: true,
          points: true,
          reason: true,
          referenceId: true,
          createdAt: true,
          community: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      activities.push(...pointsTransactions.map(transaction => ({
        type: 'points',
        id: transaction.id,
        points: transaction.points,
        reason: transaction.reason,
        referenceId: transaction.referenceId,
        community: transaction.community,
        createdAt: transaction.createdAt
      })));
    }

    // Sort all activities by creation date
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply limit if we're fetching all types
    if (!type) {
      activities = activities.slice(0, limit);
    }

    res.status(200).json({
      message: 'Activity retrieved successfully',
      activities,
      pagination: {
        limit,
        offset,
        total: activities.length
      }
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve activity'
    });
  }
});

export default router;
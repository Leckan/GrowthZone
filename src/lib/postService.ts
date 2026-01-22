import { PrismaClient } from '@prisma/client';
import prisma from './prisma';
import { PointsService } from './pointsService';
import { notificationService, NotificationType } from './notificationService';
import { RecommendationService } from './recommendationService';

export interface CreatePostData {
  title?: string;
  content: string;
  postType?: 'discussion' | 'announcement';
}

export interface UpdatePostData {
  title?: string;
  content?: string;
  postType?: 'discussion' | 'announcement';
}

export interface CreateCommentData {
  content: string;
  parentId?: string;
}

export interface UpdateCommentData {
  content: string;
}

export interface ReportContentData {
  reason: 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other';
  description?: string;
}

export interface PostQueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
  postType?: 'discussion' | 'announcement';
  sortBy?: 'newest' | 'oldest' | 'popular';
}

export class PostService {
  /**
   * Create a new post in a community
   */
  static async createPost(communityId: string, authorId: string, data: CreatePostData) {
    // Verify user is a member of the community
    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId: authorId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('Access denied - not a member of this community');
    }

    // Only moderators and admins can create announcements
    if (data.postType === 'announcement' && !['moderator', 'admin'].includes(membership.role)) {
      throw new Error('Insufficient permissions to create announcements');
    }

    const post = await prisma.post.create({
      data: {
        communityId,
        authorId,
        title: data.title,
        content: data.content,
        postType: data.postType || 'discussion'
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      }
    });

    // Award points for creating a post
    try {
      // Check if this is user's first post in the community
      const isFirstPost = await PointsService.checkFirstTimeBonus(authorId, communityId, 'POST_CREATED');
      
      if (isFirstPost) {
        await PointsService.awardPointsForAction(authorId, communityId, 'FIRST_POST', post.id);
      } else {
        await PointsService.awardPointsForAction(authorId, communityId, 'POST_CREATED', post.id);
      }
      
      // Track user interest in this community's category
      await RecommendationService.updateInterestsFromEngagement(authorId, communityId, 'post');
    } catch (error) {
      // Log error but don't fail the post creation
      console.error('Failed to award points or track interests for post creation:', error);
    }

    return post;
  }

  /**
   * Get posts from a community with filtering and pagination
   */
  static async getCommunityPosts(communityId: string, userId?: string, options: PostQueryOptions = {}) {
    const {
      limit = 20,
      offset = 0,
      search,
      postType,
      sortBy = 'newest'
    } = options;

    // Verify community exists and user has access
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      include: {
        memberships: userId ? {
          where: { userId, status: 'active' }
        } : false
      }
    });

    if (!community) {
      throw new Error('Community not found');
    }

    // Check access permissions
    if (!community.isPublic) {
      if (!userId || !community.memberships || community.memberships.length === 0) {
        throw new Error('Access denied to private community');
      }
    }

    // Build where clause
    const where: any = {
      communityId
    };

    if (postType) {
      where.postType = postType;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Build order by clause
    let orderBy: any = {};
    switch (sortBy) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'popular':
        orderBy = [
          { likeCount: 'desc' },
          { commentCount: 'desc' },
          { createdAt: 'desc' }
        ];
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          },
          _count: {
            select: {
              comments: true,
              likes: true
            }
          },
          likes: userId ? {
            where: { userId },
            select: { id: true }
          } : false
        }
      }),
      prisma.post.count({ where })
    ]);

    // Add isLiked flag for authenticated users
    const postsWithLikeStatus = posts.map(post => ({
      ...post,
      isLiked: userId && post.likes && post.likes.length > 0,
      likes: undefined // Remove likes array from response
    }));

    return {
      posts: postsWithLikeStatus,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Get a single post with comments
   */
  static async getPost(postId: string, userId?: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            isPublic: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        },
        likes: userId ? {
          where: { userId },
          select: { id: true }
        } : false
      }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Check access permissions
    if (!post.community.isPublic && userId) {
      const membership = await prisma.communityMembership.findFirst({
        where: {
          communityId: post.communityId,
          userId,
          status: 'active'
        }
      });

      if (!membership) {
        throw new Error('Access denied to private community');
      }
    } else if (!post.community.isPublic && !userId) {
      throw new Error('Access denied to private community');
    }

    return {
      ...post,
      isLiked: userId && post.likes && post.likes.length > 0,
      likes: undefined // Remove likes array from response
    };
  }

  /**
   * Update a post
   */
  static async updatePost(postId: string, userId: string, data: UpdatePostData) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        community: {
          include: {
            memberships: {
              where: { userId, status: 'active' }
            }
          }
        }
      }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Check permissions - author or community moderator/admin
    const membership = post.community.memberships[0];
    const canEdit = post.authorId === userId || 
                   (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canEdit) {
      throw new Error('Insufficient permissions to edit this post');
    }

    // Only moderators and admins can change post type to announcement
    if (data.postType === 'announcement' && post.authorId !== userId) {
      if (!membership || !['moderator', 'admin'].includes(membership.role)) {
        throw new Error('Insufficient permissions to create announcements');
      }
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        title: data.title,
        content: data.content,
        postType: data.postType
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      }
    });

    return updatedPost;
  }

  /**
   * Delete a post
   */
  static async deletePost(postId: string, userId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        community: {
          include: {
            memberships: {
              where: { userId, status: 'active' }
            }
          }
        }
      }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Check permissions - author or community moderator/admin
    const membership = post.community.memberships[0];
    const canDelete = post.authorId === userId || 
                     (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      throw new Error('Insufficient permissions to delete this post');
    }

    await prisma.post.delete({
      where: { id: postId }
    });

    return { message: 'Post deleted successfully' };
  }

  /**
   * Toggle like on a post
   */
  static async togglePostLike(postId: string, userId: string) {
    // Verify post exists and user has access
    const post = await this.getPost(postId, userId);

    const existingLike = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });

    if (existingLike) {
      // Unlike the post
      await prisma.$transaction([
        prisma.postLike.delete({
          where: { id: existingLike.id }
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } }
        })
      ]);

      return { liked: false, message: 'Post unliked successfully' };
    } else {
      // Like the post
      await prisma.$transaction([
        prisma.postLike.create({
          data: { userId, postId }
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } }
        })
      ]);

      // Award points to post author for receiving a like
      try {
        await PointsService.awardPointsForAction(post.authorId, post.communityId, 'POST_LIKED', postId);
        
        // Send notification to post author (if not liking their own post)
        if (post.authorId !== userId) {
          await notificationService.createNotification({
            userId: post.authorId,
            type: NotificationType.POST_LIKE,
            title: 'Your post was liked!',
            message: `Someone liked your post: "${post.title || 'Untitled'}"`,
            data: {
              postId,
              communityId: post.communityId,
              likerId: userId
            }
          });
        }
      } catch (error) {
        console.error('Failed to award points for post like:', error);
      }

      return { liked: true, message: 'Post liked successfully' };
    }
  }

  /**
   * Create a comment on a post
   */
  static async createComment(postId: string, authorId: string, data: CreateCommentData) {
    // Verify post exists and user has access
    const post = await this.getPost(postId, authorId);

    // If replying to a comment, verify parent comment exists and belongs to this post
    if (data.parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: data.parentId }
      });

      if (!parentComment || parentComment.postId !== postId) {
        throw new Error('Parent comment not found or does not belong to this post');
      }
    }

    const comment = await prisma.$transaction(async (tx) => {
      // Create the comment
      const newComment = await tx.comment.create({
        data: {
          postId,
          authorId,
          parentId: data.parentId,
          content: data.content
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          },
          _count: {
            select: {
              replies: true,
              likes: true
            }
          }
        }
      });

      // Update post comment count
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } }
      });

      return newComment;
    });

    // Award points for creating a comment
    try {
      await PointsService.awardPointsForAction(authorId, post.communityId, 'COMMENT_CREATED', comment.id);
      
      // Send notification to post author (if not commenting on their own post)
      if (post.authorId !== authorId) {
        await notificationService.createNotification({
          userId: post.authorId,
          type: NotificationType.COMMENT_REPLY,
          title: 'New comment on your post',
          message: `Someone commented on your post: "${post.title || 'Untitled'}"`,
          data: {
            postId,
            commentId: comment.id,
            communityId: post.communityId,
            commenterId: authorId
          }
        });
      }
      
      // If this is a reply to another comment, notify the parent comment author
      if (data.parentId) {
        const parentComment = await prisma.comment.findUnique({
          where: { id: data.parentId },
          select: { authorId: true }
        });
        
        if (parentComment && parentComment.authorId !== authorId && parentComment.authorId !== post.authorId) {
          await notificationService.createNotification({
            userId: parentComment.authorId,
            type: NotificationType.COMMENT_REPLY,
            title: 'Someone replied to your comment',
            message: `You got a reply on your comment in "${post.title || 'Untitled'}"`,
            data: {
              postId,
              commentId: comment.id,
              parentCommentId: data.parentId,
              communityId: post.communityId,
              replierId: authorId
            }
          });
        }
      }
    } catch (error) {
      // Log error but don't fail the comment creation
      console.error('Failed to award points for comment creation:', error);
    }

    return comment;
  }

  /**
   * Get comments for a post with threading
   */
  static async getPostComments(postId: string, userId?: string) {
    // Verify post exists and user has access
    await this.getPost(postId, userId);

    const comments = await prisma.comment.findMany({
      where: { 
        postId,
        parentId: null // Only get top-level comments
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true
              }
            },
            _count: {
              select: {
                likes: true
              }
            },
            likes: userId ? {
              where: { userId },
              select: { id: true }
            } : false
          }
        },
        _count: {
          select: {
            replies: true,
            likes: true
          }
        },
        likes: userId ? {
          where: { userId },
          select: { id: true }
        } : false
      }
    });

    // Add isLiked flag for authenticated users
    const commentsWithLikeStatus = comments.map(comment => ({
      ...comment,
      isLiked: userId && comment.likes && comment.likes.length > 0,
      likes: undefined,
      replies: comment.replies.map(reply => ({
        ...reply,
        isLiked: userId && reply.likes && reply.likes.length > 0,
        likes: undefined
      }))
    }));

    return commentsWithLikeStatus;
  }

  /**
   * Update a comment
   */
  static async updateComment(commentId: string, userId: string, data: UpdateCommentData) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            community: {
              include: {
                memberships: {
                  where: { userId, status: 'active' }
                }
              }
            }
          }
        }
      }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Check permissions - author or community moderator/admin
    const membership = comment.post.community.memberships[0];
    const canEdit = comment.authorId === userId || 
                   (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canEdit) {
      throw new Error('Insufficient permissions to edit this comment');
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { content: data.content },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        _count: {
          select: {
            replies: true,
            likes: true
          }
        }
      }
    });

    return updatedComment;
  }

  /**
   * Delete a comment
   */
  static async deleteComment(commentId: string, userId: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            community: {
              include: {
                memberships: {
                  where: { userId, status: 'active' }
                }
              }
            }
          }
        },
        _count: {
          select: {
            replies: true
          }
        }
      }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Check permissions - author or community moderator/admin
    const membership = comment.post.community.memberships[0];
    const canDelete = comment.authorId === userId || 
                     (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      throw new Error('Insufficient permissions to delete this comment');
    }

    await prisma.$transaction(async (tx) => {
      // Delete the comment (cascade will handle replies)
      await tx.comment.delete({
        where: { id: commentId }
      });

      // Update post comment count (including replies)
      const totalCommentsDeleted = 1 + comment._count.replies;
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: totalCommentsDeleted } }
      });
    });

    return { message: 'Comment deleted successfully' };
  }

  /**
   * Toggle like on a comment
   */
  static async toggleCommentLike(commentId: string, userId: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            community: true
          }
        }
      }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Verify user has access to the community
    if (!comment.post.community.isPublic) {
      const membership = await prisma.communityMembership.findFirst({
        where: {
          communityId: comment.post.communityId,
          userId,
          status: 'active'
        }
      });

      if (!membership) {
        throw new Error('Access denied to private community');
      }
    }

    const existingLike = await prisma.commentLike.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId
        }
      }
    });

    if (existingLike) {
      // Unlike the comment
      await prisma.$transaction([
        prisma.commentLike.delete({
          where: { id: existingLike.id }
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } }
        })
      ]);

      return { liked: false, message: 'Comment unliked successfully' };
    } else {
      // Like the comment
      await prisma.$transaction([
        prisma.commentLike.create({
          data: { userId, commentId }
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } }
        })
      ]);

      // Award points to comment author for receiving a like
      try {
        await PointsService.awardPointsForAction(comment.authorId, comment.post.communityId, 'COMMENT_LIKED', commentId);
      } catch (error) {
        console.error('Failed to award points for comment like:', error);
      }

      return { liked: true, message: 'Comment liked successfully' };
    }
  }

  /**
   * Report a post for inappropriate content
   */
  static async reportPost(postId: string, reporterId: string, data: ReportContentData) {
    // Verify post exists and user has access
    await this.getPost(postId, reporterId);

    // Check if user has already reported this post
    const existingReport = await prisma.contentReport.findFirst({
      where: {
        reporterId,
        postId,
        status: { in: ['pending', 'reviewed'] }
      }
    });

    if (existingReport) {
      throw new Error('You have already reported this post');
    }

    const report = await prisma.contentReport.create({
      data: {
        reporterId,
        postId,
        reason: data.reason,
        description: data.description
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            author: {
              select: {
                id: true,
                username: true,
                displayName: true
              }
            }
          }
        }
      }
    });

    return report;
  }

  /**
   * Report a comment for inappropriate content
   */
  static async reportComment(commentId: string, reporterId: string, data: ReportContentData) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            community: true
          }
        }
      }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Verify user has access to the community
    if (!comment.post.community.isPublic) {
      const membership = await prisma.communityMembership.findFirst({
        where: {
          communityId: comment.post.communityId,
          userId: reporterId,
          status: 'active'
        }
      });

      if (!membership) {
        throw new Error('Access denied to private community');
      }
    }

    // Check if user has already reported this comment
    const existingReport = await prisma.contentReport.findFirst({
      where: {
        reporterId,
        commentId,
        status: { in: ['pending', 'reviewed'] }
      }
    });

    if (existingReport) {
      throw new Error('You have already reported this comment');
    }

    const report = await prisma.contentReport.create({
      data: {
        reporterId,
        commentId,
        reason: data.reason,
        description: data.description
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        },
        comment: {
          select: {
            id: true,
            content: true,
            author: {
              select: {
                id: true,
                username: true,
                displayName: true
              }
            }
          }
        }
      }
    });

    return report;
  }
}
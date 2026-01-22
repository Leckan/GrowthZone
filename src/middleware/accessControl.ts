import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { auditLogger } from '../lib/auditLogger';

// Extend Express Request interface to include access control context
declare global {
  namespace Express {
    interface Request {
      accessContext?: {
        communityId?: string;
        membership?: {
          role: string;
          status: string;
          joinedAt: Date;
        };
        hasAccess: boolean;
        hasPaidAccess: boolean;
        isCreator: boolean;
      };
    }
  }
}

export type Permission = 
  | 'community:read'
  | 'community:write'
  | 'community:admin'
  | 'community:delete'
  | 'member:read'
  | 'member:write'
  | 'member:remove'
  | 'course:read'
  | 'course:write'
  | 'course:publish'
  | 'course:delete'
  | 'lesson:read'
  | 'lesson:write'
  | 'lesson:delete'
  | 'post:read'
  | 'post:write'
  | 'post:moderate'
  | 'post:delete'
  | 'comment:read'
  | 'comment:write'
  | 'comment:moderate'
  | 'comment:delete'
  | 'points:read'
  | 'points:admin'
  | 'payment:read'
  | 'payment:admin';

export type Role = 'member' | 'moderator' | 'admin' | 'creator';

/**
 * Permission matrix defining what each role can do
 */
const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  member: [
    'community:read',
    'course:read',
    'lesson:read',
    'post:read',
    'post:write',
    'comment:read',
    'comment:write',
    'points:read'
  ],
  moderator: [
    'community:read',
    'community:write',
    'member:read',
    'member:write',
    'course:read',
    'course:write',
    'lesson:read',
    'lesson:write',
    'post:read',
    'post:write',
    'post:moderate',
    'comment:read',
    'comment:write',
    'comment:moderate',
    'points:read'
  ],
  admin: [
    'community:read',
    'community:write',
    'community:admin',
    'member:read',
    'member:write',
    'member:remove',
    'course:read',
    'course:write',
    'course:publish',
    'course:delete',
    'lesson:read',
    'lesson:write',
    'lesson:delete',
    'post:read',
    'post:write',
    'post:moderate',
    'post:delete',
    'comment:read',
    'comment:write',
    'comment:moderate',
    'comment:delete',
    'points:read',
    'points:admin',
    'payment:read'
  ],
  creator: [
    'community:read',
    'community:write',
    'community:admin',
    'community:delete',
    'member:read',
    'member:write',
    'member:remove',
    'course:read',
    'course:write',
    'course:publish',
    'course:delete',
    'lesson:read',
    'lesson:write',
    'lesson:delete',
    'post:read',
    'post:write',
    'post:moderate',
    'post:delete',
    'comment:read',
    'comment:write',
    'comment:moderate',
    'comment:delete',
    'points:read',
    'points:admin',
    'payment:read',
    'payment:admin'
  ]
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_MATRIX[role]?.includes(permission) || false;
}

/**
 * Get user's effective role in a community
 */
export function getEffectiveRole(membership: any, isCreator: boolean): Role {
  if (isCreator) return 'creator';
  if (!membership || membership.status !== 'active') return 'member';
  return membership.role as Role;
}

/**
 * Middleware to load community access context
 */
export function loadCommunityContext(communityIdParam: string = 'communityId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const communityId = req.params[communityIdParam];
      
      if (!communityId) {
        req.accessContext = { hasAccess: false, hasPaidAccess: false, isCreator: false };
        next();
        return;
      }

      // Get community information
      const community = await prisma.community.findUnique({
        where: { id: communityId },
        select: {
          id: true,
          isPublic: true,
          creatorId: true,
          priceMonthly: true,
          priceYearly: true
        }
      });

      if (!community) {
        req.accessContext = { hasAccess: false, hasPaidAccess: false, isCreator: false };
        next();
        return;
      }

      let membership = null;
      let hasAccess = false;
      let hasPaidAccess = false;
      let isCreator = false;

      if (req.user) {
        isCreator = community.creatorId === req.user.id;

        // Get user's membership
        membership = await prisma.communityMembership.findUnique({
          where: {
            userId_communityId: {
              userId: req.user.id,
              communityId
            }
          }
        });

        // Determine access
        if (isCreator || (membership && membership.status === 'active')) {
          hasAccess = true;
        } else if (community.isPublic) {
          hasAccess = true;
        }

        // Determine paid access
        if (isCreator) {
          hasPaidAccess = true;
        } else if (!community.priceMonthly && !community.priceYearly) {
          hasPaidAccess = hasAccess; // Free community
        } else if (membership && membership.status === 'active') {
          // Check for active subscription
          const subscription = await prisma.subscription.findFirst({
            where: {
              userId: req.user.id,
              communityId,
              status: 'active'
            }
          });
          hasPaidAccess = !!subscription;
        }
      } else {
        // Non-authenticated users
        hasAccess = community.isPublic;
        hasPaidAccess = false;
      }

      req.accessContext = {
        communityId,
        membership: membership || undefined,
        hasAccess,
        hasPaidAccess,
        isCreator
      };

      next();
    } catch (error) {
      console.error('Error loading community context:', error);
      req.accessContext = { hasAccess: false, hasPaidAccess: false, isCreator: false };
      next();
    }
  };
}

/**
 * Middleware to require specific permission
 */
export function requirePermission(permission: Permission, options: { 
  allowPublicRead?: boolean;
  requirePaidAccess?: boolean;
} = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        // Handle public read access for non-authenticated users
        if (options.allowPublicRead && permission.endsWith(':read') && req.accessContext?.hasAccess) {
          next();
          return;
        }

        auditLogger.logSecurityEvent({
          userId: null,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: 'Authentication required',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(401).json({
          error: 'Authentication required',
          message: 'Please log in to access this resource'
        });
        return;
      }

      if (!req.accessContext) {
        auditLogger.logSecurityEvent({
          userId: req.user.id,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: 'Access context not loaded',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(403).json({
          error: 'Access denied',
          message: 'Access context not available'
        });
        return;
      }

      // Check basic access
      if (!req.accessContext.hasAccess) {
        auditLogger.logSecurityEvent({
          userId: req.user.id,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: 'No community access',
          communityId: req.accessContext.communityId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this community'
        });
        return;
      }

      // Check paid access if required
      if (options.requirePaidAccess && !req.accessContext.hasPaidAccess) {
        auditLogger.logSecurityEvent({
          userId: req.user.id,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: 'Paid access required',
          communityId: req.accessContext.communityId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(402).json({
          error: 'Payment required',
          message: 'This content requires a paid subscription'
        });
        return;
      }

      // Get user's effective role
      const effectiveRole = getEffectiveRole(req.accessContext.membership, req.accessContext.isCreator);

      // Check permission
      if (!hasPermission(effectiveRole, permission)) {
        auditLogger.logSecurityEvent({
          userId: req.user.id,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: `Insufficient permissions (role: ${effectiveRole})`,
          communityId: req.accessContext.communityId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(403).json({
          error: 'Access denied',
          message: `Insufficient permissions. Required: ${permission}`
        });
        return;
      }

      // Log successful access for sensitive operations
      if (permission.includes('admin') || permission.includes('delete') || permission.includes('moderate')) {
        auditLogger.logSecurityEvent({
          userId: req.user.id,
          action: 'ACCESS_GRANTED',
          resource: permission,
          reason: `Permission granted (role: ${effectiveRole})`,
          communityId: req.accessContext.communityId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      }

      next();
    } catch (error) {
      console.error('Error checking permission:', error);
      
      auditLogger.logSecurityEvent({
        userId: req.user?.id || null,
        action: 'ACCESS_ERROR',
        resource: permission,
        reason: `Permission check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        communityId: req.accessContext?.communityId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to verify permissions'
      });
    }
  };
}

/**
 * Middleware to require community membership
 */
export function requireMembership(options: { 
  allowPending?: boolean;
  requirePaidAccess?: boolean;
} = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
      return;
    }

    if (!req.accessContext) {
      res.status(403).json({
        error: 'Access denied',
        message: 'Access context not available'
      });
      return;
    }

    // Creator always has access
    if (req.accessContext.isCreator) {
      next();
      return;
    }

    // Check membership
    if (!req.accessContext.membership) {
      auditLogger.logSecurityEvent({
        userId: req.user.id,
        action: 'ACCESS_DENIED',
        resource: 'membership',
        reason: 'Not a member',
        communityId: req.accessContext.communityId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(403).json({
        error: 'Access denied',
        message: 'You must be a member of this community'
      });
      return;
    }

    // Check membership status
    const validStatuses = options.allowPending ? ['active', 'pending'] : ['active'];
    if (!validStatuses.includes(req.accessContext.membership.status)) {
      auditLogger.logSecurityEvent({
        userId: req.user.id,
        action: 'ACCESS_DENIED',
        resource: 'membership',
        reason: `Invalid membership status: ${req.accessContext.membership.status}`,
        communityId: req.accessContext.communityId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(403).json({
        error: 'Access denied',
        message: 'Your membership status does not allow access to this resource'
      });
      return;
    }

    // Check paid access if required
    if (options.requirePaidAccess && !req.accessContext.hasPaidAccess) {
      auditLogger.logSecurityEvent({
        userId: req.user.id,
        action: 'ACCESS_DENIED',
        resource: 'paid_content',
        reason: 'Paid access required',
        communityId: req.accessContext.communityId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(402).json({
        error: 'Payment required',
        message: 'This content requires a paid subscription'
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check content access (for lessons, posts, etc.)
 */
export function requireContentAccess(contentType: 'lesson' | 'post' | 'comment') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'Please log in to access this content'
        });
        return;
      }

      const contentId = req.params.id || req.params.lessonId || req.params.postId || req.params.commentId;
      
      if (!contentId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Content ID is required'
        });
        return;
      }

      let content: any = null;
      let communityId: string | null = null;

      // Get content and associated community
      switch (contentType) {
        case 'lesson':
          content = await prisma.lesson.findUnique({
            where: { id: contentId },
            include: {
              course: {
                include: {
                  community: {
                    select: {
                      id: true,
                      isPublic: true,
                      creatorId: true,
                      priceMonthly: true,
                      priceYearly: true
                    }
                  }
                }
              }
            }
          });
          communityId = content?.course?.community?.id;
          break;
        
        case 'post':
          content = await prisma.post.findUnique({
            where: { id: contentId },
            include: {
              community: {
                select: {
                  id: true,
                  isPublic: true,
                  creatorId: true
                }
              }
            }
          });
          communityId = content?.community?.id;
          break;
        
        case 'comment':
          content = await prisma.comment.findUnique({
            where: { id: contentId },
            include: {
              post: {
                include: {
                  community: {
                    select: {
                      id: true,
                      isPublic: true,
                      creatorId: true
                    }
                  }
                }
              }
            }
          });
          communityId = content?.post?.community?.id;
          break;
      }

      if (!content || !communityId) {
        res.status(404).json({
          error: 'Not found',
          message: `${contentType} not found`
        });
        return;
      }

      // Load community context if not already loaded
      if (!req.accessContext || req.accessContext.communityId !== communityId) {
        req.params.communityId = communityId;
        await new Promise<void>((resolve, reject) => {
          loadCommunityContext('communityId')(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Check basic access
      if (!req.accessContext?.hasAccess) {
        auditLogger.logSecurityEvent({
          userId: req.user.id,
          action: 'ACCESS_DENIED',
          resource: `${contentType}:${contentId}`,
          reason: 'No community access',
          communityId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this community'
        });
        return;
      }

      // For lessons, check if it's premium content
      if (contentType === 'lesson' && !content.isFree && !req.accessContext.hasPaidAccess) {
        // Allow creators, admins, and moderators to access premium content
        const effectiveRole = getEffectiveRole(req.accessContext.membership, req.accessContext.isCreator);
        if (!['creator', 'admin', 'moderator'].includes(effectiveRole)) {
          auditLogger.logSecurityEvent({
            userId: req.user.id,
            action: 'ACCESS_DENIED',
            resource: `lesson:${contentId}`,
            reason: 'Premium content requires paid access',
            communityId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          res.status(402).json({
            error: 'Payment required',
            message: 'This lesson requires a paid subscription'
          });
          return;
        }
      }

      next();
    } catch (error) {
      console.error('Error checking content access:', error);
      
      auditLogger.logSecurityEvent({
        userId: req.user?.id || null,
        action: 'ACCESS_ERROR',
        resource: `${contentType}:${req.params.id}`,
        reason: `Content access check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to verify content access'
      });
    }
  };
}
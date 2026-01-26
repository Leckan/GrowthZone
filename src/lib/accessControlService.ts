import prisma from './prisma';
import { auditLogger } from './auditLogger';
import { Permission, Role, hasPermission, getEffectiveRole } from '../middleware/accessControl';

export interface AccessCheckResult {
  hasAccess: boolean;
  hasPaidAccess: boolean;
  role: Role;
  isCreator: boolean;
  membership?: any;
  reason?: string;
}

export interface ContentAccessResult extends AccessCheckResult {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

/**
 * Service for access control operations
 */
export class AccessControlService {
  /**
   * Check user's access to a community
   */
  static async checkCommunityAccess(communityId: string, userId?: string): Promise<AccessCheckResult> {
    try {
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
        return {
          hasAccess: false,
          hasPaidAccess: false,
          role: 'member',
          isCreator: false,
          reason: 'Community not found'
        };
      }

      if (!userId) {
        return {
          hasAccess: community.isPublic,
          hasPaidAccess: false,
          role: 'member',
          isCreator: false,
          reason: community.isPublic ? undefined : 'Authentication required'
        };
      }

      const isCreator = community.creatorId === userId;

      // Get user's membership
      const membership = await prisma.communityMembership.findUnique({
        where: {
          userId_communityId: {
            userId,
            communityId
          }
        }
      });

      // Determine access
      let hasAccess = false;
      let hasPaidAccess = false;
      let reason: string | undefined;

      if (isCreator || (membership && membership.status === 'active')) {
        hasAccess = true;
      } else if (community.isPublic) {
        hasAccess = true;
      } else {
        reason = 'Private community requires membership';
      }

      // Determine paid access
      if (isCreator) {
        hasPaidAccess = true;
      } else if (!community.priceMonthly && !community.priceYearly) {
        // Free community - only active members get paid access
        hasPaidAccess = hasAccess && membership !== null && membership.status === 'active';
      } else if (membership && membership.status === 'active') {
        // Check for active subscription
        const subscription = await prisma.subscription.findFirst({
          where: {
            userId,
            communityId,
            status: 'active'
          }
        });
        hasPaidAccess = !!subscription;
        if (!hasPaidAccess && hasAccess) {
          reason = 'Paid subscription required for premium content';
        }
      }

      const effectiveRole = getEffectiveRole(membership, isCreator);

      return {
        hasAccess,
        hasPaidAccess,
        role: effectiveRole,
        isCreator,
        membership,
        reason
      };
    } catch (error) {
      console.error('Error checking community access:', error);
      return {
        hasAccess: false,
        hasPaidAccess: false,
        role: 'member',
        isCreator: false,
        reason: 'Access check failed'
      };
    }
  }

  /**
   * Check user's access to specific content (lesson, post, comment)
   */
  static async checkContentAccess(
    contentType: 'lesson' | 'post' | 'comment',
    contentId: string,
    userId?: string
  ): Promise<ContentAccessResult> {
    try {
      let content: any = null;
      let communityId: string | null = null;
      let isAuthor = false;
      let isPremium = false;

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
          isPremium = !content?.isFree;
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
          isAuthor = content?.authorId === userId;
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
          isAuthor = content?.authorId === userId;
          break;
      }

      if (!content || !communityId) {
        return {
          hasAccess: false,
          hasPaidAccess: false,
          role: 'member',
          isCreator: false,
          canView: false,
          canEdit: false,
          canDelete: false,
          canModerate: false,
          reason: `${contentType} not found`
        };
      }

      // Check community access
      const communityAccess = await this.checkCommunityAccess(communityId, userId);

      if (!communityAccess.hasAccess) {
        return {
          ...communityAccess,
          canView: false,
          canEdit: false,
          canDelete: false,
          canModerate: false
        };
      }

      // Check content-specific access
      let canView = true;
      let canEdit = false;
      let canDelete = false;
      let canModerate = false;

      // For premium lessons, check paid access
      if (contentType === 'lesson' && isPremium && !communityAccess.hasPaidAccess) {
        // Allow creators, admins, and moderators to view premium content
        if (!['creator', 'admin', 'moderator'].includes(communityAccess.role)) {
          canView = false;
        }
      }

      // Edit permissions
      if (isAuthor || communityAccess.isCreator) {
        canEdit = true;
      } else if (contentType === 'lesson' && hasPermission(communityAccess.role, 'lesson:write')) {
        canEdit = true;
      } else if (contentType !== 'lesson' && hasPermission(communityAccess.role, `${contentType}:write` as Permission)) {
        canEdit = true;
      }

      // Delete permissions
      if (isAuthor || communityAccess.isCreator) {
        canDelete = true;
      } else if (hasPermission(communityAccess.role, `${contentType}:delete` as Permission)) {
        canDelete = true;
      }

      // Moderation permissions
      if (hasPermission(communityAccess.role, `${contentType}:moderate` as Permission)) {
        canModerate = true;
      }

      return {
        ...communityAccess,
        canView,
        canEdit,
        canDelete,
        canModerate
      };
    } catch (error) {
      console.error('Error checking content access:', error);
      return {
        hasAccess: false,
        hasPaidAccess: false,
        role: 'member',
        isCreator: false,
        canView: false,
        canEdit: false,
        canDelete: false,
        canModerate: false,
        reason: 'Content access check failed'
      };
    }
  }

  /**
   * Validate user permission for a specific action
   */
  static async validatePermission(
    userId: string,
    communityId: string,
    permission: Permission,
    options: { requirePaidAccess?: boolean } = {}
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const access = await this.checkCommunityAccess(communityId, userId);

      if (!access.hasAccess) {
        await auditLogger.logSecurityEvent({
          userId,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: access.reason || 'No community access',
          communityId
        });

        return {
          allowed: false,
          reason: access.reason || 'Access denied to community'
        };
      }

      // For write/admin permissions, require active membership (not just basic access)
      const requiresActiveMembership = permission.includes(':write') || 
                                     permission.includes(':admin') || 
                                     permission.includes(':moderate') || 
                                     permission.includes(':delete') ||
                                     permission.includes(':publish');

      if (requiresActiveMembership && !access.isCreator && 
          (!access.membership || access.membership.status !== 'active')) {
        await auditLogger.logSecurityEvent({
          userId,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: 'Active membership required for this action',
          communityId
        });

        return {
          allowed: false,
          reason: 'Active membership required for this action'
        };
      }

      if (options.requirePaidAccess && !access.hasPaidAccess) {
        await auditLogger.logSecurityEvent({
          userId,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: 'Paid access required',
          communityId
        });

        return {
          allowed: false,
          reason: 'Paid subscription required'
        };
      }

      if (!hasPermission(access.role, permission)) {
        await auditLogger.logSecurityEvent({
          userId,
          action: 'ACCESS_DENIED',
          resource: permission,
          reason: `Insufficient permissions (role: ${access.role})`,
          communityId
        });

        return {
          allowed: false,
          reason: `Insufficient permissions. Required: ${permission}`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error validating permission:', error);
      
      await auditLogger.logSecurityEvent({
        userId,
        action: 'ACCESS_ERROR',
        resource: permission,
        reason: `Permission validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        communityId
      });

      return {
        allowed: false,
        reason: 'Permission validation failed'
      };
    }
  }

  /**
   * Get user's permissions in a community
   */
  static async getUserPermissions(userId: string, communityId: string): Promise<{
    role: Role;
    permissions: Permission[];
    hasAccess: boolean;
    hasPaidAccess: boolean;
  }> {
    const access = await this.checkCommunityAccess(communityId, userId);
    
    const permissions = access.hasAccess ? 
      (PERMISSION_MATRIX[access.role] || []) : 
      [];

    return {
      role: access.role,
      permissions,
      hasAccess: access.hasAccess,
      hasPaidAccess: access.hasPaidAccess
    };
  }

  /**
   * Bulk check access for multiple communities
   */
  static async checkMultipleCommunityAccess(
    communityIds: string[],
    userId?: string
  ): Promise<Record<string, AccessCheckResult>> {
    const results: Record<string, AccessCheckResult> = {};

    await Promise.all(
      communityIds.map(async (communityId) => {
        results[communityId] = await this.checkCommunityAccess(communityId, userId);
      })
    );

    return results;
  }

  /**
   * Check if user can perform bulk operations
   */
  static async validateBulkOperation(
    userId: string,
    communityId: string,
    operation: 'publish' | 'delete' | 'moderate',
    resourceIds: string[]
  ): Promise<{ allowed: boolean; allowedIds: string[]; deniedIds: string[]; reason?: string }> {
    try {
      const access = await this.checkCommunityAccess(communityId, userId);

      if (!access.hasAccess) {
        return {
          allowed: false,
          allowedIds: [],
          deniedIds: resourceIds,
          reason: 'No community access'
        };
      }

      // Check if user has permission for the operation
      const permissionMap: Record<string, Permission> = {
        publish: 'course:publish',
        delete: 'course:delete',
        moderate: 'post:moderate'
      };

      const requiredPermission = permissionMap[operation];
      if (!hasPermission(access.role, requiredPermission)) {
        return {
          allowed: false,
          allowedIds: [],
          deniedIds: resourceIds,
          reason: `Insufficient permissions for ${operation} operation`
        };
      }

      // For now, if user has permission, they can operate on all resources
      // In the future, we could add resource-specific checks here
      return {
        allowed: true,
        allowedIds: resourceIds,
        deniedIds: []
      };
    } catch (error) {
      console.error('Error validating bulk operation:', error);
      return {
        allowed: false,
        allowedIds: [],
        deniedIds: resourceIds,
        reason: 'Bulk operation validation failed'
      };
    }
  }
}

// Permission matrix for reference
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
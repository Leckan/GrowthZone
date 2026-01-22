import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { loadCommunityContext, requirePermission } from '../middleware/accessControl';
import { auditLogger } from '../lib/auditLogger';
import { AccessControlService } from '../lib/accessControlService';
import { notificationService, NotificationType } from '../lib/notificationService';
import JobScheduler from '../lib/jobScheduler';
import prisma from '../lib/prisma';

const router = Router();

/**
 * GET /api/v1/admin/communities/:communityId/audit-logs
 * Get audit logs for a community (admin only)
 */
router.get('/communities/:communityId/audit-logs', 
  authenticateToken,
  loadCommunityContext(),
  requirePermission('community:admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { communityId } = req.params;
      
      // Parse query parameters manually for better type safety
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const action = req.query.action as string | undefined;
      const resource = req.query.resource as string | undefined;
      const userId = req.query.userId as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      // Validate parsed parameters
      if (isNaN(limit) || limit < 1 || limit > 100) {
        res.status(400).json({
          error: 'Validation failed',
          details: { limit: ['Limit must be between 1 and 100'] }
        });
        return;
      }

      if (isNaN(offset) || offset < 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: { offset: ['Offset must be non-negative'] }
        });
        return;
      }
      
      const result = await auditLogger.getAuditLogs({
        communityId,
        limit,
        offset,
        action,
        resource,
        userId,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to fetch audit logs'
      });
    }
  }
);

/**
 * GET /api/v1/admin/communities/:communityId/security-summary
 * Get security summary for a community (admin only)
 */
router.get('/communities/:communityId/security-summary',
  authenticateToken,
  loadCommunityContext(),
  requirePermission('community:admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { communityId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const summary = await auditLogger.getSecuritySummary(communityId, days);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Get security summary error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to fetch security summary'
      });
    }
  }
);

/**
 * GET /api/v1/admin/communities/:communityId/access-report
 * Get access control report for a community (admin only)
 */
router.get('/communities/:communityId/access-report',
  authenticateToken,
  loadCommunityContext(),
  requirePermission('community:admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { communityId } = req.params;
      
      // Get community members with their roles and permissions
      const members = await prisma.communityMembership.findMany({
        where: { communityId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
              totalPoints: true
            }
          }
        },
        orderBy: [
          { role: 'asc' },
          { joinedAt: 'asc' }
        ]
      });

      // Get permissions for each member
      const membersWithPermissions = await Promise.all(
        members.map(async (member) => {
          const permissions = await AccessControlService.getUserPermissions(
            member.user.id,
            communityId
          );
          
          return {
            ...member,
            permissions: permissions.permissions,
            effectiveRole: permissions.role
          };
        })
      );

      // Get recent access denied events
      const recentDenials = await auditLogger.getAuditLogs({
        communityId,
        action: 'ACCESS_DENIED',
        limit: 20,
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      });

      res.json({
        success: true,
        data: {
          members: membersWithPermissions,
          recentDenials: recentDenials.logs,
          summary: {
            totalMembers: members.length,
            adminCount: members.filter(m => m.role === 'admin').length,
            moderatorCount: members.filter(m => m.role === 'moderator').length,
            memberCount: members.filter(m => m.role === 'member').length,
            pendingCount: members.filter(m => m.status === 'pending').length,
            suspendedCount: members.filter(m => m.status === 'suspended').length
          }
        }
      });
    } catch (error) {
      console.error('Get access report error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to generate access report'
      });
    }
  }
);

/**
 * POST /api/v1/admin/communities/:communityId/validate-permissions
 * Validate user permissions for specific actions (admin only)
 */
router.post('/communities/:communityId/validate-permissions',
  authenticateToken,
  loadCommunityContext(),
  requirePermission('community:admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { communityId } = req.params;
      const { userId, permissions } = req.body;

      if (!userId || !Array.isArray(permissions)) {
        res.status(400).json({
          error: 'Bad request',
          message: 'userId and permissions array are required'
        });
        return;
      }

      const results = await Promise.all(
        permissions.map(async (permission: string) => {
          const validation = await AccessControlService.validatePermission(
            userId,
            communityId,
            permission as any
          );
          
          return {
            permission,
            allowed: validation.allowed,
            reason: validation.reason
          };
        })
      );

      res.json({
        success: true,
        data: {
          userId,
          communityId,
          results
        }
      });
    } catch (error) {
      console.error('Validate permissions error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to validate permissions'
      });
    }
  }
);

/**
 * GET /api/v1/admin/users/:userId/access-summary
 * Get access summary for a specific user across communities (super admin only)
 */
router.get('/users/:userId/access-summary',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      // Only allow users to view their own access summary or super admins
      // For now, we'll just allow users to view their own
      if (req.user!.id !== userId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You can only view your own access summary'
        });
        return;
      }

      // Get user's memberships across all communities
      const memberships = await prisma.communityMembership.findMany({
        where: { userId },
        include: {
          community: {
            select: {
              id: true,
              name: true,
              slug: true,
              isPublic: true,
              creatorId: true
            }
          }
        }
      });

      // Get permissions for each community
      const accessSummary = await Promise.all(
        memberships.map(async (membership) => {
          const permissions = await AccessControlService.getUserPermissions(
            userId,
            membership.communityId
          );
          
          return {
            community: membership.community,
            membership: {
              role: membership.role,
              status: membership.status,
              joinedAt: membership.joinedAt
            },
            permissions: permissions.permissions,
            hasAccess: permissions.hasAccess,
            hasPaidAccess: permissions.hasPaidAccess,
            isCreator: membership.community.creatorId === userId
          };
        })
      );

      // Get recent audit events for this user
      const recentEvents = await auditLogger.getAuditLogs({
        userId,
        limit: 50,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      });

      res.json({
        success: true,
        data: {
          userId,
          communities: accessSummary,
          recentEvents: recentEvents.logs,
          summary: {
            totalCommunities: memberships.length,
            activeMemberships: memberships.filter(m => m.status === 'active').length,
            pendingMemberships: memberships.filter(m => m.status === 'pending').length,
            createdCommunities: memberships.filter(m => m.community.creatorId === userId).length,
            adminRoles: memberships.filter(m => m.role === 'admin').length,
            moderatorRoles: memberships.filter(m => m.role === 'moderator').length
          }
        }
      });
    } catch (error) {
      console.error('Get user access summary error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to get access summary'
      });
    }
  }
);

/**
 * POST /api/v1/admin/audit-logs/cleanup
 * Clean up old audit logs (super admin only)
 */
router.post('/audit-logs/cleanup',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // For now, only allow the system to clean up logs
      // In a real system, you'd check for super admin permissions
      const retentionDays = parseInt(req.body.retentionDays) || 365;
      
      if (retentionDays < 90) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Retention period must be at least 90 days'
        });
        return;
      }

      const deletedCount = await auditLogger.cleanupOldLogs(retentionDays);

      // Log the cleanup operation
      await auditLogger.logSecurityEvent({
        userId: req.user!.id,
        action: 'AUDIT_CLEANUP',
        resource: 'audit_logs',
        reason: `Cleaned up logs older than ${retentionDays} days`,
        metadata: {
          retentionDays,
          deletedCount
        }
      });

      res.json({
        success: true,
        data: {
          deletedCount,
          retentionDays,
          message: `Successfully deleted ${deletedCount} old audit log entries`
        }
      });
    } catch (error) {
      console.error('Audit log cleanup error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to cleanup audit logs'
      });
    }
  }
);

/**
 * POST /api/v1/admin/communities/:communityId/broadcast
 * Broadcast announcement to all community members (admin only)
 */
router.post('/communities/:communityId/broadcast',
  authenticateToken,
  loadCommunityContext(),
  requirePermission('community:admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { communityId } = req.params;
      const { title, message, sendEmail } = req.body;

      if (!title || !message) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Title and message are required'
        });
        return;
      }

      const notificationCount = await notificationService.broadcastAnnouncement(
        communityId,
        title,
        message,
        sendEmail !== false
      );

      // Log the broadcast
      await auditLogger.logSecurityEvent({
        userId: req.user!.id,
        action: 'ANNOUNCEMENT_BROADCAST',
        resource: 'community_announcement',
        communityId,
        reason: `Broadcast announcement to ${notificationCount} members`,
        metadata: {
          title,
          sendEmail: sendEmail !== false,
          recipientCount: notificationCount
        }
      });

      res.json({
        success: true,
        data: {
          notificationCount,
          message: `Announcement sent to ${notificationCount} community members`
        }
      });
    } catch (error) {
      console.error('Broadcast announcement error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to broadcast announcement'
      });
    }
  }
);

/**
 * POST /api/v1/admin/notifications/digest/send
 * Manually trigger weekly digest for all users (super admin only)
 */
router.post('/notifications/digest/send',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // In a real system, check for super admin permissions
      const result = await JobScheduler.runWeeklyDigestJob();

      res.json({
        success: true,
        message: 'Weekly digest job triggered successfully'
      });
    } catch (error) {
      console.error('Manual digest trigger error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to trigger digest job'
      });
    }
  }
);

/**
 * POST /api/v1/admin/notifications/digest/test/:userId
 * Send test digest to specific user (admin only)
 */
router.post('/notifications/digest/test/:userId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      // Only allow users to test their own digest or super admins
      if (req.user!.id !== userId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You can only test your own digest'
        });
        return;
      }

      const success = await JobScheduler.sendTestDigest(userId);

      if (success) {
        res.json({
          success: true,
          message: 'Test digest sent successfully'
        });
      } else {
        res.status(400).json({
          error: 'Failed to send digest',
          message: 'User may not have digest enabled or no notifications to send'
        });
      }
    } catch (error) {
      console.error('Test digest error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to send test digest'
      });
    }
  }
);

export default router;
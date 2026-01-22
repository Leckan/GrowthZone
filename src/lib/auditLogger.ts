import prisma from './prisma';

export interface SecurityEvent {
  userId: string | null;
  action: string;
  resource: string;
  reason?: string;
  communityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  reason: string | null;
  communityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: any;
  createdAt: Date;
}

/**
 * Audit logging service for security events
 */
export class AuditLogger {
  /**
   * Log a security event
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: event.userId,
          action: event.action,
          resource: event.resource,
          reason: event.reason || null,
          communityId: event.communityId || null,
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null,
          metadata: event.metadata || {}
        }
      });

      // Also log to console for development/debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('Security Event:', {
          timestamp: new Date().toISOString(),
          ...event
        });
      }
    } catch (error) {
      // Don't throw errors from audit logging to avoid breaking the main flow
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(userId: string | null, action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'REGISTER' | 'PASSWORD_RESET', metadata?: Record<string, any>): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action,
      resource: 'authentication',
      metadata
    });
  }

  /**
   * Log permission changes
   */
  async logPermissionChange(adminUserId: string, targetUserId: string, communityId: string, action: string, oldRole?: string, newRole?: string): Promise<void> {
    await this.logSecurityEvent({
      userId: adminUserId,
      action: 'PERMISSION_CHANGE',
      resource: `user:${targetUserId}`,
      reason: action,
      communityId,
      metadata: {
        targetUserId,
        oldRole,
        newRole,
        action
      }
    });
  }

  /**
   * Log content moderation events
   */
  async logModerationEvent(moderatorId: string, action: string, resourceType: 'post' | 'comment' | 'user', resourceId: string, communityId?: string, reason?: string): Promise<void> {
    await this.logSecurityEvent({
      userId: moderatorId,
      action: 'MODERATION',
      resource: `${resourceType}:${resourceId}`,
      reason: `${action}: ${reason || 'No reason provided'}`,
      communityId,
      metadata: {
        moderationAction: action,
        resourceType,
        resourceId,
        reason
      }
    });
  }

  /**
   * Log payment events
   */
  async logPaymentEvent(userId: string, action: string, communityId?: string, amount?: number, currency?: string, metadata?: Record<string, any>): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: 'PAYMENT',
      resource: 'subscription',
      reason: action,
      communityId,
      metadata: {
        paymentAction: action,
        amount,
        currency,
        ...metadata
      }
    });
  }

  /**
   * Log data access events for sensitive operations
   */
  async logDataAccess(userId: string, action: string, resource: string, communityId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: 'DATA_ACCESS',
      resource,
      reason: action,
      communityId,
      metadata
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(options: {
    userId?: string;
    communityId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const {
      userId,
      communityId,
      action,
      resource,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;

    const where: any = {};

    if (userId) where.userId = userId;
    if (communityId) where.communityId = communityId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (resource) where.resource = { contains: resource, mode: 'insensitive' };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true
            }
          },
          community: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    return { logs: logs as any[], total };
  }

  /**
   * Get security summary for a community
   */
  async getSecuritySummary(communityId: string, days: number = 30): Promise<{
    totalEvents: number;
    accessDeniedEvents: number;
    moderationEvents: number;
    permissionChanges: number;
    recentEvents: AuditLogEntry[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where = {
      communityId,
      createdAt: { gte: startDate }
    };

    const [
      totalEvents,
      accessDeniedEvents,
      moderationEvents,
      permissionChanges,
      recentEvents
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ 
        where: { ...where, action: 'ACCESS_DENIED' }
      }),
      prisma.auditLog.count({ 
        where: { ...where, action: 'MODERATION' }
      }),
      prisma.auditLog.count({ 
        where: { ...where, action: 'PERMISSION_CHANGE' }
      }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        }
      })
    ]);

    return {
      totalEvents,
      accessDeniedEvents,
      moderationEvents,
      permissionChanges,
      recentEvents: recentEvents as any[]
    };
  }

  /**
   * Clean up old audit logs (for data retention)
   */
  async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate }
      }
    });

    return result.count;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { generateTokenPair } from '../lib/auth';
import { AccessControlService } from '../lib/accessControlService';
import { auditLogger } from '../lib/auditLogger';

describe('Access Control System', () => {
  let testUser: any;
  let testCommunity: any;
  let testCourse: any;
  let testLesson: any;
  let authToken: string;
  let adminUser: any;
  let adminToken: string;

  beforeEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany();
    await prisma.userProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.course.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();

    // Create test users
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        username: 'testuser',
        displayName: 'Test User',
        emailVerified: true
      }
    });

    adminUser = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: 'hashedpassword',
        username: 'adminuser',
        displayName: 'Admin User',
        emailVerified: true
      }
    });

    // Generate auth tokens
    const userTokens = generateTokenPair(testUser);
    authToken = userTokens.accessToken;

    const adminTokens = generateTokenPair(adminUser);
    adminToken = adminTokens.accessToken;

    // Create test community
    testCommunity = await prisma.community.create({
      data: {
        name: 'Test Community',
        slug: 'test-community',
        description: 'A test community',
        creatorId: adminUser.id,
        isPublic: true,
        memberCount: 1
      }
    });

    // Add admin as community admin
    await prisma.communityMembership.create({
      data: {
        userId: adminUser.id,
        communityId: testCommunity.id,
        role: 'admin',
        status: 'active'
      }
    });

    // Create test course
    testCourse = await prisma.course.create({
      data: {
        title: 'Test Course',
        description: 'A test course',
        communityId: testCommunity.id,
        isPublished: true
      }
    });

    // Create test lesson
    testLesson = await prisma.lesson.create({
      data: {
        title: 'Test Lesson',
        content: 'Test lesson content',
        courseId: testCourse.id,
        isFree: false // Premium lesson
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany();
    await prisma.userProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.course.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Community Access Control', () => {
    it('should allow public access to public communities', async () => {
      const access = await AccessControlService.checkCommunityAccess(testCommunity.id);
      
      expect(access.hasAccess).toBe(true);
      expect(access.hasPaidAccess).toBe(false);
      expect(access.role).toBe('member');
      expect(access.isCreator).toBe(false);
    });

    it('should deny access to private communities for non-members', async () => {
      // Make community private
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { isPublic: false }
      });

      const access = await AccessControlService.checkCommunityAccess(testCommunity.id, testUser.id);
      
      expect(access.hasAccess).toBe(false);
      expect(access.reason).toBe('Private community requires membership');
    });

    it('should grant creator full access', async () => {
      const access = await AccessControlService.checkCommunityAccess(testCommunity.id, adminUser.id);
      
      expect(access.hasAccess).toBe(true);
      expect(access.hasPaidAccess).toBe(true);
      expect(access.role).toBe('creator');
      expect(access.isCreator).toBe(true);
    });

    it('should handle paid communities correctly', async () => {
      // Make community paid
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { 
          priceMonthly: 9.99,
          priceYearly: 99.99
        }
      });

      // Add user as member without subscription
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      const access = await AccessControlService.checkCommunityAccess(testCommunity.id, testUser.id);
      
      expect(access.hasAccess).toBe(true);
      expect(access.hasPaidAccess).toBe(false);
      expect(access.reason).toBe('Paid subscription required for premium content');
    });
  });

  describe('Content Access Control', () => {
    it('should allow access to free lessons for community members', async () => {
      // Make lesson free
      await prisma.lesson.update({
        where: { id: testLesson.id },
        data: { isFree: true }
      });

      // Add user as member
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      const access = await AccessControlService.checkContentAccess('lesson', testLesson.id, testUser.id);
      
      expect(access.canView).toBe(true);
      expect(access.hasAccess).toBe(true);
    });

    it('should deny access to premium lessons without paid subscription', async () => {
      // Make community paid
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { 
          priceMonthly: 9.99,
          priceYearly: 99.99
        }
      });

      // Add user as member without subscription
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      const access = await AccessControlService.checkContentAccess('lesson', testLesson.id, testUser.id);
      
      expect(access.canView).toBe(false);
      expect(access.hasAccess).toBe(true);
      expect(access.hasPaidAccess).toBe(false);
    });

    it('should allow moderators to access premium content', async () => {
      // Add user as moderator
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'moderator',
          status: 'active'
        }
      });

      const access = await AccessControlService.checkContentAccess('lesson', testLesson.id, testUser.id);
      
      expect(access.canView).toBe(true);
      expect(access.role).toBe('moderator');
    });
  });

  describe('Permission Validation', () => {
    it('should validate permissions correctly for different roles', async () => {
      // Add user as member
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      // Test member permissions
      const readPermission = await AccessControlService.validatePermission(
        testUser.id,
        testCommunity.id,
        'course:read'
      );
      expect(readPermission.allowed).toBe(true);

      const writePermission = await AccessControlService.validatePermission(
        testUser.id,
        testCommunity.id,
        'course:write'
      );
      expect(writePermission.allowed).toBe(false);

      // Test admin permissions
      const adminWritePermission = await AccessControlService.validatePermission(
        adminUser.id,
        testCommunity.id,
        'course:write'
      );
      expect(adminWritePermission.allowed).toBe(true);
    });

    it('should get user permissions correctly', async () => {
      // Add user as moderator
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'moderator',
          status: 'active'
        }
      });

      const permissions = await AccessControlService.getUserPermissions(testUser.id, testCommunity.id);
      
      expect(permissions.role).toBe('moderator');
      expect(permissions.hasAccess).toBe(true);
      expect(permissions.permissions).toContain('course:write');
      expect(permissions.permissions).toContain('post:moderate');
      expect(permissions.permissions).not.toContain('course:delete');
    });
  });

  describe('Audit Logging', () => {
    it('should log security events', async () => {
      await auditLogger.logSecurityEvent({
        userId: testUser.id,
        action: 'ACCESS_DENIED',
        resource: 'course:write',
        reason: 'Insufficient permissions',
        communityId: testCommunity.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await auditLogger.getAuditLogs({
        userId: testUser.id,
        limit: 10
      });

      expect(logs.logs).toHaveLength(1);
      expect(logs.logs[0].action).toBe('ACCESS_DENIED');
      expect(logs.logs[0].resource).toBe('course:write');
      expect(logs.logs[0].userId).toBe(testUser.id);
    });

    it('should generate security summary', async () => {
      // Log some test events
      await auditLogger.logSecurityEvent({
        userId: testUser.id,
        action: 'ACCESS_DENIED',
        resource: 'course:write',
        communityId: testCommunity.id
      });

      await auditLogger.logModerationEvent(
        adminUser.id,
        'DELETE_POST',
        'post',
        'test-post-id',
        testCommunity.id,
        'Spam content'
      );

      const summary = await auditLogger.getSecuritySummary(testCommunity.id, 30);

      expect(summary.totalEvents).toBeGreaterThan(0);
      expect(summary.accessDeniedEvents).toBe(1);
      expect(summary.moderationEvents).toBe(1);
    });
  });

  describe('API Access Control Middleware', () => {
    it('should protect admin endpoints', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/communities/${testCommunity.id}/audit-logs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should allow admin access to admin endpoints', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/communities/${testCommunity.id}/audit-logs`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should deny access without authentication', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/communities/${testCommunity.id}/audit-logs`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should provide access summary for users', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/users/${testUser.id}/access-summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(testUser.id);
    });

    it('should deny access to other users access summary', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/users/${adminUser.id}/access-summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('Bulk Operations', () => {
    it('should validate bulk operations correctly', async () => {
      const validation = await AccessControlService.validateBulkOperation(
        adminUser.id,
        testCommunity.id,
        'publish',
        [testCourse.id]
      );

      expect(validation.allowed).toBe(true);
      expect(validation.allowedIds).toContain(testCourse.id);
      expect(validation.deniedIds).toHaveLength(0);
    });

    it('should deny bulk operations for insufficient permissions', async () => {
      // Add user as member
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      const validation = await AccessControlService.validateBulkOperation(
        testUser.id,
        testCommunity.id,
        'delete',
        [testCourse.id]
      );

      expect(validation.allowed).toBe(false);
      expect(validation.allowedIds).toHaveLength(0);
      expect(validation.deniedIds).toContain(testCourse.id);
    });
  });

  describe('Multiple Community Access', () => {
    it('should check access to multiple communities', async () => {
      // Create another community
      const secondCommunity = await prisma.community.create({
        data: {
          name: 'Second Community',
          slug: 'second-community',
          creatorId: testUser.id,
          isPublic: false
        }
      });

      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: secondCommunity.id,
          role: 'admin',
          status: 'active'
        }
      });

      const results = await AccessControlService.checkMultipleCommunityAccess(
        [testCommunity.id, secondCommunity.id],
        testUser.id
      );

      expect(results[testCommunity.id].hasAccess).toBe(true);
      expect(results[testCommunity.id].role).toBe('member');
      
      expect(results[secondCommunity.id].hasAccess).toBe(true);
      expect(results[secondCommunity.id].role).toBe('creator');
      expect(results[secondCommunity.id].isCreator).toBe(true);
    });
  });

  describe('Security Edge Cases', () => {
    it('should deny access with malformed JWT tokens', async () => {
      const response = await request(app)
        .get(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should deny access with expired JWT tokens', async () => {
      // Create an expired token (this would normally be handled by JWT library)
      const response = await request(app)
        .get(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid');

      expect(response.status).toBe(401);
    });

    it('should deny access to suspended users', async () => {
      // Add user as member first
      await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      // Then suspend the user's membership
      await prisma.communityMembership.update({
        where: {
          userId_communityId: {
            userId: testUser.id,
            communityId: testCommunity.id
          }
        },
        data: { status: 'suspended' }
      });

      const response = await request(app)
        .get(`/api/v1/communities/${testCommunity.id}/posts`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should prevent privilege escalation attempts', async () => {
      // Try to access admin endpoint as regular user
      const response = await request(app)
        .post(`/api/v1/communities/${testCommunity.id}/members/${testUser.id}/role`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ role: 'admin' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should validate resource ownership before allowing modifications', async () => {
      // Create another user's community
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@example.com',
          passwordHash: 'hashedpassword',
          username: 'otheruser',
          displayName: 'Other User',
          emailVerified: true
        }
      });

      const otherCommunity = await prisma.community.create({
        data: {
          name: 'Other Community',
          slug: 'other-community',
          creatorId: otherUser.id,
          isPublic: true
        }
      });

      // Try to modify other user's community
      const response = await request(app)
        .put(`/api/v1/communities/${otherCommunity.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Hacked Community' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should prevent access to non-existent resources', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      const response = await request(app)
        .get(`/api/v1/communities/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should prevent SQL injection in access control queries', async () => {
      // Test with malicious input that could cause SQL injection
      const maliciousId = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .get(`/api/v1/communities/${maliciousId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should return 400 for invalid UUID format, not 500 for SQL error
      expect(response.status).toBe(400);
    });

    it('should validate permission boundaries between roles', async () => {
      // Create a moderator
      const moderator = await prisma.user.create({
        data: {
          email: 'moderator@example.com',
          passwordHash: 'hashedpassword',
          username: 'moderator',
          displayName: 'Moderator User',
          emailVerified: true
        }
      });

      await prisma.communityMembership.create({
        data: {
          userId: moderator.id,
          communityId: testCommunity.id,
          role: 'moderator',
          status: 'active'
        }
      });

      const moderatorTokens = generateTokenPair(moderator);
      const moderatorToken = moderatorTokens.accessToken;

      // Moderator should be able to moderate posts
      const moderateResponse = await request(app)
        .post(`/api/v1/posts/fake-post-id/moderate`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ action: 'hide', reason: 'inappropriate' });

      // Should fail because post doesn't exist, not because of permissions
      expect(moderateResponse.status).toBe(404);

      // But moderator should NOT be able to delete the community
      const deleteResponse = await request(app)
        .delete(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(deleteResponse.status).toBe(403);
      expect(deleteResponse.body.error).toBe('Access denied');
    });
  });

  describe('Audit Logging Completeness', () => {
    it('should log all access denied events with complete context', async () => {
      // Clear existing logs
      await prisma.auditLog.deleteMany();

      // Attempt unauthorized access
      const response = await request(app)
        .delete(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);

      // Check that the event was logged with complete context
      const logs = await auditLogger.getAuditLogs({
        userId: testUser.id,
        limit: 1
      });

      expect(logs.logs).toHaveLength(1);
      const log = logs.logs[0];
      
      expect(log.userId).toBe(testUser.id);
      expect(log.action).toBe('ACCESS_DENIED');
      expect(log.resource).toContain('community:delete');
      expect(log.communityId).toBe(testCommunity.id);
      expect(log.reason).toContain('Insufficient permissions');
      expect(log.ipAddress).toBeDefined();
      expect(log.userAgent).toBeDefined();
    });

    it('should log permission changes with before/after states', async () => {
      // Clear existing logs
      await prisma.auditLog.deleteMany();

      // Change user role from member to moderator
      await auditLogger.logPermissionChange(
        adminUser.id,
        testUser.id,
        testCommunity.id,
        'ROLE_CHANGE',
        'member',
        'moderator'
      );

      const logs = await auditLogger.getAuditLogs({
        action: 'PERMISSION_CHANGE',
        limit: 1
      });

      expect(logs.logs).toHaveLength(1);
      const log = logs.logs[0];
      
      expect(log.userId).toBe(adminUser.id);
      expect(log.action).toBe('PERMISSION_CHANGE');
      expect(log.communityId).toBe(testCommunity.id);
      expect(log.metadata).toHaveProperty('targetUserId', testUser.id);
      expect(log.metadata).toHaveProperty('oldRole', 'member');
      expect(log.metadata).toHaveProperty('newRole', 'moderator');
    });

    it('should log moderation actions with detailed context', async () => {
      // Clear existing logs
      await prisma.auditLog.deleteMany();

      // Create a test post
      const post = await prisma.post.create({
        data: {
          title: 'Test Post',
          content: 'Test content',
          authorId: testUser.id,
          communityId: testCommunity.id
        }
      });

      // Log moderation action
      await auditLogger.logModerationEvent(
        adminUser.id,
        'DELETE_POST',
        'post',
        post.id,
        testCommunity.id,
        'Spam content'
      );

      const logs = await auditLogger.getAuditLogs({
        action: 'MODERATION',
        limit: 1
      });

      expect(logs.logs).toHaveLength(1);
      const log = logs.logs[0];
      
      expect(log.userId).toBe(adminUser.id);
      expect(log.action).toBe('MODERATION');
      expect(log.resource).toBe(`post:${post.id}`);
      expect(log.communityId).toBe(testCommunity.id);
      expect(log.reason).toContain('DELETE_POST');
      expect(log.reason).toContain('Spam content');
      expect(log.metadata).toHaveProperty('moderationAction', 'DELETE_POST');
      expect(log.metadata).toHaveProperty('resourceType', 'post');
      expect(log.metadata).toHaveProperty('resourceId', post.id);
    });

    it('should log payment events with transaction details', async () => {
      // Clear existing logs
      await prisma.auditLog.deleteMany();

      // Log payment event
      await auditLogger.logPaymentEvent(
        testUser.id,
        'SUBSCRIPTION_CREATED',
        testCommunity.id,
        9.99,
        'USD',
        { stripeSubscriptionId: 'sub_test123' }
      );

      const logs = await auditLogger.getAuditLogs({
        action: 'PAYMENT',
        limit: 1
      });

      expect(logs.logs).toHaveLength(1);
      const log = logs.logs[0];
      
      expect(log.userId).toBe(testUser.id);
      expect(log.action).toBe('PAYMENT');
      expect(log.resource).toBe('subscription');
      expect(log.communityId).toBe(testCommunity.id);
      expect(log.metadata).toHaveProperty('paymentAction', 'SUBSCRIPTION_CREATED');
      expect(log.metadata).toHaveProperty('amount', 9.99);
      expect(log.metadata).toHaveProperty('currency', 'USD');
      expect(log.metadata).toHaveProperty('stripeSubscriptionId', 'sub_test123');
    });

    it('should generate comprehensive security summaries', async () => {
      // Clear existing logs
      await prisma.auditLog.deleteMany();

      // Create various security events
      await auditLogger.logSecurityEvent({
        userId: testUser.id,
        action: 'ACCESS_DENIED',
        resource: 'course:write',
        communityId: testCommunity.id
      });

      await auditLogger.logModerationEvent(
        adminUser.id,
        'HIDE_POST',
        'post',
        'test-post-id',
        testCommunity.id,
        'Inappropriate content'
      );

      await auditLogger.logPermissionChange(
        adminUser.id,
        testUser.id,
        testCommunity.id,
        'ROLE_CHANGE',
        'member',
        'moderator'
      );

      // Generate security summary
      const summary = await auditLogger.getSecuritySummary(testCommunity.id, 1);

      expect(summary.totalEvents).toBe(3);
      expect(summary.accessDeniedEvents).toBe(1);
      expect(summary.moderationEvents).toBe(1);
      expect(summary.permissionChanges).toBe(1);
      expect(summary.recentEvents).toHaveLength(3);
    });

    it('should handle audit log cleanup without affecting recent events', async () => {
      // Create old audit log entry (simulate old date)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400); // 400 days ago

      await prisma.auditLog.create({
        data: {
          userId: testUser.id,
          action: 'OLD_EVENT',
          resource: 'test',
          createdAt: oldDate
        }
      });

      // Create recent audit log entry
      await auditLogger.logSecurityEvent({
        userId: testUser.id,
        action: 'RECENT_EVENT',
        resource: 'test'
      });

      // Clean up logs older than 365 days
      const deletedCount = await auditLogger.cleanupOldLogs(365);

      expect(deletedCount).toBe(1);

      // Verify recent event still exists
      const recentLogs = await auditLogger.getAuditLogs({
        action: 'RECENT_EVENT',
        limit: 1
      });

      expect(recentLogs.logs).toHaveLength(1);

      // Verify old event was deleted
      const oldLogs = await auditLogger.getAuditLogs({
        action: 'OLD_EVENT',
        limit: 1
      });

      expect(oldLogs.logs).toHaveLength(0);
    });

    it('should maintain audit log integrity under concurrent access', async () => {
      // Clear existing logs
      await prisma.auditLog.deleteMany();

      // Simulate concurrent audit logging
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          auditLogger.logSecurityEvent({
            userId: testUser.id,
            action: 'CONCURRENT_TEST',
            resource: `resource_${i}`,
            communityId: testCommunity.id
          })
        );
      }

      await Promise.all(promises);

      // Verify all events were logged
      const logs = await auditLogger.getAuditLogs({
        action: 'CONCURRENT_TEST',
        limit: 20
      });

      expect(logs.logs).toHaveLength(10);
      
      // Verify each resource was logged exactly once
      const resources = logs.logs.map(log => log.resource);
      const uniqueResources = [...new Set(resources)];
      expect(uniqueResources).toHaveLength(10);
    });
  });
});
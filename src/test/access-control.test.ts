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
});
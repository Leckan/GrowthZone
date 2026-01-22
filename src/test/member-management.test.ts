import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import prisma from '../lib/prisma';
import { CommunityService } from '../lib/communityService';

describe('Member Management Unit Tests', () => {
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let testCommunity: any;
  let adminUser: any;

  beforeEach(async () => {
    // Clean up test data
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();

    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        email: 'user1@test.com',
        passwordHash: 'hashedpassword',
        username: 'user1',
        displayName: 'Test User 1',
        emailVerified: true
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        email: 'user2@test.com',
        passwordHash: 'hashedpassword',
        username: 'user2',
        displayName: 'Test User 2',
        emailVerified: true
      }
    });

    testUser3 = await prisma.user.create({
      data: {
        email: 'user3@test.com',
        passwordHash: 'hashedpassword',
        username: 'user3',
        displayName: 'Test User 3',
        emailVerified: true
      }
    });

    adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'hashedpassword',
        username: 'admin',
        displayName: 'Admin User',
        emailVerified: true
      }
    });

    // Create test community
    testCommunity = await prisma.community.create({
      data: {
        name: 'Test Community',
        slug: 'test-community',
        description: 'A test community for member management',
        creatorId: adminUser.id,
        isPublic: true,
        requiresApproval: false,
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
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Membership Request Workflows', () => {
    it('should allow immediate membership for public communities without approval', async () => {
      const membership = await CommunityService.requestMembership(testCommunity.id, testUser1.id);

      expect(membership.status).toBe('active');
      expect(membership.role).toBe('member');
      expect(membership.userId).toBe(testUser1.id);
      expect(membership.communityId).toBe(testCommunity.id);

      // Verify member count was updated
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(2);
    });

    it('should create pending membership for approval-required communities', async () => {
      // Update community to require approval
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { requiresApproval: true }
      });

      const membership = await CommunityService.requestMembership(testCommunity.id, testUser1.id);

      expect(membership.status).toBe('pending');
      expect(membership.role).toBe('member');

      // Verify member count was NOT updated for pending membership
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(1);
    });

    it('should prevent duplicate membership requests', async () => {
      await CommunityService.requestMembership(testCommunity.id, testUser1.id);

      await expect(
        CommunityService.requestMembership(testCommunity.id, testUser1.id)
      ).rejects.toThrow('Already a member of this community');
    });

    it('should prevent joining with suspended membership', async () => {
      // Create suspended membership
      await prisma.communityMembership.create({
        data: {
          userId: testUser1.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'suspended'
        }
      });

      await expect(
        CommunityService.requestMembership(testCommunity.id, testUser1.id)
      ).rejects.toThrow('Cannot join community - membership suspended');
    });

    it('should handle pending membership requests correctly', async () => {
      // Create pending membership
      await prisma.communityMembership.create({
        data: {
          userId: testUser1.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'pending'
        }
      });

      await expect(
        CommunityService.requestMembership(testCommunity.id, testUser1.id)
      ).rejects.toThrow('Membership request already pending');
    });
  });

  describe('Role Assignment and Management', () => {
    beforeEach(async () => {
      // Add test users as members
      await prisma.communityMembership.createMany({
        data: [
          {
            userId: testUser1.id,
            communityId: testCommunity.id,
            role: 'member',
            status: 'active'
          },
          {
            userId: testUser2.id,
            communityId: testCommunity.id,
            role: 'member',
            status: 'active'
          }
        ]
      });

      // Update member count
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { memberCount: 3 }
      });
    });

    it('should allow admin to promote member to moderator', async () => {
      const updatedMembership = await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { role: 'moderator' }
      );

      expect(updatedMembership.role).toBe('moderator');
      expect(updatedMembership.status).toBe('active');
    });

    it('should allow admin to promote member to admin', async () => {
      const updatedMembership = await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { role: 'admin' }
      );

      expect(updatedMembership.role).toBe('admin');
    });

    it('should prevent non-admin from changing roles', async () => {
      await expect(
        CommunityService.updateMember(
          testCommunity.id,
          testUser2.id,
          testUser1.id,
          { role: 'moderator' }
        )
      ).rejects.toThrow('Insufficient permissions to update member');
    });

    it('should prevent modifying community creator membership', async () => {
      await expect(
        CommunityService.updateMember(
          testCommunity.id,
          adminUser.id,
          adminUser.id,
          { role: 'member' }
        )
      ).rejects.toThrow('Cannot modify community creator membership');
    });

    it('should only allow creator to manage admin roles', async () => {
      // Promote testUser1 to admin
      await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { role: 'admin' }
      );

      // testUser1 (admin) should not be able to promote testUser2 to admin
      await expect(
        CommunityService.updateMember(
          testCommunity.id,
          testUser2.id,
          testUser1.id,
          { role: 'admin' }
        )
      ).rejects.toThrow('Only community creator can manage admin roles');
    });
  });

  describe('Member Status Management', () => {
    beforeEach(async () => {
      // Add test user as member
      await prisma.communityMembership.create({
        data: {
          userId: testUser1.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { memberCount: 2 }
      });
    });

    it('should allow admin to suspend member', async () => {
      const updatedMembership = await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { status: 'suspended' }
      );

      expect(updatedMembership.status).toBe('suspended');

      // Verify member count was decremented
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(1);
    });

    it('should allow admin to reactivate suspended member', async () => {
      // First suspend the member
      await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { status: 'suspended' }
      );

      // Then reactivate
      const updatedMembership = await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { status: 'active' }
      );

      expect(updatedMembership.status).toBe('active');

      // Verify member count was incremented back
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(2);
    });

    it('should approve pending membership and update member count', async () => {
      // Create pending membership
      await prisma.communityMembership.create({
        data: {
          userId: testUser2.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'pending'
        }
      });

      const updatedMembership = await CommunityService.updateMember(
        testCommunity.id,
        testUser2.id,
        adminUser.id,
        { status: 'active' }
      );

      expect(updatedMembership.status).toBe('active');

      // Verify member count was incremented
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(3);
    });
  });

  describe('Member Removal', () => {
    beforeEach(async () => {
      // Add test users as members with different roles
      await prisma.communityMembership.createMany({
        data: [
          {
            userId: testUser1.id,
            communityId: testCommunity.id,
            role: 'member',
            status: 'active'
          },
          {
            userId: testUser2.id,
            communityId: testCommunity.id,
            role: 'moderator',
            status: 'active'
          },
          {
            userId: testUser3.id,
            communityId: testCommunity.id,
            role: 'admin',
            status: 'active'
          }
        ]
      });

      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { memberCount: 4 }
      });
    });

    it('should allow admin to remove regular member', async () => {
      const result = await CommunityService.removeMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id
      );

      expect(result.message).toContain('Member removed successfully');

      // Verify member was removed
      const membership = await prisma.communityMembership.findUnique({
        where: {
          userId_communityId: {
            userId: testUser1.id,
            communityId: testCommunity.id
          }
        }
      });
      expect(membership).toBeNull();

      // Verify member count was decremented
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(3);
    });

    it('should prevent removing community creator', async () => {
      await expect(
        CommunityService.removeMember(
          testCommunity.id,
          adminUser.id,
          adminUser.id
        )
      ).rejects.toThrow('Cannot remove community creator');
    });

    it('should allow moderator to remove regular members only', async () => {
      const result = await CommunityService.removeMember(
        testCommunity.id,
        testUser1.id,
        testUser2.id // moderator removing member
      );

      expect(result.message).toContain('Member removed successfully');
    });

    it('should prevent moderator from removing other moderators or admins', async () => {
      await expect(
        CommunityService.removeMember(
          testCommunity.id,
          testUser3.id, // admin
          testUser2.id  // moderator trying to remove admin
        )
      ).rejects.toThrow('Moderators can only remove regular members');
    });

    it('should return error for non-existent member', async () => {
      // Create a user not in the community
      const outsideUser = await prisma.user.create({
        data: {
          email: 'outside@test.com',
          passwordHash: 'hashedpassword',
          username: 'outside',
          displayName: 'Outside User',
          emailVerified: true
        }
      });

      await expect(
        CommunityService.removeMember(
          testCommunity.id,
          outsideUser.id,
          adminUser.id
        )
      ).rejects.toThrow('Member not found');
    });
  });

  describe('Member Listing and Access Control', () => {
    beforeEach(async () => {
      // Add test users as members with different roles and statuses
      await prisma.communityMembership.createMany({
        data: [
          {
            userId: testUser1.id,
            communityId: testCommunity.id,
            role: 'member',
            status: 'active'
          },
          {
            userId: testUser2.id,
            communityId: testCommunity.id,
            role: 'moderator',
            status: 'active'
          },
          {
            userId: testUser3.id,
            communityId: testCommunity.id,
            role: 'member',
            status: 'suspended'
          }
        ]
      });
    });

    it('should return community members for active members', async () => {
      const result = await CommunityService.getCommunityMembers(
        testCommunity.id,
        testUser1.id
      );

      expect(result.members.length).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.hasMore).toBe(false);
    });

    it('should deny access to non-members', async () => {
      const outsideUser = await prisma.user.create({
        data: {
          email: 'outside@test.com',
          passwordHash: 'hashedpassword',
          username: 'outside',
          displayName: 'Outside User',
          emailVerified: true
        }
      });

      await expect(
        CommunityService.getCommunityMembers(testCommunity.id, outsideUser.id)
      ).rejects.toThrow('Access denied - not a member of this community');
    });

    it('should filter members by role', async () => {
      const result = await CommunityService.getCommunityMembers(
        testCommunity.id,
        testUser1.id,
        { role: 'moderator' }
      );

      expect(result.members).toHaveLength(1);
      expect(result.members[0].role).toBe('moderator');
    });

    it('should filter members by status', async () => {
      const result = await CommunityService.getCommunityMembers(
        testCommunity.id,
        testUser1.id,
        { status: 'suspended' }
      );

      expect(result.members).toHaveLength(1);
      expect(result.members[0].status).toBe('suspended');
    });

    it('should support pagination', async () => {
      const result = await CommunityService.getCommunityMembers(
        testCommunity.id,
        testUser1.id,
        { limit: 2, offset: 0 }
      );

      expect(result.members.length).toBeLessThanOrEqual(2);
      expect(result.hasMore).toBe(result.total > 2);
    });
  });

  describe('Leave Community Workflow', () => {
    beforeEach(async () => {
      // Add test user as member
      await prisma.communityMembership.create({
        data: {
          userId: testUser1.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { memberCount: 2 }
      });
    });

    it('should allow member to leave community', async () => {
      const result = await CommunityService.leaveCommunity(testCommunity.id, testUser1.id);

      expect(result.message).toContain('Successfully left community');

      // Verify membership was removed
      const membership = await prisma.communityMembership.findUnique({
        where: {
          userId_communityId: {
            userId: testUser1.id,
            communityId: testCommunity.id
          }
        }
      });
      expect(membership).toBeNull();

      // Verify member count was decremented
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(1);
    });

    it('should prevent creator from leaving their own community', async () => {
      await expect(
        CommunityService.leaveCommunity(testCommunity.id, adminUser.id)
      ).rejects.toThrow('Community creator cannot leave their own community');
    });

    it('should return error for non-members trying to leave', async () => {
      const outsideUser = await prisma.user.create({
        data: {
          email: 'outside@test.com',
          passwordHash: 'hashedpassword',
          username: 'outside',
          displayName: 'Outside User',
          emailVerified: true
        }
      });

      await expect(
        CommunityService.leaveCommunity(testCommunity.id, outsideUser.id)
      ).rejects.toThrow('Not a member of this community');
    });

    it('should handle suspended member leaving correctly', async () => {
      // Suspend the member first
      await CommunityService.updateMember(
        testCommunity.id,
        testUser1.id,
        adminUser.id,
        { status: 'suspended' }
      );

      // Member should still be able to leave
      const result = await CommunityService.leaveCommunity(testCommunity.id, testUser1.id);
      expect(result.message).toContain('Successfully left community');

      // Member count should remain the same since suspended member wasn't counted
      const updatedCommunity = await prisma.community.findUnique({
        where: { id: testCommunity.id }
      });
      expect(updatedCommunity?.memberCount).toBe(1);
    });
  });
});
import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { generateAccessToken } from '../lib/auth';

describe('Community Routes', () => {
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let authToken1: string;
  let authToken2: string;
  let authToken3: string;
  let testCommunity: any;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.communityMembership.deleteMany({});
    await prisma.community.deleteMany({});
    await prisma.user.deleteMany({});

    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        email: 'creator@test.com',
        passwordHash: 'hashedpassword',
        username: 'creator',
        displayName: 'Community Creator',
        emailVerified: true
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        email: 'member@test.com',
        passwordHash: 'hashedpassword',
        username: 'member',
        displayName: 'Community Member',
        emailVerified: true
      }
    });

    testUser3 = await prisma.user.create({
      data: {
        email: 'outsider@test.com',
        passwordHash: 'hashedpassword',
        username: 'outsider',
        displayName: 'Outsider',
        emailVerified: true
      }
    });

    // Generate auth tokens
    authToken1 = generateAccessToken({ 
      userId: testUser1.id, 
      email: testUser1.email, 
      username: testUser1.username 
    });
    authToken2 = generateAccessToken({ 
      userId: testUser2.id, 
      email: testUser2.email, 
      username: testUser2.username 
    });
    authToken3 = generateAccessToken({ 
      userId: testUser3.id, 
      email: testUser3.email, 
      username: testUser3.username 
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.communityMembership.deleteMany({});
    await prisma.community.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  describe('POST /api/v1/communities', () => {
    it('should create a new community with valid data', async () => {
      const communityData = {
        name: 'Test Community',
        description: 'A test community for learning',
        slug: 'test-community',
        isPublic: true,
        requiresApproval: false,
        priceMonthly: 29.99
      };

      const response = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${authToken1}`)
        .send(communityData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(communityData.name);
      expect(response.body.data.slug).toBe(communityData.slug);
      expect(response.body.data.creatorId).toBe(testUser1.id);
      expect(response.body.data.memberCount).toBe(1);

      testCommunity = response.body.data;
    });

    it('should reject community creation with duplicate slug', async () => {
      const communityData = {
        name: 'Another Community',
        slug: 'test-community', // Same slug as above
        isPublic: true
      };

      const response = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${authToken2}`)
        .send(communityData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Conflict');
    });

    it('should reject community creation with invalid data', async () => {
      const invalidData = {
        name: '', // Empty name
        slug: 'ab', // Too short
        priceMonthly: -10 // Negative price
      };

      const response = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${authToken1}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should require authentication', async () => {
      const communityData = {
        name: 'Unauthorized Community',
        slug: 'unauthorized'
      };

      const response = await request(app)
        .post('/api/v1/communities')
        .send(communityData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/communities', () => {
    beforeAll(async () => {
      // Create additional test communities
      await prisma.community.create({
        data: {
          name: 'Private Community',
          slug: 'private-community',
          creatorId: testUser1.id,
          isPublic: false,
          memberCount: 1
        }
      });

      await prisma.community.create({
        data: {
          name: 'Public Community 2',
          slug: 'public-community-2',
          creatorId: testUser2.id,
          isPublic: true,
          memberCount: 1
        }
      });

      // Create memberships for the creators
      await prisma.communityMembership.createMany({
        data: [
          {
            userId: testUser1.id,
            communityId: (await prisma.community.findUnique({ where: { slug: 'private-community' } }))!.id,
            role: 'admin',
            status: 'active'
          },
          {
            userId: testUser2.id,
            communityId: (await prisma.community.findUnique({ where: { slug: 'public-community-2' } }))!.id,
            role: 'admin',
            status: 'active'
          }
        ]
      });
    });

    it('should return public communities for unauthenticated users', async () => {
      const response = await request(app)
        .get('/api/v1/communities');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities.length).toBeGreaterThanOrEqual(2); // At least 2 public communities
      expect(response.body.data.communities.every((c: any) => c.isPublic)).toBe(true);
    });

    it('should return all accessible communities for authenticated users', async () => {
      const response = await request(app)
        .get('/api/v1/communities')
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities.length).toBeGreaterThanOrEqual(2);
    });

    it('should support search functionality', async () => {
      const response = await request(app)
        .get('/api/v1/communities?search=Test')
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.communities.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.communities.some((c: any) => c.name.includes('Test'))).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/communities?limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.communities).toHaveLength(1);
      expect(response.body.data.hasMore).toBeDefined();
    });
  });

  describe('GET /api/v1/communities/:identifier', () => {
    it('should return community by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(testCommunity.id);
      expect(response.body.data.name).toBe(testCommunity.name);
    });

    it('should return community by slug', async () => {
      const response = await request(app)
        .get(`/api/v1/communities/${testCommunity.slug}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.slug).toBe(testCommunity.slug);
    });

    it('should return 404 for non-existent community', async () => {
      const response = await request(app)
        .get('/api/v1/communities/non-existent');

      expect(response.status).toBe(404);
    });

    it('should deny access to private community for non-members', async () => {
      // Get the private community
      const privateCommunity = await prisma.community.findUnique({ 
        where: { slug: 'private-community' } 
      });

      const response = await request(app)
        .get(`/api/v1/communities/${privateCommunity!.id}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v1/communities/:id', () => {
    it('should update community settings by creator', async () => {
      const updateData = {
        name: 'Updated Test Community',
        description: 'Updated description',
        priceMonthly: 39.99
      };

      const response = await request(app)
        .put(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe(updateData.description);
    });

    it('should reject updates from non-admin users', async () => {
      const updateData = {
        name: 'Unauthorized Update'
      };

      const response = await request(app)
        .put(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send(updateData);

      expect(response.status).toBe(403);
    });

    it('should validate update data', async () => {
      const invalidData = {
        name: '', // Empty name
        priceMonthly: -5 // Negative price
      };

      const response = await request(app)
        .put(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/communities/:id/join', () => {
    it('should allow user to join public community', async () => {
      const response = await request(app)
        .post(`/api/v1/communities/${testCommunity.id}/join`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.role).toBe('member');
    });

    it('should prevent duplicate membership', async () => {
      const response = await request(app)
        .post(`/api/v1/communities/${testCommunity.id}/join`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Already a member');
    });

    it('should create pending membership for approval-required communities', async () => {
      // Create community requiring approval
      const approvalCommunity = await prisma.community.create({
        data: {
          name: 'Approval Required Community',
          slug: 'approval-required',
          creatorId: testUser1.id,
          requiresApproval: true,
          memberCount: 1
        }
      });

      // Create membership for creator
      await prisma.communityMembership.create({
        data: {
          userId: testUser1.id,
          communityId: approvalCommunity.id,
          role: 'admin',
          status: 'active'
        }
      });

      const response = await request(app)
        .post(`/api/v1/communities/${approvalCommunity.id}/join`)
        .set('Authorization', `Bearer ${authToken3}`);

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('pending');
    });

    it('should return 404 for non-existent community', async () => {
      const response = await request(app)
        .post('/api/v1/communities/non-existent/join')
        .set('Authorization', `Bearer ${authToken3}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/communities/:id/leave', () => {
    it('should allow member to leave community', async () => {
      const response = await request(app)
        .delete(`/api/v1/communities/${testCommunity.id}/leave`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Successfully left community');
    });

    it('should prevent creator from leaving their own community', async () => {
      const response = await request(app)
        .delete(`/api/v1/communities/${testCommunity.id}/leave`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('creator cannot leave');
    });

    it('should return 409 for non-members', async () => {
      const response = await request(app)
        .delete(`/api/v1/communities/${testCommunity.id}/leave`)
        .set('Authorization', `Bearer ${authToken3}`);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Not a member');
    });
  });

  describe('Member Management', () => {
    beforeAll(async () => {
      // Add testUser2 back as member for member management tests
      await prisma.communityMembership.upsert({
        where: {
          userId_communityId: {
            userId: testUser2.id,
            communityId: testCommunity.id
          }
        },
        create: {
          userId: testUser2.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        },
        update: {
          role: 'member',
          status: 'active'
        }
      });

      // Update member count
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { memberCount: 2 }
      });
    });

    describe('GET /api/v1/communities/:id/members', () => {
      it('should return community members for members', async () => {
        const response = await request(app)
          .get(`/api/v1/communities/${testCommunity.id}/members`)
          .set('Authorization', `Bearer ${authToken1}`);

        expect(response.status).toBe(200);
        expect(response.body.data.members.length).toBeGreaterThanOrEqual(2);
      });

      it('should deny access to non-members', async () => {
        const response = await request(app)
          .get(`/api/v1/communities/${testCommunity.id}/members`)
          .set('Authorization', `Bearer ${authToken3}`);

        expect(response.status).toBe(403);
      });

      it('should support filtering by role', async () => {
        const response = await request(app)
          .get(`/api/v1/communities/${testCommunity.id}/members?role=admin`)
          .set('Authorization', `Bearer ${authToken1}`);

        expect(response.status).toBe(200);
        expect(response.body.data.members).toHaveLength(1);
        expect(response.body.data.members[0].role).toBe('admin');
      });
    });

    describe('PUT /api/v1/communities/:id/members/:userId/role', () => {
      it('should allow admin to promote member to moderator', async () => {
        const response = await request(app)
          .put(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}/role`)
          .set('Authorization', `Bearer ${authToken1}`)
          .send({ role: 'moderator' });

        expect(response.status).toBe(200);
        expect(response.body.data.role).toBe('moderator');
      });

      it('should prevent non-admin from changing roles', async () => {
        const response = await request(app)
          .put(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}/role`)
          .set('Authorization', `Bearer ${authToken2}`)
          .send({ role: 'admin' });

        expect(response.status).toBe(403);
      });

      it('should validate role values', async () => {
        const response = await request(app)
          .put(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}/role`)
          .set('Authorization', `Bearer ${authToken1}`)
          .send({ role: 'invalid-role' });

        expect(response.status).toBe(400);
      });
    });

    describe('PUT /api/v1/communities/:id/members/:userId/status', () => {
      it('should allow admin to suspend member', async () => {
        const response = await request(app)
          .put(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}/status`)
          .set('Authorization', `Bearer ${authToken1}`)
          .send({ status: 'suspended' });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('suspended');
      });

      it('should allow admin to reactivate suspended member', async () => {
        const response = await request(app)
          .put(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}/status`)
          .set('Authorization', `Bearer ${authToken1}`)
          .send({ status: 'active' });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('active');
      });
    });

    describe('DELETE /api/v1/communities/:id/members/:userId', () => {
      it('should allow admin to remove member', async () => {
        const response = await request(app)
          .delete(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}`)
          .set('Authorization', `Bearer ${authToken1}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toContain('removed successfully');
      });

      it('should prevent removing community creator', async () => {
        const response = await request(app)
          .delete(`/api/v1/communities/${testCommunity.id}/members/${testUser1.id}`)
          .set('Authorization', `Bearer ${authToken1}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Cannot remove community creator');
      });

      it('should return 404 for non-existent member', async () => {
        const response = await request(app)
          .delete(`/api/v1/communities/${testCommunity.id}/members/${testUser2.id}`)
          .set('Authorization', `Bearer ${authToken1}`);

        expect(response.status).toBe(404);
      });
    });
  });

  describe('DELETE /api/v1/communities/:id', () => {
    it('should allow creator to delete community', async () => {
      const response = await request(app)
        .delete(`/api/v1/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted successfully');
    });

    it('should prevent non-creator from deleting community', async () => {
      // Create another community for this test
      const anotherCommunity = await prisma.community.create({
        data: {
          name: 'Another Community',
          slug: 'another-community',
          creatorId: testUser1.id,
          memberCount: 1
        }
      });

      const response = await request(app)
        .delete(`/api/v1/communities/${anotherCommunity.id}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(404); // Returns 404 for security (not revealing existence)
    });
  });
});
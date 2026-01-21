import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { generateTokenPair } from '../lib/auth';

describe('User Profile Routes', () => {
  let testUser: any;
  let authToken: string;

  // Set up test user before each test
  beforeEach(async () => {
    // Clean up database
    await prisma.user.deleteMany();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        username: 'testuser',
        displayName: 'Test User',
        bio: 'Test bio',
        totalPoints: 100
      }
    });

    // Generate auth token
    const tokens = generateTokenPair(testUser);
    authToken = tokens.accessToken;
  });

  // Clean up database after all tests
  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/users/profile', () => {
    it('should get user profile with authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Profile retrieved successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', testUser.id);
      expect(response.body.user).toHaveProperty('email', testUser.email);
      expect(response.body.user).toHaveProperty('username', testUser.username);
      expect(response.body.user).toHaveProperty('displayName', testUser.displayName);
      expect(response.body.user).toHaveProperty('bio', testUser.bio);
      expect(response.body.user).toHaveProperty('totalPoints', testUser.totalPoints);
      expect(response.body.user).toHaveProperty('statistics');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication failed');
    });
  });

  describe('PUT /api/v1/users/profile', () => {
    it('should update user profile with valid data', async () => {
      const updateData = {
        displayName: 'Updated Name',
        bio: 'Updated bio content',
        avatarUrl: 'https://example.com/avatar.jpg'
      };

      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Profile updated successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('displayName', updateData.displayName);
      expect(response.body.user).toHaveProperty('bio', updateData.bio);
      expect(response.body.user).toHaveProperty('avatarUrl', updateData.avatarUrl);

      // Verify in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(updatedUser?.displayName).toBe(updateData.displayName);
      expect(updatedUser?.bio).toBe(updateData.bio);
      expect(updatedUser?.avatarUrl).toBe(updateData.avatarUrl);
    });

    it('should update partial profile data', async () => {
      const updateData = {
        displayName: 'Only Name Updated'
      };

      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.user).toHaveProperty('displayName', updateData.displayName);
      expect(response.body.user).toHaveProperty('bio', testUser.bio); // Should remain unchanged
    });

    it('should reject update with invalid avatar URL', async () => {
      const updateData = {
        avatarUrl: 'not-a-valid-url'
      };

      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toHaveProperty('avatarUrl');
    });

    it('should reject update with too long display name', async () => {
      const updateData = {
        displayName: 'a'.repeat(101) // Exceeds 100 character limit
      };

      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toHaveProperty('displayName');
    });

    it('should reject update without authentication', async () => {
      const updateData = {
        displayName: 'Updated Name'
      };

      const response = await request(app)
        .put('/api/v1/users/profile')
        .send(updateData)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('GET /api/v1/users/activity', () => {
    beforeEach(async () => {
      // Create test community and content for activity
      const community = await prisma.community.create({
        data: {
          name: 'Test Community',
          slug: 'test-community',
          creatorId: testUser.id
        }
      });

      // Create test post
      await prisma.post.create({
        data: {
          title: 'Test Post',
          content: 'Test post content',
          authorId: testUser.id,
          communityId: community.id
        }
      });

      // Create test points transaction
      await prisma.pointsTransaction.create({
        data: {
          userId: testUser.id,
          communityId: community.id,
          points: 10,
          reason: 'Test activity'
        }
      });
    });

    it('should get user activity with authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/activity')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Activity retrieved successfully');
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.activities)).toBe(true);
    });

    it('should filter activity by type', async () => {
      const response = await request(app)
        .get('/api/v1/users/activity?type=posts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.activities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'post' })
        ])
      );
    });

    it('should paginate activity results', async () => {
      const response = await request(app)
        .get('/api/v1/users/activity?limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.pagination).toHaveProperty('limit', 1);
      expect(response.body.pagination).toHaveProperty('offset', 0);
    });

    it('should reject invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/users/activity?limit=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/activity')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });
});
import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

describe('Search and Discovery Features', () => {
  let testUser: any;
  let authToken: string;
  let testCommunity1: any;
  let testCommunity2: any;

  beforeAll(async () => {
    // Clean up existing data
    await prisma.userBookmark.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'search-test@example.com',
        passwordHash: 'hashedpassword',
        username: 'searchuser',
        displayName: 'Search User',
        emailVerified: true
      }
    });

    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test communities
    testCommunity1 = await prisma.community.create({
      data: {
        name: 'JavaScript Mastery',
        description: 'Learn advanced JavaScript techniques',
        slug: 'javascript-mastery',
        category: 'Technology',
        creatorId: testUser.id,
        isPublic: true,
        memberCount: 150,
        priceMonthly: 29.99
      }
    });

    testCommunity2 = await prisma.community.create({
      data: {
        name: 'Python for Beginners',
        description: 'Start your Python journey here',
        slug: 'python-beginners',
        category: 'Technology',
        creatorId: testUser.id,
        isPublic: true,
        memberCount: 75
      }
    });

    // Add creator memberships
    await prisma.communityMembership.create({
      data: {
        userId: testUser.id,
        communityId: testCommunity1.id,
        role: 'admin',
        status: 'active'
      }
    });

    await prisma.communityMembership.create({
      data: {
        userId: testUser.id,
        communityId: testCommunity2.id,
        role: 'admin',
        status: 'active'
      }
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.userBookmark.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('GET /api/v1/communities/search', () => {
    it('should search communities by name', async () => {
      const response = await request(app)
        .get('/api/v1/communities/search')
        .query({ query: 'JavaScript' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toHaveLength(1);
      expect(response.body.data.communities[0].name).toBe('JavaScript Mastery');
    });

    it('should search communities by category', async () => {
      const response = await request(app)
        .get('/api/v1/communities/search')
        .query({ 
          query: 'Technology',
          category: 'Technology'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities.length).toBeGreaterThan(0);
    });

    it('should filter by price range', async () => {
      const response = await request(app)
        .get('/api/v1/communities/search')
        .query({ 
          query: 'JavaScript',
          priceRange: 'under-50'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toHaveLength(1);
    });

    it('should filter by member count', async () => {
      const response = await request(app)
        .get('/api/v1/communities/search')
        .query({ 
          query: 'Python',
          memberCount: 'small'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toHaveLength(1);
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/v1/communities/search');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/communities/discover', () => {
    it('should return trending communities', async () => {
      const response = await request(app)
        .get('/api/v1/communities/discover')
        .query({ type: 'trending' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toBeDefined();
      expect(response.body.data.type).toBe('trending');
    });

    it('should return popular communities', async () => {
      const response = await request(app)
        .get('/api/v1/communities/discover')
        .query({ type: 'popular' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('popular');
    });

    it('should return new communities', async () => {
      const response = await request(app)
        .get('/api/v1/communities/discover')
        .query({ type: 'new' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('new');
    });
  });

  describe('GET /api/v1/communities/categories', () => {
    it('should return available categories', async () => {
      const response = await request(app)
        .get('/api/v1/communities/categories');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Bookmark functionality', () => {
    it('should bookmark a community', async () => {
      const response = await request(app)
        .post(`/api/v1/communities/${testCommunity2.id}/bookmark`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.community.id).toBe(testCommunity2.id);
    });

    it('should prevent duplicate bookmarks', async () => {
      const response = await request(app)
        .post(`/api/v1/communities/${testCommunity2.id}/bookmark`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Conflict');
    });

    it('should get user bookmarks', async () => {
      const response = await request(app)
        .get('/api/v1/communities/bookmarks')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.bookmarks).toHaveLength(1);
      expect(response.body.data.bookmarks[0].id).toBe(testCommunity2.id);
    });

    it('should remove bookmark', async () => {
      const response = await request(app)
        .delete(`/api/v1/communities/${testCommunity2.id}/bookmark`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require authentication for bookmarks', async () => {
      const response = await request(app)
        .post(`/api/v1/communities/${testCommunity1.id}/bookmark`);

      expect(response.status).toBe(401);
    });
  });

  describe('User Interests and Recommendations', () => {
    it('should set user interests', async () => {
      const response = await request(app)
        .put('/api/v1/recommendations/interests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          interests: [
            { category: 'Technology', score: 0.8 },
            { category: 'Business', score: 0.6 }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should get user interests', async () => {
      const response = await request(app)
        .get('/api/v1/recommendations/interests')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get personalized recommendations', async () => {
      const response = await request(app)
        .get('/api/v1/recommendations/communities')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toBeDefined();
      expect(Array.isArray(response.body.data.communities)).toBe(true);
    });

    it('should get similar communities', async () => {
      const response = await request(app)
        .get(`/api/v1/recommendations/similar/${testCommunity1.id}`)
        .query({ limit: 3 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toBeDefined();
    });

    it('should require authentication for setting interests', async () => {
      const response = await request(app)
        .put('/api/v1/recommendations/interests')
        .send({
          interests: [{ category: 'Technology', score: 0.8 }]
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Enhanced community listing', () => {
    it('should support category filtering', async () => {
      const response = await request(app)
        .get('/api/v1/communities')
        .query({ category: 'Technology' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities.length).toBeGreaterThan(0);
    });

    it('should support sorting by members', async () => {
      const response = await request(app)
        .get('/api/v1/communities')
        .query({ sortBy: 'members' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toBeDefined();
    });

    it('should support price range filtering', async () => {
      const response = await request(app)
        .get('/api/v1/communities')
        .query({ priceRange: 'free' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.communities).toBeDefined();
    });
  });
});
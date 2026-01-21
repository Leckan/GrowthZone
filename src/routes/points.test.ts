import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { PointsService } from '../lib/pointsService';
import { AchievementService } from '../lib/achievementService';

describe('Points System Integration', () => {
  let testUser: any;
  let testCommunity: any;

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'points-test@example.com',
        passwordHash: '$2b$10$hashedpassword',
        username: 'pointsuser',
        displayName: 'Points Test User'
      }
    });

    // Create test community
    testCommunity = await prisma.community.create({
      data: {
        name: 'Points Test Community',
        slug: 'points-test-community',
        creatorId: testUser.id,
        isPublic: true
      }
    });
  });

  afterAll(async () => {
    // Clean up test data in correct order
    await prisma.pointsTransaction.deleteMany({
      where: { userId: testUser.id }
    });
    await prisma.communityMembership.deleteMany({
      where: { userId: testUser.id }
    });
    await prisma.community.deleteMany({
      where: { creatorId: testUser.id }
    });
    await prisma.user.deleteMany({
      where: { email: 'points-test@example.com' }
    });
  });

  describe('PointsService', () => {
    it('should award points and update user total', async () => {
      const result = await PointsService.awardPoints({
        userId: testUser.id,
        communityId: testCommunity.id,
        points: 25,
        reason: 'Test points'
      });

      expect(result.transaction.points).toBe(25);
      expect(result.newTotalPoints).toBe(25);

      // Verify user's total points were updated
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(updatedUser?.totalPoints).toBe(25);
    });

    it('should award points based on predefined rules', async () => {
      const result = await PointsService.awardPointsForAction(
        testUser.id,
        testCommunity.id,
        'POST_CREATED'
      );

      expect(result.transaction.points).toBe(10); // Default points for POST_CREATED
      expect(result.transaction.reason).toContain('Created a new post');
    });

    it('should get user points history', async () => {
      const history = await PointsService.getUserPointsHistory(testUser.id);

      expect(history.transactions).toBeDefined();
      expect(Array.isArray(history.transactions)).toBe(true);
      expect(history.transactions.length).toBeGreaterThan(0);
    });

    it('should get community leaderboard', async () => {
      const leaderboard = await PointsService.getCommunityLeaderboard({
        communityId: testCommunity.id,
        limit: 5
      });

      expect(Array.isArray(leaderboard)).toBe(true);
      // Leaderboard might be empty if no points transactions exist for this community
    });

    it('should check first-time bonus correctly', async () => {
      const isFirstTime = await PointsService.checkFirstTimeBonus(
        testUser.id,
        testCommunity.id,
        'FIRST_COMMENT'
      );

      expect(isFirstTime).toBe(true);

      // Award points for an action
      await PointsService.awardPointsForAction(
        testUser.id,
        testCommunity.id,
        'COMMENT_CREATED'
      );

      const isStillFirstTime = await PointsService.checkFirstTimeBonus(
        testUser.id,
        testCommunity.id,
        'COMMENT_CREATED'
      );

      expect(isStillFirstTime).toBe(false);
    });
  });

  describe('AchievementService', () => {
    it('should return achievement progress for user', async () => {
      const progress = await AchievementService.getUserAchievementProgress(testUser.id);

      expect(Array.isArray(progress)).toBe(true);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[0]).toHaveProperty('achievement');
      expect(progress[0]).toHaveProperty('progress');
      expect(progress[0]).toHaveProperty('isEarned');
    });

    it('should return user milestone information', async () => {
      const milestones = await AchievementService.getUserMilestones(testUser.id);

      expect(milestones).toHaveProperty('currentPoints');
      expect(milestones).toHaveProperty('earnedAchievements');
      expect(milestones).toHaveProperty('nextAchievement');
      expect(milestones).toHaveProperty('pointsToNext');
      expect(milestones).toHaveProperty('progressToNext');

      expect(Array.isArray(milestones.earnedAchievements)).toBe(true);
    });

    it('should return achievement statistics', async () => {
      const stats = await AchievementService.getAchievementStats();

      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('totalAchievements');
      expect(stats).toHaveProperty('achievementStats');

      expect(Array.isArray(stats.achievementStats)).toBe(true);
      expect(stats.achievementStats[0]).toHaveProperty('achievement');
      expect(stats.achievementStats[0]).toHaveProperty('usersEarned');
      expect(stats.achievementStats[0]).toHaveProperty('percentage');
    });
  });

  describe('Points API Endpoints', () => {
    it('should get global leaderboard', async () => {
      const response = await request(app)
        .get('/api/v1/points/leaderboard');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get community leaderboard', async () => {
      const response = await request(app)
        .get('/api/v1/points/leaderboard')
        .query({ communityId: testCommunity.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get achievement leaderboard', async () => {
      const response = await request(app)
        .get('/api/v1/points/achievements/leaderboard');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get achievement stats', async () => {
      const response = await request(app)
        .get('/api/v1/points/achievements/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalUsers');
      expect(response.body.data).toHaveProperty('achievementStats');
    });

    it('should get community stats', async () => {
      const response = await request(app)
        .get(`/api/v1/points/community/${testCommunity.id}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalPointsAwarded');
      expect(response.body.data).toHaveProperty('totalTransactions');
    });
  });
});
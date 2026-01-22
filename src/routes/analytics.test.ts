import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { RevenueService } from '../lib/revenueService';
import { generateTokenPair } from '../lib/auth';

// Mock RevenueService
jest.mock('../lib/revenueService');
const mockRevenueService = RevenueService as jest.Mocked<typeof RevenueService>;

describe('Analytics Routes', () => {
  let testUser: any;
  let testCommunity: any;
  let authToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clean up any existing data
    await prisma.subscription.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test-analytics@example.com',
        passwordHash: 'hashedpassword',
        username: 'testanalyticsuser',
        displayName: 'Test Analytics User',
      },
    });

    // Create test community
    testCommunity = await prisma.community.create({
      data: {
        name: 'Test Analytics Community',
        slug: 'test-analytics-community',
        creatorId: testUser.id,
        priceMonthly: 29.99,
      },
    });

    // Generate auth token
    const tokens = generateTokenPair(testUser);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('GET /api/v1/analytics/revenue/metrics', () => {
    it('should return revenue metrics for a period', async () => {
      const mockMetrics = {
        totalRevenue: 1000,
        monthlyRevenue: 500,
        activeSubscriptions: 10,
        churnRate: 5.5,
        averageRevenuePerUser: 100,
        monthlyRecurringRevenue: 500,
      };

      mockRevenueService.getRevenueMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/api/v1/analytics/revenue/metrics')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          communityId: testCommunity.id,
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.metrics).toEqual(mockMetrics);
      expect(response.body.period).toBeDefined();
      expect(mockRevenueService.getRevenueMetrics).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        testCommunity.id
      );
    });

    it('should return 403 for community not owned by user', async () => {
      // Create another user's community
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@example.com',
          passwordHash: 'hashedpassword',
          username: 'otheruser',
        },
      });

      const otherCommunity = await prisma.community.create({
        data: {
          name: 'Other Community',
          slug: 'other-community',
          creatorId: otherUser.id,
          priceMonthly: 19.99,
        },
      });

      const response = await request(app)
        .get('/api/v1/analytics/revenue/metrics')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          communityId: otherCommunity.id,
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied to this community');
    });
  });

  describe('GET /api/v1/analytics/revenue/payouts', () => {
    it('should return creator payouts for a period', async () => {
      const mockPayouts = [
        {
          creatorId: testUser.id,
          communityId: testCommunity.id,
          totalRevenue: 1000,
          platformFee: 50,
          creatorEarnings: 950,
          period: {
            start: new Date('2024-01-01'),
            end: new Date('2024-01-31'),
          },
        },
      ];

      mockRevenueService.calculateCreatorPayouts.mockResolvedValue(mockPayouts);

      const response = await request(app)
        .get('/api/v1/analytics/revenue/payouts')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.payouts).toHaveLength(1);
      expect(response.body.payouts[0].totalRevenue).toBe(1000);
      expect(response.body.payouts[0].creatorEarnings).toBe(950);
      expect(mockRevenueService.calculateCreatorPayouts).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        testUser.id
      );
    });
  });

  describe('GET /api/v1/analytics/subscriptions/analytics', () => {
    it('should return subscription analytics', async () => {
      const mockAnalytics = {
        newSubscriptions: 15,
        canceledSubscriptions: 3,
        netGrowth: 12,
        churnRate: 5.5,
        period: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      };

      mockRevenueService.getSubscriptionAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/v1/analytics/subscriptions/analytics')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          communityId: testCommunity.id,
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.newSubscriptions).toBe(15);
      expect(response.body.canceledSubscriptions).toBe(3);
      expect(response.body.netGrowth).toBe(12);
      expect(response.body.churnRate).toBe(5.5);
      expect(mockRevenueService.getSubscriptionAnalytics).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        testCommunity.id
      );
    });
  });

  describe('GET /api/v1/analytics/revenue/breakdown', () => {
    it('should return revenue breakdown by community', async () => {
      const mockBreakdown = [
        {
          communityId: testCommunity.id,
          communityName: testCommunity.name,
          revenue: 1000,
          subscriptions: 10,
          averageRevenuePerUser: 100,
        },
      ];

      mockRevenueService.getRevenueBreakdown.mockResolvedValue(mockBreakdown);

      const response = await request(app)
        .get('/api/v1/analytics/revenue/breakdown')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.breakdown).toEqual(mockBreakdown);
      expect(mockRevenueService.getRevenueBreakdown).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        testUser.id
      );
    });
  });

  describe('GET /api/v1/analytics/communities/top', () => {
    it('should return top performing communities', async () => {
      const mockTopCommunities = [
        {
          communityId: testCommunity.id,
          communityName: testCommunity.name,
          creatorName: testUser.displayName,
          revenue: 1000,
          subscriptions: 10,
        },
      ];

      mockRevenueService.getTopCommunities.mockResolvedValue(mockTopCommunities);

      const response = await request(app)
        .get('/api/v1/analytics/communities/top')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          limit: '5',
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.communities).toEqual(mockTopCommunities);
      expect(mockRevenueService.getTopCommunities).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        5
      );
    });
  });

  describe('GET /api/v1/analytics/dashboard/summary', () => {
    it('should return creator dashboard summary', async () => {
      const mockMetrics = {
        totalRevenue: 1000,
        monthlyRevenue: 500,
        activeSubscriptions: 10,
        churnRate: 5.5,
        averageRevenuePerUser: 100,
        monthlyRecurringRevenue: 500,
      };

      const mockPayouts = [
        {
          creatorId: testUser.id,
          communityId: testCommunity.id,
          totalRevenue: 1000,
          platformFee: 50,
          creatorEarnings: 950,
          period: {
            start: new Date(),
            end: new Date(),
          },
        },
      ];

      const mockBreakdown = [
        {
          communityId: testCommunity.id,
          communityName: testCommunity.name,
          revenue: 1000,
          subscriptions: 10,
          averageRevenuePerUser: 100,
        },
      ];

      mockRevenueService.getRevenueMetrics.mockResolvedValue(mockMetrics);
      mockRevenueService.calculateCreatorPayouts.mockResolvedValue(mockPayouts);
      mockRevenueService.getRevenueBreakdown.mockResolvedValue(mockBreakdown);

      const response = await request(app)
        .get('/api/v1/analytics/dashboard/summary')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.totalCommunities).toBe(1);
      expect(response.body.summary.totalEarnings).toBe(950);
      expect(response.body.breakdown).toEqual(mockBreakdown);
    }, 15000); // Increase timeout to 15 seconds
  });
});
import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { StripeService } from '../lib/stripeService';
import { generateTokenPair } from '../lib/auth';

// Mock Stripe service
jest.mock('../lib/stripeService');
const mockStripeService = StripeService as jest.Mocked<typeof StripeService>;

describe('Payment Routes', () => {
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
        email: 'test-payment@example.com',
        passwordHash: 'hashedpassword',
        username: 'testpaymentuser',
        displayName: 'Test Payment User',
      },
    });

    // Create test community
    testCommunity = await prisma.community.create({
      data: {
        name: 'Test Payment Community',
        slug: 'test-payment-community',
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

  describe('POST /api/v1/payments/subscriptions', () => {
    it('should create a subscription successfully', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600,
      };

      mockStripeService.createSubscription.mockResolvedValue({
        subscription: mockSubscription as any,
        clientSecret: 'pi_test_client_secret',
      });

      const response = await request(app)
        .post('/api/v1/payments/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          communityId: testCommunity.id,
          priceId: 'price_test123',
          paymentMethodId: 'pm_test123',
        });

      expect(response.status).toBe(200);
      expect(response.body.subscriptionId).toBe('sub_test123');
      expect(response.body.clientSecret).toBe('pi_test_client_secret');
      expect(mockStripeService.createSubscription).toHaveBeenCalledWith({
        userId: testUser.id,
        communityId: testCommunity.id,
        priceId: 'price_test123',
        paymentMethodId: 'pm_test123',
      });
    });

    it('should return 404 for non-existent community', async () => {
      const response = await request(app)
        .post('/api/v1/payments/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          communityId: 'non-existent-id',
          priceId: 'price_test123',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Community not found');
    });
  });

  describe('GET /api/v1/payments/subscriptions', () => {
    it('should return user subscriptions', async () => {
      // Create test subscription directly in database
      await prisma.subscription.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          stripeSubscriptionId: 'sub_list_test',
          status: 'active',
        },
      });

      const response = await request(app)
        .get('/api/v1/payments/subscriptions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(1);
      expect(response.body.subscriptions[0].stripeSubscriptionId).toBe('sub_list_test');
    });
  });

  describe('POST /api/v1/payments/setup-intent', () => {
    it('should create setup intent successfully', async () => {
      const mockCustomer = { id: 'cus_test123' };
      const mockSetupIntent = { client_secret: 'seti_test_client_secret' };

      mockStripeService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
      mockStripeService.createSetupIntent.mockResolvedValue(mockSetupIntent as any);

      const response = await request(app)
        .post('/api/v1/payments/setup-intent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.clientSecret).toBe('seti_test_client_secret');
      expect(response.body.customerId).toBe('cus_test123');
    });
  });

  describe('GET /api/v1/payments/payment-methods', () => {
    it('should return user payment methods', async () => {
      const mockCustomer = { id: 'cus_test123' };
      const mockPaymentMethods = [
        { id: 'pm_test1', card: { last4: '4242' } },
        { id: 'pm_test2', card: { last4: '1234' } },
      ];

      mockStripeService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
      mockStripeService.getPaymentMethods.mockResolvedValue(mockPaymentMethods as any);

      const response = await request(app)
        .get('/api/v1/payments/payment-methods')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.paymentMethods).toHaveLength(2);
    });
  });

  describe('Subscription Lifecycle Management', () => {
    beforeEach(async () => {
      // Create a test subscription for lifecycle tests
      await prisma.subscription.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          stripeSubscriptionId: 'sub_lifecycle_test',
          status: 'active',
        },
      });
    });

    describe('POST /api/v1/payments/subscriptions/:subscriptionId/pause', () => {
      it('should pause a subscription successfully', async () => {
        const mockPausedSubscription = {
          id: 'sub_lifecycle_test',
          status: 'paused',
        };

        mockStripeService.pauseSubscription.mockResolvedValue(mockPausedSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_lifecycle_test/pause')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('paused');
        expect(mockStripeService.pauseSubscription).toHaveBeenCalledWith('sub_lifecycle_test');
      });
    });

    describe('POST /api/v1/payments/subscriptions/:subscriptionId/resume', () => {
      it('should resume a subscription successfully', async () => {
        const mockResumedSubscription = {
          id: 'sub_lifecycle_test',
          status: 'active',
        };

        mockStripeService.resumeSubscription.mockResolvedValue(mockResumedSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_lifecycle_test/resume')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('active');
        expect(mockStripeService.resumeSubscription).toHaveBeenCalledWith('sub_lifecycle_test');
      });
    });

    describe('POST /api/v1/payments/subscriptions/:subscriptionId/schedule-cancel', () => {
      it('should schedule subscription cancellation successfully', async () => {
        const mockScheduledSubscription = {
          id: 'sub_lifecycle_test',
          status: 'active',
          current_period_end: 1643673600,
        };

        mockStripeService.scheduleSubscriptionCancellation.mockResolvedValue(mockScheduledSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_lifecycle_test/schedule-cancel')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('cancel_at_period_end');
        expect(mockStripeService.scheduleSubscriptionCancellation).toHaveBeenCalledWith('sub_lifecycle_test');
      });
    });

    describe('PUT /api/v1/payments/subscriptions/:subscriptionId/payment-method', () => {
      it('should update subscription payment method successfully', async () => {
        const mockUpdatedSubscription = {
          id: 'sub_lifecycle_test',
          status: 'active',
        };

        mockStripeService.updateSubscriptionPaymentMethod.mockResolvedValue(mockUpdatedSubscription as any);

        const response = await request(app)
          .put('/api/v1/payments/subscriptions/sub_lifecycle_test/payment-method')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ paymentMethodId: 'pm_new123' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Payment method updated successfully');
        expect(mockStripeService.updateSubscriptionPaymentMethod).toHaveBeenCalledWith(
          'sub_lifecycle_test',
          'pm_new123'
        );
      });

      it('should return 400 if payment method ID is missing', async () => {
        const response = await request(app)
          .put('/api/v1/payments/subscriptions/sub_lifecycle_test/payment-method')
          .set('Authorization', `Bearer ${authToken}`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Payment method ID is required');
      });
    });

    describe('GET /api/v1/payments/subscriptions/:subscriptionId/invoices', () => {
      it('should return subscription billing history', async () => {
        const mockInvoices = [
          {
            id: 'in_test1',
            amount_paid: 2999,
            currency: 'usd',
            status: 'paid',
            created: 1640995200,
            status_transitions: { paid_at: 1640995300 },
            hosted_invoice_url: 'https://invoice.stripe.com/test1',
          },
          {
            id: 'in_test2',
            amount_paid: 2999,
            currency: 'usd',
            status: 'paid',
            created: 1638403200,
            status_transitions: { paid_at: 1638403300 },
            hosted_invoice_url: 'https://invoice.stripe.com/test2',
          },
        ];

        mockStripeService.getSubscriptionInvoices.mockResolvedValue(mockInvoices as any);

        const response = await request(app)
          .get('/api/v1/payments/subscriptions/sub_lifecycle_test/invoices')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.invoices).toHaveLength(2);
        expect(response.body.invoices[0].amount).toBe(2999);
        expect(mockStripeService.getSubscriptionInvoices).toHaveBeenCalledWith('sub_lifecycle_test');
      });
    });
  });
});
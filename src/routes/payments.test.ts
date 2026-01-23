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

  describe('Payment Edge Cases and Failure Scenarios', () => {
    beforeEach(async () => {
      // Create a test subscription for edge case tests
      await prisma.subscription.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          stripeSubscriptionId: 'sub_edge_test',
          status: 'active',
        },
      });
    });

    describe('Payment Failure Scenarios', () => {
      it('should handle Stripe API errors during subscription creation', async () => {
        // Clean up any existing subscriptions first
        await prisma.subscription.deleteMany({
          where: { userId: testUser.id, communityId: testCommunity.id }
        });

        const stripeError = new Error('Your card was declined.');
        (stripeError as any).type = 'StripeCardError';
        (stripeError as any).code = 'card_declined';

        mockStripeService.createSubscription.mockRejectedValue(stripeError);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            communityId: testCommunity.id,
            priceId: 'price_test123',
            paymentMethodId: 'pm_declined',
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to create subscription');
      });

      it('should handle insufficient funds error', async () => {
        // Clean up any existing subscriptions first
        await prisma.subscription.deleteMany({
          where: { userId: testUser.id, communityId: testCommunity.id }
        });

        const insufficientFundsError = new Error('Your card has insufficient funds.');
        (insufficientFundsError as any).type = 'StripeCardError';
        (insufficientFundsError as any).code = 'insufficient_funds';

        mockStripeService.createSubscription.mockRejectedValue(insufficientFundsError);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            communityId: testCommunity.id,
            priceId: 'price_test123',
            paymentMethodId: 'pm_insufficient_funds',
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to create subscription');
      });

      it('should handle expired card error', async () => {
        // Clean up any existing subscriptions first
        await prisma.subscription.deleteMany({
          where: { userId: testUser.id, communityId: testCommunity.id }
        });

        const expiredCardError = new Error('Your card has expired.');
        (expiredCardError as any).type = 'StripeCardError';
        (expiredCardError as any).code = 'expired_card';

        mockStripeService.createSubscription.mockRejectedValue(expiredCardError);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            communityId: testCommunity.id,
            priceId: 'price_test123',
            paymentMethodId: 'pm_expired',
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to create subscription');
      });

      it('should handle validation errors for invalid request data', async () => {
        const response = await request(app)
          .post('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            // Missing required fields
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request data');
        expect(response.body.details).toBeDefined();
      });

      it('should handle payment retry for failed subscription', async () => {
        const mockRetrySubscription = {
          id: 'sub_edge_test',
          status: 'active',
          current_period_start: 1640995200,
          current_period_end: 1643673600,
        };

        mockStripeService.retryFailedPayment.mockResolvedValue(mockRetrySubscription as any);
        mockStripeService.updateSubscriptionStatus.mockResolvedValue();

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/retry')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('active');
        expect(mockStripeService.retryFailedPayment).toHaveBeenCalledWith('sub_edge_test');
      });

      it('should handle retry failure for non-existent subscription', async () => {
        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_nonexistent/retry')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Subscription not found');
      });

      it('should handle Stripe service unavailable during retry', async () => {
        const serviceError = new Error('Service temporarily unavailable');
        mockStripeService.retryFailedPayment.mockRejectedValue(serviceError);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/retry')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to retry payment');
      });

      it('should prevent duplicate active subscriptions', async () => {
        // Create another active subscription for the same user and community
        await prisma.subscription.create({
          data: {
            userId: testUser.id,
            communityId: testCommunity.id,
            stripeSubscriptionId: 'sub_duplicate_test',
            status: 'active',
          },
        });

        const response = await request(app)
          .post('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            communityId: testCommunity.id,
            priceId: 'price_test123',
            paymentMethodId: 'pm_test123',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('User already has an active subscription to this community');
      });
    });

    describe('Subscription State Transitions', () => {
      it('should handle transition from active to past_due', async () => {
        // Update subscription to past_due status
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: 'sub_edge_test' },
          data: { status: 'past_due' },
        });

        const response = await request(app)
          .get('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        const subscription = response.body.subscriptions.find(
          (sub: any) => sub.stripeSubscriptionId === 'sub_edge_test'
        );
        expect(subscription.status).toBe('past_due');
      });

      it('should handle transition from past_due to active after successful retry', async () => {
        // Start with past_due subscription
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: 'sub_edge_test' },
          data: { status: 'past_due' },
        });

        const mockRetrySubscription = {
          id: 'sub_edge_test',
          status: 'active',
          current_period_start: 1640995200,
          current_period_end: 1643673600,
        };

        mockStripeService.retryFailedPayment.mockResolvedValue(mockRetrySubscription as any);
        mockStripeService.updateSubscriptionStatus.mockResolvedValue();

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/retry')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('active');
      });

      it('should handle transition from active to canceled', async () => {
        const mockCanceledSubscription = {
          id: 'sub_edge_test',
          status: 'canceled',
          canceled_at: 1640995200,
        };

        mockStripeService.cancelSubscription.mockResolvedValue(mockCanceledSubscription as any);

        const response = await request(app)
          .delete('/api/v1/payments/subscriptions/sub_edge_test')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('canceled');
        expect(response.body.canceledAt).toBe(1640995200);
      });

      it('should handle transition from active to paused', async () => {
        const mockPausedSubscription = {
          id: 'sub_edge_test',
          status: 'paused',
        };

        mockStripeService.pauseSubscription.mockResolvedValue(mockPausedSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/pause')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('paused');
      });

      it('should handle transition from paused to active', async () => {
        const mockResumedSubscription = {
          id: 'sub_edge_test',
          status: 'active',
        };

        mockStripeService.resumeSubscription.mockResolvedValue(mockResumedSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/resume')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('active');
      });

      it('should handle transition to cancel_at_period_end', async () => {
        const mockScheduledSubscription = {
          id: 'sub_edge_test',
          status: 'active',
          current_period_end: 1643673600,
          cancel_at_period_end: true,
        };

        mockStripeService.scheduleSubscriptionCancellation.mockResolvedValue(mockScheduledSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/schedule-cancel')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('cancel_at_period_end');
        expect(response.body.cancelAt).toBe(1643673600);
      });

      it('should handle reactivation from cancel_at_period_end', async () => {
        const mockReactivatedSubscription = {
          id: 'sub_edge_test',
          status: 'active',
          cancel_at_period_end: false,
        };

        mockStripeService.unscheduleSubscriptionCancellation.mockResolvedValue(mockReactivatedSubscription as any);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/reactivate')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('active');
      });

      it('should handle invalid subscription state transitions', async () => {
        const stripeError = new Error('Cannot pause a canceled subscription');
        mockStripeService.pauseSubscription.mockRejectedValue(stripeError);

        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_edge_test/pause')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to pause subscription');
      });
    });

    describe('Payment Method Edge Cases', () => {
      it('should handle payment method update failure', async () => {
        const paymentMethodError = new Error('Payment method not found');
        mockStripeService.updateSubscriptionPaymentMethod.mockRejectedValue(paymentMethodError);

        const response = await request(app)
          .put('/api/v1/payments/subscriptions/sub_edge_test/payment-method')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ paymentMethodId: 'pm_invalid' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to update payment method');
      });

      it('should handle removal of non-existent payment method', async () => {
        const mockCustomer = { id: 'cus_test123' };
        const mockPaymentMethods: any[] = []; // Empty array - no payment methods

        mockStripeService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
        mockStripeService.getPaymentMethods.mockResolvedValue(mockPaymentMethods);

        const response = await request(app)
          .delete('/api/v1/payments/payment-methods/pm_nonexistent')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Payment method not found');
      });

      it('should handle Stripe error during payment method removal', async () => {
        const mockCustomer = { id: 'cus_test123' };
        const mockPaymentMethods = [{ id: 'pm_test123', card: { last4: '4242' } }];

        mockStripeService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
        mockStripeService.getPaymentMethods.mockResolvedValue(mockPaymentMethods as any);

        const stripeError = new Error('Payment method is attached to a subscription');
        mockStripeService.detachPaymentMethod.mockRejectedValue(stripeError);

        const response = await request(app)
          .delete('/api/v1/payments/payment-methods/pm_test123')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to remove payment method');
      });
    });

    describe('Plan Change Edge Cases', () => {
      it('should handle plan change with invalid price ID', async () => {
        const response = await request(app)
          .put('/api/v1/payments/subscriptions/sub_edge_test/plan')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ newPriceId: '' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('New price ID is required');
      });

      it('should handle Stripe error during plan change', async () => {
        const stripeError = new Error('Price not found');
        mockStripeService.changeSubscriptionPlan.mockRejectedValue(stripeError);

        const response = await request(app)
          .put('/api/v1/payments/subscriptions/sub_edge_test/plan')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ newPriceId: 'price_invalid' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to change subscription plan');
      });

      it('should handle upcoming invoice preview error', async () => {
        const invoiceError = new Error('No upcoming invoice');
        mockStripeService.getUpcomingInvoice.mockRejectedValue(invoiceError);

        const response = await request(app)
          .get('/api/v1/payments/subscriptions/sub_edge_test/upcoming-invoice?newPriceId=price_test')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to fetch upcoming invoice');
      });
    });

    describe('Authorization Edge Cases', () => {
      it('should prevent access to other users subscriptions', async () => {
        // Create another user
        const otherUser = await prisma.user.create({
          data: {
            email: 'other@example.com',
            passwordHash: 'hashedpassword',
            username: 'otheruser',
            displayName: 'Other User',
          },
        });

        // Create subscription for other user
        await prisma.subscription.create({
          data: {
            userId: otherUser.id,
            communityId: testCommunity.id,
            stripeSubscriptionId: 'sub_other_user',
            status: 'active',
          },
        });

        // Try to access other user's subscription
        const response = await request(app)
          .get('/api/v1/payments/subscriptions/sub_other_user')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Subscription not found');
      });

      it('should prevent unauthorized subscription operations', async () => {
        // Try to pause subscription that doesn't belong to user
        const response = await request(app)
          .post('/api/v1/payments/subscriptions/sub_unauthorized/pause')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Subscription not found');
      });
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
import express from 'express';
import { z } from 'zod';
import { StripeService } from '../lib/stripeService';
import prisma from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Validation schemas
const createSubscriptionSchema = z.object({
  communityId: z.string(),
  priceId: z.string(),
  paymentMethodId: z.string().optional(),
});

const setupIntentSchema = z.object({
  customerId: z.string().optional(),
});

/**
 * Create a subscription for a community
 */
router.post('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { communityId, priceId, paymentMethodId } = createSubscriptionSchema.parse(req.body);
    const userId = req.user!.id;

    // Check if community exists and requires payment
    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        communityId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (existingSubscription) {
      return res.status(400).json({ error: 'User already has an active subscription to this community' });
    }

    const result = await StripeService.createSubscription({
      userId,
      communityId,
      priceId,
      paymentMethodId,
    });

    return res.json({
      subscriptionId: result.subscription.id,
      clientSecret: result.clientSecret,
      status: result.subscription.status,
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * Cancel a subscription
 */
router.delete('/subscriptions/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const canceledSubscription = await StripeService.cancelSubscription(subscriptionId);

    return res.json({
      subscriptionId: canceledSubscription.id,
      status: canceledSubscription.status,
      canceledAt: canceledSubscription.canceled_at,
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * Get user's subscriptions
 */
router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            priceMonthly: true,
            priceYearly: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ subscriptions });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * Get subscription details
 */
router.get('/subscriptions/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Get detailed subscription info from Stripe
    const stripeSubscription = await StripeService.getSubscription(subscriptionId);
    const subscription_data = stripeSubscription as any;

    return res.json({
      subscription: {
        ...subscription,
        stripeDetails: {
          status: subscription_data.status,
          currentPeriodStart: subscription_data.current_period_start,
          currentPeriodEnd: subscription_data.current_period_end,
          cancelAtPeriodEnd: subscription_data.cancel_at_period_end,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription details' });
  }
});

/**
 * Create setup intent for payment method
 */
router.post('/setup-intent', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const customer = await StripeService.getOrCreateCustomer(userId);
    const setupIntent = await StripeService.createSetupIntent(customer.id);

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).json({ error: 'Failed to create setup intent' });
  }
});

/**
 * Get user's payment methods
 */
router.get('/payment-methods', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const customer = await StripeService.getOrCreateCustomer(userId);
    const paymentMethods = await StripeService.getPaymentMethods(customer.id);

    res.json({ paymentMethods });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

/**
 * Remove a payment method
 */
router.delete('/payment-methods/:paymentMethodId', authenticateToken, async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const userId = req.user!.id;

    // Verify the payment method belongs to the user
    const customer = await StripeService.getOrCreateCustomer(userId);
    const paymentMethods = await StripeService.getPaymentMethods(customer.id);
    
    const paymentMethod = paymentMethods.find(pm => pm.id === paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    await StripeService.detachPaymentMethod(paymentMethodId);

    return res.json({ message: 'Payment method removed successfully' });
  } catch (error) {
    console.error('Error removing payment method:', error);
    return res.status(500).json({ error: 'Failed to remove payment method' });
  }
});

/**
 * Retry failed payment
 */
router.post('/subscriptions/:subscriptionId/retry', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const updatedSubscription = await StripeService.retryFailedPayment(subscriptionId);
    const subscription_data = updatedSubscription as any;

    // Update local subscription status
    await StripeService.updateSubscriptionStatus(
      subscriptionId,
      subscription_data.status,
      subscription_data.current_period_start,
      subscription_data.current_period_end
    );

    return res.json({
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
    });
  } catch (error) {
    console.error('Error retrying payment:', error);
    return res.status(500).json({ error: 'Failed to retry payment' });
  }
});

/**
 * Pause a subscription
 */
router.post('/subscriptions/:subscriptionId/pause', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const pausedSubscription = await StripeService.pauseSubscription(subscriptionId);

    return res.json({
      subscriptionId: pausedSubscription.id,
      status: 'paused',
      message: 'Subscription paused successfully',
    });
  } catch (error) {
    console.error('Error pausing subscription:', error);
    return res.status(500).json({ error: 'Failed to pause subscription' });
  }
});

/**
 * Resume a paused subscription
 */
router.post('/subscriptions/:subscriptionId/resume', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const resumedSubscription = await StripeService.resumeSubscription(subscriptionId);

    return res.json({
      subscriptionId: resumedSubscription.id,
      status: resumedSubscription.status,
      message: 'Subscription resumed successfully',
    });
  } catch (error) {
    console.error('Error resuming subscription:', error);
    return res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * Schedule subscription cancellation at period end
 */
router.post('/subscriptions/:subscriptionId/schedule-cancel', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const scheduledSubscription = await StripeService.scheduleSubscriptionCancellation(subscriptionId);
    const subscription_data = scheduledSubscription as any;

    return res.json({
      subscriptionId: scheduledSubscription.id,
      status: 'cancel_at_period_end',
      cancelAt: subscription_data.current_period_end,
      message: 'Subscription scheduled for cancellation at period end',
    });
  } catch (error) {
    console.error('Error scheduling cancellation:', error);
    return res.status(500).json({ error: 'Failed to schedule cancellation' });
  }
});

/**
 * Unschedule subscription cancellation (reactivate)
 */
router.post('/subscriptions/:subscriptionId/reactivate', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const reactivatedSubscription = await StripeService.unscheduleSubscriptionCancellation(subscriptionId);

    return res.json({
      subscriptionId: reactivatedSubscription.id,
      status: reactivatedSubscription.status,
      message: 'Subscription reactivated successfully',
    });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    return res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

/**
 * Update subscription payment method
 */
router.put('/subscriptions/:subscriptionId/payment-method', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { paymentMethodId } = req.body;
    const userId = req.user!.id;

    if (!paymentMethodId) {
      return res.status(400).json({ error: 'Payment method ID is required' });
    }

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const updatedSubscription = await StripeService.updateSubscriptionPaymentMethod(
      subscriptionId,
      paymentMethodId
    );

    return res.json({
      subscriptionId: updatedSubscription.id,
      message: 'Payment method updated successfully',
    });
  } catch (error) {
    console.error('Error updating payment method:', error);
    return res.status(500).json({ error: 'Failed to update payment method' });
  }
});

/**
 * Change subscription plan
 */
router.put('/subscriptions/:subscriptionId/plan', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { newPriceId, prorationBehavior = 'create_prorations' } = req.body;
    const userId = req.user!.id;

    if (!newPriceId) {
      return res.status(400).json({ error: 'New price ID is required' });
    }

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const updatedSubscription = await StripeService.changeSubscriptionPlan(
      subscriptionId,
      newPriceId,
      prorationBehavior
    );

    return res.json({
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
      message: 'Subscription plan updated successfully',
    });
  } catch (error) {
    console.error('Error changing subscription plan:', error);
    return res.status(500).json({ error: 'Failed to change subscription plan' });
  }
});

/**
 * Get subscription billing history
 */
router.get('/subscriptions/:subscriptionId/invoices', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const invoices = await StripeService.getSubscriptionInvoices(subscriptionId);

    return res.json({
      invoices: invoices.map(invoice => ({
        id: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        created: invoice.created,
        paidAt: invoice.status_transitions?.paid_at,
        invoiceUrl: invoice.hosted_invoice_url,
      })),
    });
  } catch (error) {
    console.error('Error fetching billing history:', error);
    return res.status(500).json({ error: 'Failed to fetch billing history' });
  }
});

/**
 * Get upcoming invoice preview for plan changes
 */
router.get('/subscriptions/:subscriptionId/upcoming-invoice', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { newPriceId } = req.query;
    const userId = req.user!.id;

    // Verify user owns this subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscriptionId,
        userId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Get customer for the subscription
    const customer = await StripeService.getOrCreateCustomer(userId);

    const upcomingInvoice = await StripeService.getUpcomingInvoice(
      customer.id,
      subscriptionId,
      newPriceId as string
    );

    return res.json({
      amount: upcomingInvoice.amount_due,
      currency: upcomingInvoice.currency,
      periodStart: upcomingInvoice.period_start,
      periodEnd: upcomingInvoice.period_end,
      lines: upcomingInvoice.lines.data.map((line: any) => ({
        description: line.description,
        amount: line.amount,
        period: {
          start: line.period?.start,
          end: line.period?.end,
        },
      })),
    });
  } catch (error) {
    console.error('Error fetching upcoming invoice:', error);
    return res.status(500).json({ error: 'Failed to fetch upcoming invoice' });
  }
});

export default router;
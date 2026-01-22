import express from 'express';
import Stripe from 'stripe';
import { stripe, StripeService } from '../lib/stripeService';
import prisma from '../lib/prisma';

const router = express.Router();

// Middleware to parse raw body for webhook signature verification
router.use('/stripe', express.raw({ type: 'application/json' }));

/**
 * Handle Stripe webhooks
 */
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.upcoming':
        await handleUpcomingInvoice(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.paused':
        await handleSubscriptionPaused(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.resumed':
        await handleSubscriptionResumed(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  console.log('Subscription created:', subscription.id);
  const subscription_data = subscription as any;

  await StripeService.updateSubscriptionStatus(
    subscription.id,
    subscription.status,
    subscription_data.current_period_start,
    subscription_data.current_period_end
  );

  // If subscription is active, grant community access
  if (subscription.status === 'active') {
    await grantCommunityAccess(subscription);
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  console.log('Subscription updated:', subscription.id);
  const subscription_data = subscription as any;

  await StripeService.updateSubscriptionStatus(
    subscription.id,
    subscription.status,
    subscription_data.current_period_start,
    subscription_data.current_period_end
  );

  // Handle status changes
  if (subscription.status === 'active') {
    await grantCommunityAccess(subscription);
  } else if (['canceled', 'unpaid', 'past_due'].includes(subscription.status)) {
    await revokeCommunityAccess(subscription);
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  console.log('Subscription deleted:', subscription.id);

  await StripeService.updateSubscriptionStatus(subscription.id, 'canceled');
  await revokeCommunityAccess(subscription);
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  console.log('Payment succeeded for invoice:', invoice.id);
  const invoice_data = invoice as any;

  if (invoice_data.subscription && typeof invoice_data.subscription === 'string') {
    // Update subscription status to active if it was past_due
    const subscription = await stripe.subscriptions.retrieve(invoice_data.subscription);
    const subscription_data = subscription as any;
    
    await StripeService.updateSubscriptionStatus(
      subscription.id,
      subscription.status,
      subscription_data.current_period_start,
      subscription_data.current_period_end
    );

    // Grant access if payment succeeded
    if (subscription.status === 'active') {
      await grantCommunityAccess(subscription);
    }
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log('Payment failed for invoice:', invoice.id);
  const invoice_data = invoice as any;

  if (invoice_data.subscription && typeof invoice_data.subscription === 'string') {
    await StripeService.handleFailedPayment(invoice_data.subscription);
    
    // Optionally revoke access immediately or give grace period
    const subscription = await stripe.subscriptions.retrieve(invoice_data.subscription);
    if (subscription.status === 'unpaid') {
      await revokeCommunityAccess(subscription);
    }
  }
}

/**
 * Handle trial ending soon
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  console.log('Trial will end for subscription:', subscription.id);
  
  // Here you could send a notification to the user about trial ending
  // This would integrate with the notification system when implemented
}

/**
 * Handle upcoming invoice (renewal reminder)
 */
async function handleUpcomingInvoice(invoice: Stripe.Invoice): Promise<void> {
  const invoice_data = invoice as any;
  console.log('Upcoming invoice for subscription:', invoice_data.subscription);
  
  // Here you could send a notification to the user about upcoming renewal
  // This would integrate with the notification system when implemented
}

/**
 * Handle subscription paused
 */
async function handleSubscriptionPaused(subscription: Stripe.Subscription): Promise<void> {
  console.log('Subscription paused:', subscription.id);
  
  await StripeService.updateSubscriptionStatus(subscription.id, 'paused');
  
  // Suspend community access
  await revokeCommunityAccess(subscription);
}

/**
 * Handle subscription resumed
 */
async function handleSubscriptionResumed(subscription: Stripe.Subscription): Promise<void> {
  console.log('Subscription resumed:', subscription.id);
  const subscription_data = subscription as any;
  
  await StripeService.updateSubscriptionStatus(
    subscription.id,
    subscription.status,
    subscription_data.current_period_start,
    subscription_data.current_period_end
  );
  
  // Restore community access if subscription is active
  if (subscription.status === 'active') {
    await grantCommunityAccess(subscription);
  }
}

/**
 * Grant community access to user
 */
async function grantCommunityAccess(subscription: Stripe.Subscription): Promise<void> {
  const dbSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!dbSubscription) {
    console.error('Database subscription not found for Stripe subscription:', subscription.id);
    return;
  }

  // Check if membership already exists
  const existingMembership = await prisma.communityMembership.findFirst({
    where: {
      userId: dbSubscription.userId,
      communityId: dbSubscription.communityId,
    },
  });

  if (existingMembership) {
    // Update existing membership to active
    await prisma.communityMembership.update({
      where: { id: existingMembership.id },
      data: { status: 'active' },
    });
  } else {
    // Create new membership
    await prisma.communityMembership.create({
      data: {
        userId: dbSubscription.userId,
        communityId: dbSubscription.communityId,
        role: 'member',
        status: 'active',
      },
    });

    // Update community member count
    await prisma.community.update({
      where: { id: dbSubscription.communityId },
      data: { memberCount: { increment: 1 } },
    });
  }
}

/**
 * Revoke community access from user
 */
async function revokeCommunityAccess(subscription: Stripe.Subscription): Promise<void> {
  const dbSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!dbSubscription) {
    console.error('Database subscription not found for Stripe subscription:', subscription.id);
    return;
  }

  // Update membership status to suspended
  const membership = await prisma.communityMembership.findFirst({
    where: {
      userId: dbSubscription.userId,
      communityId: dbSubscription.communityId,
    },
  });

  if (membership && membership.status === 'active') {
    await prisma.communityMembership.update({
      where: { id: membership.id },
      data: { status: 'suspended' },
    });

    // Update community member count
    await prisma.community.update({
      where: { id: dbSubscription.communityId },
      data: { memberCount: { decrement: 1 } },
    });
  }
}

export default router;
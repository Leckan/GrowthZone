import Stripe from 'stripe';
import prisma from './prisma';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
});

export interface CreateSubscriptionParams {
  userId: string;
  communityId: string;
  priceId: string;
  paymentMethodId?: string;
}

export interface CreateCustomerParams {
  userId: string;
  email: string;
  name?: string;
}

export class StripeService {
  /**
   * Create a Stripe customer for a user
   */
  static async createCustomer({ userId, email, name }: CreateCustomerParams): Promise<Stripe.Customer> {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId,
      },
    });

    return customer;
  }

  /**
   * Get or create a Stripe customer for a user
   */
  static async getOrCreateCustomer(userId: string): Promise<Stripe.Customer> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if customer already exists in Stripe
    const existingCustomers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Create new customer
    return this.createCustomer({
      userId,
      email: user.email,
      name: user.displayName || user.username,
    });
  }

  /**
   * Create a subscription for a community
   */
  static async createSubscription({
    userId,
    communityId,
    priceId,
    paymentMethodId,
  }: CreateSubscriptionParams): Promise<{
    subscription: Stripe.Subscription;
    clientSecret?: string;
  }> {
    const customer = await this.getOrCreateCustomer(userId);

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId,
        communityId,
      },
    };

    if (paymentMethodId) {
      subscriptionParams.default_payment_method = paymentMethodId;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);
    const subscription_data = subscription as any;

    // Save subscription to database
    await prisma.subscription.create({
      data: {
        userId,
        communityId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription_data.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription_data.current_period_end * 1000),
      },
    });

    const result: { subscription: Stripe.Subscription; clientSecret?: string } = {
      subscription,
    };

    // Extract client secret for payment confirmation if needed
    if (subscription.latest_invoice && typeof subscription.latest_invoice === 'object') {
      const invoice_data = subscription.latest_invoice as any;
      const paymentIntent = invoice_data.payment_intent;
      if (paymentIntent && typeof paymentIntent === 'object') {
        const payment_data = paymentIntent as any;
        result.clientSecret = payment_data.client_secret || undefined;
      }
    }

    return result;
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);

    // Update subscription status in database
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: subscription.status },
    });

    return subscription;
  }

  /**
   * Update subscription status from webhook
   */
  static async updateSubscriptionStatus(
    subscriptionId: string,
    status: string,
    currentPeriodStart?: number,
    currentPeriodEnd?: number
  ): Promise<void> {
    const updateData: any = { status };

    if (currentPeriodStart) {
      updateData.currentPeriodStart = new Date(currentPeriodStart * 1000);
    }

    if (currentPeriodEnd) {
      updateData.currentPeriodEnd = new Date(currentPeriodEnd * 1000);
    }

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: updateData,
    });
  }

  /**
   * Create a payment method setup intent
   */
  static async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    return stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  /**
   * Get customer's payment methods
   */
  static async getPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return paymentMethods.data;
  }

  /**
   * Detach a payment method
   */
  static async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return stripe.paymentMethods.detach(paymentMethodId);
  }

  /**
   * Create a price for a community
   */
  static async createPrice(
    amount: number,
    currency: string = 'usd',
    interval: 'month' | 'year' = 'month',
    productName: string
  ): Promise<Stripe.Price> {
    // First create a product
    const product = await stripe.products.create({
      name: productName,
    });

    // Then create a price for the product
    return stripe.prices.create({
      unit_amount: Math.round(amount * 100), // Convert to cents
      currency,
      recurring: { interval },
      product: product.id,
    });
  }

  /**
   * Get subscription by ID
   */
  static async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return stripe.subscriptions.retrieve(subscriptionId);
  }

  /**
   * Handle failed payment
   */
  static async handleFailedPayment(subscriptionId: string): Promise<void> {
    // Update subscription status to past_due
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: 'past_due' },
    });

    // Here you could also send notification to user about failed payment
    // This would integrate with the notification system when implemented
  }

  /**
   * Retry failed payment
   */
  static async retryFailedPayment(subscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    if (subscription.latest_invoice && typeof subscription.latest_invoice === 'string') {
      await stripe.invoices.pay(subscription.latest_invoice);
    }

    return stripe.subscriptions.retrieve(subscriptionId);
  }

  /**
   * Pause a subscription (useful for temporary holds)
   */
  static async pauseSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: {
        behavior: 'keep_as_draft',
      },
    });

    // Update subscription status in database
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: 'paused' },
    });

    return subscription;
  }

  /**
   * Resume a paused subscription
   */
  static async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: null,
    });

    // Update subscription status in database
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: subscription.status },
    });

    return subscription;
  }

  /**
   * Update subscription payment method
   */
  static async updateSubscriptionPaymentMethod(
    subscriptionId: string,
    paymentMethodId: string
  ): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      default_payment_method: paymentMethodId,
    });

    return subscription;
  }

  /**
   * Schedule subscription cancellation at period end
   */
  static async scheduleSubscriptionCancellation(subscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Update subscription status in database to indicate scheduled cancellation
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: 'cancel_at_period_end' },
    });

    return subscription;
  }

  /**
   * Unschedule subscription cancellation (reactivate)
   */
  static async unscheduleSubscriptionCancellation(subscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    // Update subscription status in database
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: subscription.status },
    });

    return subscription;
  }

  /**
   * Get subscription billing history
   */
  static async getSubscriptionInvoices(subscriptionId: string): Promise<Stripe.Invoice[]> {
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100,
    });

    return invoices.data;
  }

  /**
   * Handle subscription renewal
   */
  static async handleSubscriptionRenewal(subscriptionId: string): Promise<void> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscription_data = subscription as any;

    // Update subscription period in database
    await StripeService.updateSubscriptionStatus(
      subscriptionId,
      subscription.status,
      subscription_data.current_period_start,
      subscription_data.current_period_end
    );

    // Grant continued access if subscription is active
    if (subscription.status === 'active') {
      const dbSubscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (dbSubscription) {
        // Ensure membership is active
        await prisma.communityMembership.updateMany({
          where: {
            userId: dbSubscription.userId,
            communityId: dbSubscription.communityId,
          },
          data: { status: 'active' },
        });
      }
    }
  }

  /**
   * Handle subscription downgrade/upgrade
   */
  static async changeSubscriptionPlan(
    subscriptionId: string,
    newPriceId: string,
    prorationBehavior: 'create_prorations' | 'none' = 'create_prorations'
  ): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: prorationBehavior,
    });

    return updatedSubscription;
  }

  /**
   * Get upcoming invoice for subscription changes
   */
  static async getUpcomingInvoice(
    customerId: string,
    subscriptionId?: string,
    newPriceId?: string
  ): Promise<any> {
    try {
      const params: any = {
        customer: customerId,
      };

      if (subscriptionId && newPriceId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        params.subscription = subscriptionId;
        params.subscription_items = [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ];
      }

      // Use the correct Stripe API method
      return (stripe.invoices as any).retrieveUpcoming(params);
    } catch (error) {
      console.error('Error retrieving upcoming invoice:', error);
      throw error;
    }
  }
}
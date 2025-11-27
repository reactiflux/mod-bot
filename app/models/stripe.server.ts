import Stripe from "stripe";

import { NotFoundError } from "#~/helpers/errors.js";
import { log, trackPerformance } from "#~/helpers/observability";
import Sentry from "#~/helpers/sentry.server";

// Initialize Stripe with API key from environment
const getStripe = () => {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is not set. Please configure Stripe credentials.",
    );
  }
  return new Stripe(apiKey, {
    apiVersion: "2025-10-29.clover",
    typescript: true,
  });
};

export const StripeService = {
  /**
   * Create a Stripe checkout session for subscription
   */
  async createCheckoutSession(
    variant: string,
    coupon: string,
    guildId: string,
    baseUrl: string,
    customerEmail?: string,
  ): Promise<string> {
    return trackPerformance(
      "createCheckoutSession",
      async () => {
        log("info", "Stripe", "Creating checkout session", {
          guildId,
          baseUrl,
          hasEmail: !!customerEmail,
          variant,
          coupon,
        });

        const stripe = getStripe();

        const successUrl = `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&guild_id=${guildId}`;
        const settingsUrl = `${baseUrl}/app/${guildId}/settings`;
        let priceId = "";
        try {
          const prices = await stripe.prices.list({ lookup_keys: [variant] });
          const price = prices.data.at(0);
          if (!price) {
            throw new NotFoundError(
              "price",
              "failed to find a price while upgrading",
            );
          }
          priceId = price.id;
        } catch (e) {
          log("error", "Stripe", "Failed to load pricing data");
          throw e;
        }

        try {
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            discounts: coupon ? [{ coupon }] : [],
            success_url: successUrl,
            cancel_url: settingsUrl,
            client_reference_id: guildId,
            customer_email: customerEmail,
            metadata: { guild_id: guildId },
            subscription_data: { metadata: { guild_id: guildId } },
          });

          log("info", "Stripe", "Checkout session created successfully", {
            guildId,
            sessionId: session.id,
          });

          return session.url ?? "";
        } catch (error) {
          log("error", "Stripe", "Failed to create checkout session", {
            guildId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.captureException(error);
          throw error;
        }
      },
      { guildId, customerEmail },
    );
  },

  /**
   * Verify a Stripe checkout session
   */
  async verifyCheckoutSession(sessionId: string): Promise<{
    payment_status: string;
    client_reference_id: string | null;
    customer: string | null;
    subscription: string | null;
    amount_total: number | null;
  } | null> {
    return trackPerformance(
      "verifyCheckoutSession",
      async () => {
        log("info", "Stripe", "Verifying checkout session", { sessionId });

        const stripe = getStripe();

        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);

          log("info", "Stripe", "Checkout session retrieved", {
            sessionId,
            paymentStatus: session.payment_status,
            customerId: session.customer,
          });

          return {
            payment_status: session.payment_status,
            client_reference_id: session.client_reference_id,
            customer:
              typeof session.customer === "string" ? session.customer : null,
            subscription:
              typeof session.subscription === "string"
                ? session.subscription
                : null,
            amount_total: session.amount_total,
          };
        } catch (error) {
          log("error", "Stripe", "Failed to verify checkout session", {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.captureException(error);
          return null;
        }
      },
      { sessionId },
    );
  },

  /**
   * Create a Stripe customer
   */
  async createCustomer(
    email: string,
    guildId: string,
    guildName?: string,
  ): Promise<string> {
    return trackPerformance(
      "createCustomer",
      async () => {
        log("info", "Stripe", "Creating Stripe customer", {
          guildId,
          email,
        });

        const stripe = getStripe();

        try {
          const customer = await stripe.customers.create({
            email,
            metadata: {
              guild_id: guildId,
              guild_name: guildName ?? "",
            },
          });

          log("info", "Stripe", "Customer created successfully", {
            guildId,
            customerId: customer.id,
          });

          return customer.id;
        } catch (error) {
          log("error", "Stripe", "Failed to create customer", {
            guildId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.captureException(error);
          throw error;
        }
      },
      { guildId },
    );
  },

  /**
   * Get customer by guild ID
   */
  async getCustomerByGuildId(guildId: string): Promise<string | null> {
    return trackPerformance(
      "getCustomerByGuildId",
      async () => {
        log("debug", "Stripe", "Searching for customer by guild ID", {
          guildId,
        });

        const stripe = getStripe();

        try {
          const customers = await stripe.customers.search({
            query: `metadata['guild_id']:'${guildId}'`,
            limit: 1,
          });

          if (customers.data.length > 0) {
            log("debug", "Stripe", "Customer found", {
              guildId,
              customerId: customers.data[0].id,
            });
            return customers.data[0].id;
          }

          log("debug", "Stripe", "No customer found", { guildId });
          return null;
        } catch (error) {
          log("error", "Stripe", "Failed to search for customer", {
            guildId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.captureException(error);
          return null;
        }
      },
      { guildId },
    );
  },

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    return trackPerformance(
      "cancelSubscription",
      async () => {
        log("info", "Stripe", "Cancelling subscription", { subscriptionId });

        const stripe = getStripe();

        try {
          await stripe.subscriptions.cancel(subscriptionId);

          log("info", "Stripe", "Subscription cancelled successfully", {
            subscriptionId,
          });

          return true;
        } catch (error) {
          log("error", "Stripe", "Failed to cancel subscription", {
            subscriptionId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.captureException(error);
          return false;
        }
      },
      { subscriptionId },
    );
  },

  /**
   * Construct webhook event from raw body and signature
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET environment variable is not set. Please configure webhook secret.",
      );
    }

    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  },
};

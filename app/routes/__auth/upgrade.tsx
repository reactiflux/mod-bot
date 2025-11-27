import type { PropsWithChildren } from "react";
import {
  data,
  Form,
  redirect,
  useLoaderData,
  useSearchParams,
} from "react-router";

import { log } from "#~/helpers/observability";
import { requireUser } from "#~/models/session.server";
import { StripeService } from "#~/models/stripe.server";
import {
  SubscriptionService,
  type PaidVariants,
  type ProductTier,
} from "#~/models/subscriptions.server";

import type { Route } from "./+types/upgrade";

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireUser(request);
  const guildId = params.guildId;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  const subscription = await SubscriptionService.getGuildSubscription(guildId);
  const currentTier = await SubscriptionService.getProductTier(guildId);

  return {
    guildId,
    subscription,
    currentTier,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();

  const intent = formData.get("intent") as string;
  const guildId = formData.get("guild_id") as string;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  // Handle cancellation
  if (intent === "cancel") {
    log("info", "Upgrade", "Processing subscription cancellation", {
      guildId,
      userId: user.id,
    });

    const subscription =
      await SubscriptionService.getGuildSubscription(guildId);

    if (!subscription?.stripe_subscription_id) {
      return {
        error: {
          message: "No active subscription found",
          code: "NO_SUBSCRIPTION",
        },
      };
    }

    const cancelled = await StripeService.cancelSubscription(
      subscription.stripe_subscription_id,
    );

    if (!cancelled) {
      return {
        error: {
          message: "Failed to cancel subscription, please contact support",
          code: "CANCEL_FAILED",
        },
      };
    }

    await SubscriptionService.updateSubscriptionStatus(guildId, "cancelled");

    log("info", "Upgrade", "Subscription cancelled successfully", {
      guildId,
      userId: user.id,
    });

    return { cancelled: true };
  }

  const tier = formData.get("tier") as ProductTier;
  const variant: PaidVariants = "standard_annual";
  const coupon = (formData.get("coupon")?.valueOf() as string) ?? "";

  if (tier === "custom") {
    // TODO: submit contact details
    // Discord webhook to private chat? :shrug:
  }

  if (tier === "paid") {
    log("info", "Upgrade", "Creating Stripe checkout session", {
      guildId,
      userId: user.id,
    });

    try {
      // Get base URL from request
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      // Create Stripe checkout session
      const checkoutUrl = await StripeService.createCheckoutSession(
        variant,
        coupon,
        guildId,
        baseUrl,
        user.email ?? undefined,
      );

      log("info", "Upgrade", "Redirecting to Stripe checkout", {
        guildId,
        userId: user.id,
      });

      // Redirect to Stripe checkout
      return redirect(checkoutUrl);
    } catch (error) {
      log("error", "Upgrade", "Failed to create checkout session", {
        guildId,
        userId: user.id,
        error,
      });

      // Check for Stripe configuration errors (missing/empty lookup key)
      const isStripeConfigError =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        "param" in error &&
        "rawType" in error &&
        "type" in error &&
        typeof error.type === "string" &&
        error.type.includes("Stripe");

      if (isStripeConfigError) {
        return {
          error: {
            message: `Payment is misconfigured, please contact support`,
            code: "CONFIG_ERROR",
            detail: {
              code: error.code,
              param: error.param,
              rawType: error.rawType,
              type: error.type,
            },
          },
        };
      }

      // Generic error
      return {
        error: {
          message: `Something went wrong, please contact support`,
          cause: error,
        },
      };
    }
  }
}

function Check() {
  return (
    <svg
      className="h-6 w-6 text-green-500"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Benefit({ children }: PropsWithChildren) {
  return (
    <li className="flex items-start">
      <div className="flex-shrink-0">
        <Check />
      </div>
      <p className="ml-1 text-sm">{children}</p>
    </li>
  );
}

export default function Upgrade({ actionData }: Route.ComponentProps) {
  const { guildId, currentTier } = useLoaderData<typeof loader>();
  const [search] = useSearchParams();
  const didPay = typeof search.get("success") === "string";

  return (
    <div className="text-gray-300 sm:w-full sm:max-w-3xl">
      {actionData?.error ? (
        <div className="my-4 space-y-2 rounded-md border-[1px] border-rose-800 bg-rose-400 bg-opacity-10 p-4">
          <p>{actionData.error.message}</p>
          <details className="text-sm text-gray-400">
            <summary>Technical details</summary>
            <pre className="text-xs">
              <code>{JSON.stringify(actionData.error.detail, null, 2)}</code>
            </pre>
          </details>
        </div>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-3xl font-extrabold text-gray-200">
            Switch to Paid
          </h2>
          <p className="mt-4 text-lg">{/* TODO: copy for upgrade page */}</p>

          {currentTier === "paid" ? (
            <div className="mt-6 space-y-4">
              <div className="w-full rounded-md border border-green-200 bg-green-100 px-4 py-3 text-center text-sm font-medium text-green-800">
                ✓ You have a paid plan
                {didPay ? ". Thank you for subscribing!" : ""}
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                  Cancel subscription
                </summary>
                <div className="mt-3 rounded-md border border-rose-800 bg-rose-900 bg-opacity-20 p-4">
                  <p className="mb-3 text-gray-300">
                    Are you sure you want to cancel? You'll lose access to paid
                    features at the end of your billing period.
                  </p>
                  <Form method="post">
                    <input type="hidden" name="guild_id" value={guildId} />
                    <input type="hidden" name="intent" value="cancel" />
                    <button
                      type="submit"
                      className="rounded-md bg-rose-700 bg-opacity-85 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
                    >
                      Yes, cancel my subscription
                    </button>
                  </Form>
                </div>
              </details>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="guild_id" value={guildId} />
              <input type="hidden" name="tier" value="paid" />
              <button
                type="submit"
                className="text-sh rounded-md border border-transparent bg-emerald-700 px-6 py-2 text-lg font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Switch to Paid
              </button>
            </Form>
          )}
          <p>
            <span className="text-4xl font-extrabold">$100</span>
            <span className="text-base font-medium text-gray-400">/yr</span>
          </p>
          <ul className="mt-6 space-y-2">
            <Benefit>Anonymous community reports</Benefit>
            <Benefit>Ticketing system</Benefit>
            <Benefit>Kick spammers automatically</Benefit>
            <Benefit>Moderator decision tools</Benefit>
          </ul>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-extrabold text-gray-200">
            Get a custom integration
          </h2>
          <p className="mt-4 text-lg">{/* TODO: copy for upgrade page */}</p>

          {currentTier === "custom" ? (
            <div className="mt-6">
              <div className="w-full rounded-md border border-green-200 bg-green-100 px-4 py-3 text-center text-sm font-medium text-green-800">
                ✓ You have this plan
              </div>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="guild_id" value={guildId} />
              <input type="hidden" name="tier" value="custom" />
              <button
                type="submit"
                className="shad rounded-md border border-transparent bg-teal-700 px-6 py-2 text-lg font-medium text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              >
                Contact Sales
              </button>
            </Form>
          )}

          <ul className="mt-6 space-y-2">
            <Benefit>All paid features</Benefit>
            <Benefit>Dedicated bot instance</Benefit>
            <Benefit>Stable bot version</Benefit>
            <Benefit>Support SLAs</Benefit>
          </ul>
        </div>
      </div>
    </div>
  );
}

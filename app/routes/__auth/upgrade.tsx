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

  const tier = formData.get("tier") as ProductTier;
  const variant: PaidVariants = "standard_annual";
  const coupon = (formData.get("coupon")?.valueOf() as string) ?? "";

  if (tier === "custom") {
    // TODO: submit contact details
    // Discord webhook to private chat? :shrug:
  }

  if (tier === "paid") {
    const guildId = formData.get("guild_id") as string;

    if (!guildId) {
      throw data({ message: "Guild ID is required" }, { status: 400 });
    }

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      log("error", "Upgrade", "Failed to create checkout session", {
        guildId,
        userId: user.id,
        error: errorMessage,
      });

      // Check for specific Stripe configuration errors
      if (
        errorMessage.includes("STRIPE_SECRET_KEY") ||
        errorMessage.includes("STRIPE_PRICE_ID")
      ) {
        return redirect(
          `/payment/error?guild_id=${guildId}&message=${encodeURIComponent(
            "Payment system is currently being configured. Please try again later or contact support.",
          )}`,
        );
      }

      // Generic error
      return redirect(
        `/payment/error?guild_id=${guildId}&message=${encodeURIComponent(
          "Failed to create checkout session. Please try again later.",
        )}`,
      );
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
      <p className="ml-1 text-sm text-gray-300">{children}</p>
    </li>
  );
}

export default function Upgrade() {
  const { guildId, currentTier } = useLoaderData<typeof loader>();
  const [search] = useSearchParams();
  const didPay = typeof search.get("success") === "string";

  return (
    <div className="sm:w-full sm:max-w-3xl">
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-200">
            Switch to Paid
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            TODO: copy for upgrade page
          </p>

          <p className="mb-4 mt-6">
            <span className="text-4xl font-extrabold text-gray-300">$100</span>
            <span className="text-base font-medium text-gray-500">/yr</span>
          </p>
          {currentTier === "paid" ? (
            <div className="mt-6">
              <div className="w-full rounded-md border border-green-200 bg-green-100 px-4 py-3 text-center text-sm font-medium text-green-800">
                ✓ You have a paid plan
                {didPay ? ". Thank you for subscribing!" : ""}
              </div>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="guild_id" value={guildId} />
              <input type="hidden" name="tier" value="paid" />
              <button
                type="submit"
                className="rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Switch to Paid
              </button>
            </Form>
          )}
          <ul className="mt-6 space-y-2">
            <Benefit>Anonymous community reports</Benefit>
            <Benefit>Ticketing system</Benefit>
            <Benefit>Kick spammers automatically</Benefit>
            <Benefit>Moderator decision tools</Benefit>
          </ul>
        </div>

        <div>
          <h2 className="text-3xl font-extrabold text-gray-200">
            Get a custom integration
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            TODO: copy for upgrade page
          </p>

          <p className="mb-4 mt-6">
            <span className="text-2xl font-bold text-gray-300">
              Contact Sales
            </span>
          </p>

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
                className="rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Discuss a custom integration
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

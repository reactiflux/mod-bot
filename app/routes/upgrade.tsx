import { data, Form, redirect, useLoaderData } from "react-router";

import { log } from "#~/helpers/observability";
import { requireUser } from "#~/models/session.server";
import { StripeService } from "#~/models/stripe.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

import type { Route } from "./+types/upgrade";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const guildId = url.searchParams.get("guild_id");

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
      error: error instanceof Error ? error.message : String(error),
    });

    throw data(
      {
        message: "Failed to create checkout session. Please try again later.",
      },
      { status: 500 },
    );
  }
}

export default function Upgrade() {
  const { guildId, currentTier } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-3xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Upgrade to Pro
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Unlock advanced features for your Discord server
          </p>
        </div>

        <div className="mt-12 space-y-8 sm:mt-16">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Current Plan */}
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Free Plan
                  {currentTier === "free" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Current
                    </span>
                  )}
                </h3>
                <p className="mt-4 text-sm text-gray-600">
                  Basic community management features
                </p>
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900">
                    $0
                  </span>
                  <span className="text-base font-medium text-gray-500">
                    /month
                  </span>
                </p>
              </div>
              <div className="px-6 pb-8 pt-6">
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Basic moderation tools
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Limited analytics
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Community support
                    </p>
                  </li>
                </ul>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="relative divide-y divide-gray-200 rounded-lg border-2 border-indigo-500 bg-white shadow-sm">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 transform">
                <span className="inline-flex rounded-full bg-indigo-500 px-4 py-1 text-sm font-semibold uppercase tracking-wide text-white">
                  Recommended
                </span>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Pro Plan
                  {currentTier === "paid" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Current
                    </span>
                  )}
                </h3>
                <p className="mt-4 text-sm text-gray-600">
                  Advanced features for serious community builders
                </p>
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900">
                    $15
                  </span>
                  <span className="text-base font-medium text-gray-500">
                    /month
                  </span>
                </p>
              </div>
              <div className="px-6 pb-8 pt-6">
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Everything in Free
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Advanced analytics & insights
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Unlimited message tracking
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Premium moderation features
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Priority support
                    </p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
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
                    </div>
                    <p className="ml-3 text-sm text-gray-700">
                      Custom integrations
                    </p>
                  </li>
                </ul>

                {currentTier !== "paid" && (
                  <div className="mt-8">
                    <Form method="post">
                      <input type="hidden" name="guild_id" value={guildId} />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-transparent bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        Upgrade to Pro
                      </button>
                    </Form>
                  </div>
                )}

                {currentTier === "paid" && (
                  <div className="mt-8">
                    <div className="w-full rounded-md border border-green-200 bg-green-100 px-4 py-3 text-center text-sm font-medium text-green-800">
                      ✓ You have this plan
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Cancel anytime. No long-term contracts.
          </p>
        </div>
      </div>
    </div>
  );
}

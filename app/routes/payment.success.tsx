import { data, Link, useLoaderData } from "react-router";

import { requireUser } from "#~/models/session.server";
import { StripeService } from "#~/models/stripe.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

import type { Route } from "./+types/payment.success";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const guildId = url.searchParams.get("guild_id");

  if (!sessionId) {
    throw data({ message: "Missing session ID" }, { status: 400 });
  }

  if (!guildId) {
    throw data({ message: "Missing guild ID" }, { status: 400 });
  }

  // Verify Stripe session
  const stripeSession = await StripeService.verifyCheckoutSession(sessionId);

  if (stripeSession?.payment_status !== "paid") {
    throw data({ message: "Payment verification failed" }, { status: 400 });
  }

  // Update subscription to paid tier
  await SubscriptionService.createOrUpdateSubscription({
    guild_id: guildId,
    stripe_customer_id: `cus_${guildId}`, // TODO: Get from Stripe session
    product_tier: "paid",
    status: "active",
    current_period_end: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(), // 30 days from now
  });

  const subscription = await SubscriptionService.getGuildSubscription(guildId);

  return {
    user,
    guildId,
    sessionId,
    subscription,
  };
}

export default function PaymentSuccess() {
  const { guildId, sessionId } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Payment Successful!
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Your subscription has been upgraded to Pro
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="rounded-md border border-green-200 bg-green-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Subscription Activated
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>
                      Your server now has access to all Pro features including:
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      <li>Advanced analytics and insights</li>
                      <li>Unlimited message tracking</li>
                      <li>Premium moderation tools</li>
                      <li>Priority support</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p className="mb-2">
                <strong>Session ID:</strong> {sessionId}
              </p>
              <p>
                <strong>Guild ID:</strong> {guildId}
              </p>
            </div>

            <div className="flex space-x-3">
              <Link
                to={`/dashboard?guild_id=${guildId}`}
                className="flex-1 rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                View Dashboard
              </Link>
              <Link
                to="/"
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Done
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

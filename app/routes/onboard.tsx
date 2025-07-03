import type { Route } from "./+types/onboard";
import { data, useLoaderData } from "react-router";
import { requireUser } from "#~/models/session.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

export async function loader({ request }: Route.LoaderArgs) {
  const _user = await requireUser(request);
  const url = new URL(request.url);
  const guildId = url.searchParams.get("guild_id");

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  // Get subscription info for the guild
  const subscription = await SubscriptionService.getGuildSubscription(guildId);
  const tier = await SubscriptionService.getProductTier(guildId);

  return {
    guildId,
    subscription,
    tier,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const _user = await requireUser(request);
  const formData = await request.formData();
  const guildId = formData.get("guild_id") as string;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  // Here we would save the guild configuration
  // For now, just redirect to dashboard
  return data({ success: true });
}

export default function Onboard() {
  const { guildId, tier } = useLoaderData<typeof loader>();

  if (tier === "free") {
    // Show upgrade-focused onboarding for free users
    return (
      <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
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
            <h2 className="text-3xl font-extrabold text-gray-900">
              Euno is now active!
            </h2>
            <p className="mt-2 text-lg text-gray-600">
              Your Discord server is ready. Choose how you want to proceed:
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Pro Plan - Highlighted */}
            <div className="relative rounded-lg border-2 border-indigo-500 bg-white shadow-lg">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 transform">
                <span className="inline-flex rounded-full bg-indigo-500 px-4 py-1 text-sm font-semibold uppercase tracking-wide text-white">
                  Recommended
                </span>
              </div>
              <div className="p-6">
                <h3 className="text-center text-xl font-bold text-gray-900">
                  Start with Pro
                </h3>
                <p className="mt-2 text-center text-sm text-gray-600">
                  Get full access to all features immediately
                </p>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Advanced analytics & insights
                    </span>
                  </div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Unlimited message tracking
                    </span>
                  </div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Premium moderation tools
                    </span>
                  </div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Priority support
                    </span>
                  </div>
                </div>
                <div className="mt-6">
                  <a
                    href={`/upgrade?guild_id=${guildId}`}
                    className="block w-full rounded-md border border-transparent bg-indigo-600 px-4 py-3 text-center text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Upgrade to Pro - $15/month
                  </a>
                </div>
              </div>
            </div>

            {/* Free Plan */}
            <div className="rounded-lg border border-gray-200 bg-white shadow">
              <div className="p-6">
                <h3 className="text-center text-xl font-bold text-gray-900">
                  Continue with Free
                </h3>
                <p className="mt-2 text-center text-sm text-gray-600">
                  Start with basic features, upgrade anytime
                </p>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Basic moderation tools
                    </span>
                  </div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Limited analytics
                    </span>
                  </div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-gray-700">
                      Community support
                    </span>
                  </div>
                  <div className="h-6"></div>{" "}
                  {/* Spacer to align with Pro features */}
                </div>
                <div className="mt-6">
                  <a
                    href={`/dashboard?guild_id=${guildId}`}
                    className="block w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Continue with Free
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              You can upgrade or downgrade anytime from your dashboard
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pro user onboarding (existing flow simplified)
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
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
          <h2 className="text-3xl font-extrabold text-gray-900">
            Welcome to Euno Pro!
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Your Discord server is set up with Pro features
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
                    Pro Features Activated
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>
                      You now have access to all premium features including
                      advanced analytics, unlimited tracking, and priority
                      support.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <a
                href={`/dashboard?guild_id=${guildId}`}
                className="flex-1 rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Explore Pro Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

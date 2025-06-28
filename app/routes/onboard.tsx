import type { Route } from "./+types/onboard";
import { data, useLoaderData, Form } from "react-router";
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Welcome to Euno!
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Let&apos;s set up your Discord server
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Bot Successfully Added!
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Euno has been added to your Discord server and is ready to use.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Current Plan: {tier === "free" ? "Free" : "Pro"}
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>Your server is on the {tier} plan.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-900">
                What&apos;s next?
              </h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                  Bot permissions configured automatically
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                  Free subscription initialized
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                  Configure moderation settings (optional)
                </li>
              </ul>
            </div>

            {tier === "free" && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-indigo-800">
                      🚀 Want More Features?
                    </h3>
                    <div className="mt-2 text-sm text-indigo-700">
                      <p>
                        Upgrade to Pro for advanced analytics, unlimited
                        tracking, and premium features.
                      </p>
                    </div>
                    <div className="mt-3">
                      <a
                        href={`/upgrade?guild_id=${guildId}`}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Upgrade to Pro
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Form method="post" className="space-y-4">
              <input type="hidden" name="guild_id" value={guildId} />

              <div className="flex space-x-3">
                <a
                  href={`/dashboard?guild_id=${guildId}`}
                  className="flex-1 bg-indigo-600 text-white py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-center"
                >
                  View Dashboard
                </a>
                <a
                  href="/"
                  className="flex-1 bg-white text-gray-700 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-center"
                >
                  Done
                </a>
              </div>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

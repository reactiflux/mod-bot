import type { Route } from "./+types/payment.success";
import { data, useLoaderData, Link } from "react-router";
import { requireUser } from "#~/models/session.server";
import { CreditsService } from "#~/models/credits.server";
import { StripeService } from "#~/models/stripe.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    throw data({ message: "Missing session ID" }, { status: 400 });
  }

  // Verify Stripe session
  const stripeSession = await StripeService.verifyCheckoutSession(sessionId);

  if (!stripeSession || stripeSession.payment_status !== "paid") {
    throw data({ message: "Payment verification failed" }, { status: 400 });
  }

  // Check if credits were already awarded for this session
  const existingCredits =
    await CreditsService.getCreditsByStripeSession(sessionId);

  if (!existingCredits) {
    // Award credits based on amount paid (e.g., $1 = 100 credits)
    const creditsAmount = Math.floor(stripeSession.amount_total / 100); // Convert cents to credits

    await CreditsService.addCredits({
      userId: user.id,
      amount: creditsAmount,
      description: `Payment received via Stripe`,
      stripeSessionId: sessionId,
    });
  }

  const creditsBalance = await CreditsService.getUserCreditsBalance(user.id);

  return {
    user,
    sessionId,
    creditsBalance,
    creditsAmount:
      existingCredits?.amount ?? Math.floor(stripeSession.amount_total / 100),
  };
}

export default function PaymentSuccess() {
  const { sessionId, creditsBalance, creditsAmount } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
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
            {creditsAmount} credits have been added to your account
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Credits Added Successfully
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>
                      <strong>+{creditsAmount} credits</strong> have been added
                      to your account.
                    </p>
                    <p className="mt-1">
                      Your current balance:{" "}
                      <strong>{creditsBalance} credits</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p className="mb-2">
                <strong>Session ID:</strong> {sessionId}
              </p>
            </div>

            <div className="flex space-x-3">
              <Link
                to="/dashboard"
                className="flex-1 bg-indigo-600 text-white py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-center"
              >
                View Dashboard
              </Link>
              <Link
                to="/"
                className="flex-1 bg-white text-gray-700 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-center"
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

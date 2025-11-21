import { Link, useSearchParams } from "react-router";

export default function PaymentError() {
  const [searchParams] = useSearchParams();
  const message =
    searchParams.get("message") ??
    "An error occurred during payment processing.";
  const guildId = searchParams.get("guild_id");

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Payment Error
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            We encountered an issue processing your payment
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{message}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p className="mb-4">This could be due to:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Payment system temporarily unavailable</li>
                <li>Invalid payment information</li>
                <li>Network connectivity issues</li>
                <li>Configuration issues (contact support)</li>
              </ul>
            </div>

            <div className="space-y-3">
              {guildId && (
                <Link
                  to={`/upgrade?guild_id=${guildId}`}
                  className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Try Again
                </Link>
              )}
              <Link
                to="/"
                className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Back to Home
              </Link>
              <div className="text-center">
                <a
                  href="mailto:support@euno.reactiflux.com"
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Contact Support
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

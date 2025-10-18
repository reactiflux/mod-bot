// import type { Route } from "../+types/index";

// export const loader = async ({ request }: Route.LoaderArgs) => {
// };

export default function Index() {
  // Authenticated users are redirected in loader, so this only shows for guests
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="relative pb-16 pt-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-gray-800 shadow-xl">
            <div className="lg:pb-18 relative w-full max-w-xl px-6 pb-14 pt-24 lg:px-8 lg:pt-24">
              <h1 className="mb-10 text-center text-9xl font-extrabold tracking-tight">
                <span className="block uppercase text-indigo-600 drop-shadow-md">
                  Euno
                </span>
              </h1>
              <h3 className="">
                A community-in-a-box bot for large Discord servers with advanced
                analytics and moderation tools
              </h3>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

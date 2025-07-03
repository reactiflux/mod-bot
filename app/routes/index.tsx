// import { REST } from "@discordjs/rest";

import type { Route } from "./+types/index";
import { redirect } from "react-router";

import { getOptionalUser } from "#~/utils";

import { Login } from "#~/basics/login";

const EmojiBackdrop = () => {
  return (
    <div
      className="absolute inset-0 origin-center rotate-12"
      style={{
        width: "300%",
        height: "300%",
        top: "-100%",
        left: "-100%",
      }}
    >
      <div
        className="animate-slide h-full w-full bg-yellow-500 bg-opacity-50"
        style={{
          backgroundBlendMode: "color",
          backgroundSize: "300px 150px",
          backgroundRepeat: "repeat",
          backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><text x="0" y="45" font-size="50">🧑‍⚖️⚖️📜👀</text><text x="0" y="93" font-size="50">📜🧑‍⚖️👀⚖️</text></svg>')`,
        }}
      />
      <style>{`
        @keyframes slide {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-300px);
          }
        }
        .animate-slide {
          animation: slide 20s linear infinite;
        }
      `}</style>
    </div>
  );
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  // If user is logged in, redirect to guilds page
  const user = await getOptionalUser(request);
  if (user) {
    throw redirect("/guilds");
  }

  return null;
};

export default function Index() {
  // Authenticated users are redirected in loader, so this only shows for guests
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white">
      <EmojiBackdrop />
      <div className="relative pb-16 pt-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="lg:pb-18 relative w-full max-w-xl px-6 pb-14 pt-24 lg:px-8 lg:pt-24">
              <h1 className="mb-10 text-center text-9xl font-extrabold tracking-tight">
                <span className="block uppercase text-yellow-500 drop-shadow-md">
                  Euno
                </span>
              </h1>
              <p className="mb-8 text-slate-800">
                A community-in-a-box bot for large Discord servers with advanced
                analytics and moderation tools
              </p>
              <div className="space-y-4">
                <a
                  href="/auth?flow=signup"
                  className="block w-full rounded bg-indigo-600 px-4 py-3 text-center font-medium text-white hover:bg-indigo-700 focus:bg-indigo-500"
                >
                  🚀 Add to Discord Server
                </a>
                <Login>Already have an account? Log in</Login>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

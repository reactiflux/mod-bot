import type { PropsWithChildren } from "react";

// import { REST } from "@discordjs/rest";

import type { Route } from "./+types/index";

// import { retrieveDiscordToken } from "#~/models/session.server.js";
// import { discordToken } from "#~/helpers/env.server.js";
import { ServerOverview } from "#~/features/ServerOverview";
import { useOptionalUser } from "#~/utils";

import { Login } from "#~/basics/login";
import { Logout } from "#~/basics/logout.js";

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

// const botDiscord = new REST().setToken(discordToken);
// const userDiscord = new REST({ authPrefix: "Bearer" });

// export const loader = async ({ request }: Route.LoaderArgs) => {
//   let token;
//   try {
//     token = await retrieveDiscordToken(request);
//   } catch (e) {
//     console.error(e);
//     return;
//   }

//   userDiscord.setToken(token.token.access_token as string);

//   return {
//     guilds: await fetchGuilds(userDiscord, botDiscord),
//   };
// };

interface LayoutProps extends PropsWithChildren {
  guilds: Exclude<Route.ComponentProps["loaderData"], undefined>["guilds"];
}

const Layout = ({ /* guilds, */ children }: LayoutProps) => {
  return (
    <>
      <nav className="flex justify-end">
        <div></div>
        <div>
          <Logout />
        </div>
      </nav>
      <main className="">{children}</main>
      <footer></footer>
    </>
  );
};

export default function Index({ loaderData }: Route.ComponentProps) {
  const user = useOptionalUser();

  if (!user || !loaderData) {
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
                <p className="text-slate-800">
                  A community-in-a-box bot for large Discord servers
                </p>
                <Login>Log in</Login>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const { guilds } = loaderData;
  return (
    <Layout guilds={guilds}>
      <ServerOverview />
    </Layout>
  );
}

import { Login } from "#~/components/login";
import { Logout } from "#~/components/logout";

import { useOptionalUser } from "#~/utils";

export default function Index() {
  const user = useOptionalUser();
  return (
    <main className="relative min-h-screen bg-white sm:flex sm:items-center sm:justify-center">
      <div className="relative sm:pb-16 sm:pt-8">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="relative shadow-xl sm:overflow-hidden sm:rounded-2xl">
            <div className="absolute inset-0">
              <img
                className="h-full w-full object-cover"
                src="https://user-images.githubusercontent.com/1500684/157774694-99820c51-8165-4908-a031-34fc371ac0d6.jpg"
                alt="Sonic Youth On Stage"
              />
              <div className="absolute inset-0 bg-[color:rgba(254,204,27,0.5)] mix-blend-multiply" />
            </div>

            <div className="lg:pb-18 relative w-full max-w-xl px-4 pb-8 pt-16 sm:px-6 sm:pb-14 sm:pt-24 lg:px-8 lg:pt-32">
              <h1 className="text-center text-6xl font-extrabold tracking-tight sm:text-8xl lg:text-9xl">
                <span className="block uppercase text-yellow-500 drop-shadow-md">
                  Euno
                </span>
              </h1>
              <div className="mx-auto mt-10 max-w-sm sm:flex sm:max-w-none sm:justify-center">
                {user ? (
                  <Logout />
                ) : (
                  <div className="space-y-4 sm:mx-auto sm:inline-grid sm:grid-cols-2 sm:gap-5 sm:space-y-0">
                    <Login>Log in</Login>
                  </div>
                )}
              </div>
              <p className="mx-auto mt-6 max-w-md text-center text-xl text-white">
                This is a development placeholder for Euno, a Discord moderation
                bot.
              </p>
              <p className="mx-auto mt-6 max-w-md text-center text-xl text-white drop-shadow-md">
                Coming soon:
                <ul>
                  <li>ticketing??</li>
                  <li>activity reports</li>
                  <li>other fun things</li>
                </ul>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

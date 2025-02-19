import { Login } from "#~/basics/login";
import { ServerOverview } from "#~/features/ServerOverview";

import { useOptionalUser } from "#~/utils";

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
        className="w-full h-full animate-slide bg-yellow-500 bg-opacity-50"
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

export default function Index() {
  const user = useOptionalUser();

  if (!user) {
    return (
      <main className="relative min-h-screen bg-white flex items-center justify-center overflow-hidden">
        <EmojiBackdrop />
        <div className="relative pb-16 pt-8">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="relative shadow-xl overflow-hidden rounded-2xl bg-white">
              <div className="lg:pb-18 relative w-full max-w-xl px-6 pb-14 pt-24 lg:px-8 lg:pt-24">
                <h1 className="text-center text-9xl font-extrabold tracking-tight mb-10">
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
  return <ServerOverview />;
}

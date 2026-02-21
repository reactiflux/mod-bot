export default function Index() {
  return (
    <main className="flex min-h-full items-center justify-center">
      <div className="text-center">
        <h1 className="font-serif text-4xl font-bold text-stone-100">
          Welcome to Euno
        </h1>
        <div className="mx-auto my-4 h-0.5 w-32 bg-amber-500" />
        <p className="text-lg text-stone-400">
          Select a server from the sidebar,
          <br />
          or add Euno to a new server.
        </p>
      </div>
    </main>
  );
}

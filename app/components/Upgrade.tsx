export function Upgrade({ guildId }: { guildId: string }) {
  return (
    <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-center">
      <h3 className="text-sm font-medium text-yellow-800">
        Want more features?
      </h3>
      <div className="mt-2 text-sm text-yellow-700">
        <p>
          Upgrade to Pro for advanced analytics, unlimited tracking, and
          priority support.
        </p>
        <div className="mt-3">
          <a
            href={`/upgrade?guild_id=${guildId}`}
            className="inline-flex items-center rounded-md border border-transparent bg-yellow-600 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    </div>
  );
}

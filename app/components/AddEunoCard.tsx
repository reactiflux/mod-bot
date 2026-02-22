import { botInviteUrl } from "#~/helpers/botPermissions";

interface AddEunoCardProps {
  id: string;
  name: string;
  icon: string | null;
}

export function AddEunoCard({ id, name, icon }: AddEunoCardProps) {
  return (
    <div className="flex items-center gap-3">
      {icon ? (
        <img
          src={`https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64`}
          alt={name}
          className="h-8 w-8 rounded-lg grayscale-[50%]"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-700 text-sm text-stone-400">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-stone-400">
        {name}
      </span>
      <a
        href={botInviteUrl({ guildId: id })}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-md px-3 py-1 text-xs text-stone-500 transition-colors hover:text-amber-400"
      >
        Add Euno
      </a>
    </div>
  );
}

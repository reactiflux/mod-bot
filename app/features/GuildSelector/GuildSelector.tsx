import { Button } from "#~/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#~/components/ui/dropdown-menu";
import type { Guild } from "#~/models/discord.server.js";

interface Props {
  guilds: Guild[];
  onSelect: (guild: Guild) => void;
  selectedId: Guild["id"];
}

// export const GuildSelector = () => <div />;
export const GuildSelector = ({ guilds, onSelect, selectedId }: Props) => {
  const selected = guilds.find((g) => g.id === selectedId);
  console.log({ guilds });

  return (
    <>
      buggs
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Select server…</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            {guilds.map((g) => (
              <DropdownMenuItem key={g.id}>{g.name}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

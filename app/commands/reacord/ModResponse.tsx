import type { AnyThreadChannel } from "discord.js";
import { Button } from "reacord";

import type { Resolution } from "~/helpers/modResponse";
import { resolutions, useVotes } from "~/helpers/modResponse";

const VOTES_TO_APPROVE = 3;

export const ModResponse = ({
  votesRequired = VOTES_TO_APPROVE,
  onResolve,
  modRoleId,
}: {
  votesRequired?: number;
  onResolve: (result: Resolution) => Promise<void>;
  modRoleId: string;
}) => {
  const { votes, recordVote } = useVotes();

  const renderButton = (
    votes: Record<Resolution, string[]>,
    resolution: Resolution,
    label: string,
    style: "secondary" | "primary" | "success" | "danger" = "secondary",
  ) => (
    <Button
      label={label}
      style={style}
      onClick={async (event) => {
        if (!event.guild?.member.roles?.includes(modRoleId)) {
          return;
        }

        const { leader, voteCount } = recordVote(
          votes,
          resolution,
          event.user.id,
        );

        if (leader && voteCount >= votesRequired) {
          await onResolve(leader);
        }
      }}
    />
  );

  return (
    <>
      {`After ${votesRequired} or more votes, the leading resolution will be automatically enforced.
${Object.entries(votes)
  .map(
    ([resolution, voterIds]) =>
      `${resolution}: ${voterIds.map((id) => `<@${id}>`)}`,
  )
  .join("\n")}`}
      {/* TODO: show vote in progress, reveal votes and unvoted mods */}
      {renderButton(votes, resolutions.okay, "Okay", "success")}
      {renderButton(votes, resolutions.track, "Track")}
      {renderButton(votes, resolutions.timeout, "Timeout")}
      {renderButton(votes, resolutions.nudge, "Nudge", "primary")}
      {renderButton(votes, resolutions.warning, "Formal Warning")}
      {renderButton(votes, resolutions.restrict, "Restrict")}
      {renderButton(votes, resolutions.kick, "Kick")}
      {renderButton(votes, resolutions.ban, "Ban", "danger")}
    </>
  );
};

export const Confirmation = ({
  thread,
  modRoleId,
  onNotify,
}: {
  thread: AnyThreadChannel;
  modRoleId: string;
  onNotify: () => void;
}) => {
  return (
    <>
      Discussion thread created
      <Button
        label="Notify mods"
        style="success"
        onClick={async (event) => {
          await thread.send(
            `<@${event.user.id}> indicated this is urgent. <@&${modRoleId}> please respond`,
          );
          await onNotify();
        }}
      />
    </>
  );
};

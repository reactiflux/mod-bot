import type { ComponentEventUser, ComponentEvent } from "reacord";
import { Button, ActionRow } from "reacord";

import type { Resolution } from "#~/helpers/modResponse";
import {
  humanReadableResolutions,
  resolutions,
  useVotes,
} from "#~/helpers/modResponse";

const VOTES_TO_APPROVE = 3;

export const ModResponse = ({
  votesRequired = VOTES_TO_APPROVE,
  onVote,
  onResolve,
  modRoleId,
}: {
  votesRequired?: number;
  onVote: (result: { vote: Resolution; user: ComponentEventUser }) => void;
  onResolve: (result: Resolution, event: ComponentEvent) => Promise<void>;
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
        try {
          onVote({ vote: resolution, user: event.user });
        } catch (e) {
          console.error("onVote", e);
        }

        const { leader, voteCount } = recordVote(
          votes,
          resolution,
          event.user.id,
        );
        console.log(
          `recording vote for ${resolution} from ${event.user.username}. ${leader} leads with ${voteCount} (needs ${votesRequired})`,
        );

        if (leader && voteCount >= votesRequired) {
          try {
            await onResolve(leader, event);
          } catch (e) {
            console.error("onResolve", e);
          }
        }
      }}
    />
  );

  return (
    <>
      {`After ${votesRequired} or more votes, the leading resolution will be automatically enforced.`}
      {/* TODO: show vote in progress, reveal votes and unvoted mods */}
      <ActionRow>
        {renderButton(
          votes,
          resolutions.track,
          humanReadableResolutions[resolutions.track],
          "success",
        )}
        {renderButton(
          votes,
          resolutions.warning,
          humanReadableResolutions[resolutions.warning],
          "primary",
        )}
        {renderButton(
          votes,
          resolutions.ban,
          humanReadableResolutions[resolutions.ban],
          "danger",
        )}
      </ActionRow>
      <ActionRow>
        {renderButton(
          votes,
          resolutions.kick,
          humanReadableResolutions[resolutions.kick],
        )}
        {renderButton(
          votes,
          resolutions.restrict,
          humanReadableResolutions[resolutions.restrict],
        )}
        {renderButton(
          votes,
          resolutions.timeout,
          humanReadableResolutions[resolutions.timeout],
        )}
      </ActionRow>
    </>
  );
};

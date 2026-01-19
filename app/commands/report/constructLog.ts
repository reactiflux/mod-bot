import { formatDistanceToNowStrict } from "date-fns";
import {
  MessageReferenceType,
  type Message,
  type MessageCreateOptions,
} from "discord.js";
import { Effect } from "effect";

import { DiscordApiError } from "#~/effects/errors";
import { constructDiscordLink } from "#~/helpers/discord";
import { truncateMessage } from "#~/helpers/string";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { ReportReasons, type Report } from "#~/models/reportedMessages";

const ReadableReasons: Record<ReportReasons, string> = {
  [ReportReasons.anonReport]: "Reported anonymously",
  [ReportReasons.track]: "tracked",
  [ReportReasons.modResolution]: "Mod vote resolved",
  [ReportReasons.spam]: "detected as spam",
  [ReportReasons.automod]: "detected by automod",
};

export const makeReportMessage = ({ message: _, reason, staff }: Report) => {
  return {
    content: `${staff ? ` ${staff.username} ` : ""}${ReadableReasons[reason]}`,
  };
};

export const constructLog = ({
  logs,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
}) =>
  Effect.gen(function* () {
    const lastReport = logs.at(-1);
    if (!lastReport?.message.guild) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "constructLog",
          discordError: new Error(
            "Something went wrong when trying to retrieve last report",
          ),
        }),
      );
    }
    const { message } = lastReport;
    const { author } = message;
    const { moderator } = yield* Effect.tryPromise({
      try: () =>
        fetchSettings(lastReport.message.guild!.id, [SETTINGS.moderator]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    // This should never be possible but we gotta satisfy types
    if (!moderator) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "constructLog",
          discordError: new Error("No role configured to be used as moderator"),
        }),
      );
    }

    const { content: report } = makeReportMessage(lastReport);

    // Add indicator if this is forwarded content
    const forwardNote = isForwardedMessage(message) ? " (forwarded)" : "";
    const preface = `${constructDiscordLink(message)} by <@${author.id}> (${
      author.username
    })${forwardNote}`;
    const extra = origExtra ? `${origExtra}\n` : "";

    return {
      content: truncateMessage(`${preface}
-# ${report}
-# ${extra}${formatDistanceToNowStrict(lastReport.message.createdAt)} ago · <t:${Math.floor(lastReport.message.createdTimestamp / 1000)}:R>`).trim(),
      allowedMentions: { roles: [moderator] },
    } satisfies MessageCreateOptions;
  });

export const isForwardedMessage = (message: Message): boolean => {
  return message.reference?.type === MessageReferenceType.Forward;
};

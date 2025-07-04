import fetch from "node-fetch";
import queryString from "query-string";
import type { Message, Guild, ThreadChannel } from "discord.js";
import { amplitudeKey } from "#~/helpers/env.server";

type AmplitudeValue = string | number | boolean;
type EmitEventData = Record<string, AmplitudeValue | AmplitudeValue[]>;

const events = {
  messageTracked: "message sent",
  botStarted: "bot started",
  guildJoined: "guild joined",
  threadCreated: "thread created",
  gatewayError: "gateway error",
  reconnection: "bot reconnected",
};

export const threadStats = {
  messageTracked: (message: Message) =>
    emitEvent(events.messageTracked, {
      data: { guildId: message.guild?.id ?? "none" },
    }),
};

export const botStats = {
  botStarted: (guildCount: number, userCount: number) =>
    emitEvent(events.botStarted, {
      data: { guildCount, userCount },
    }),

  guildJoined: (guild: Guild) =>
    emitEvent(events.guildJoined, {
      data: {
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
      },
    }),

  threadCreated: (thread: ThreadChannel) =>
    emitEvent(events.threadCreated, {
      data: {
        threadId: thread.id,
        guildId: thread.guild?.id ?? "none",
        channelId: thread.parentId ?? "none",
        threadName: thread.name,
      },
    }),

  gatewayError: (error: string, guildCount: number) =>
    emitEvent(events.gatewayError, {
      data: { error, guildCount },
    }),

  reconnection: (guildCount: number, userCount: number) =>
    emitEvent(events.reconnection, {
      data: { guildCount, userCount },
    }),
};

const emitEvent = (
  eventName: string,
  { data, userId }: { data?: EmitEventData; userId?: string } = {},
) => {
  if (!amplitudeKey) {
    console.log({
      user_id: userId,
      event_type: eventName,
      event_properties: data,
    });
    return;
  }

  const fields = {
    api_key: amplitudeKey,
    event: JSON.stringify({
      user_id: userId || "0",
      event_type: eventName,
      event_properties: data,
    }),
  };

  fetch(`https://api.amplitude.com/httpapi?${queryString.stringify(fields)}`);
};

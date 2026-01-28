import { InteractionType } from "discord.js";

import { type EffectMessageComponentCommand } from "#~/helpers/discord";
import { resolutions } from "#~/helpers/modResponse";

import { EscalationHandlers } from "./escalate/handlers";

const button = (name: string) => ({
  type: InteractionType.MessageComponent as const,
  name,
});

const h = EscalationHandlers;

export const EscalationCommands: EffectMessageComponentCommand[] = [
  { type: "effect", command: button("escalate-escalate"), handler: h.escalate },

  // Direct action commands (no voting)
  { type: "effect", command: button("escalate-delete"), handler: h.delete },
  { type: "effect", command: button("escalate-kick"), handler: h.kick },
  { type: "effect", command: button("escalate-ban"), handler: h.ban },
  { type: "effect", command: button("escalate-restrict"), handler: h.restrict },
  { type: "effect", command: button("escalate-timeout"), handler: h.timeout },

  // Expedite handler
  { type: "effect", command: button("expedite"), handler: h.expedite },

  // Create vote handlers for each resolution
  ...Object.values(resolutions).map((resolution) => ({
    type: "effect" as const,
    command: {
      type: InteractionType.MessageComponent as const,
      name: `vote-${resolution}`,
    },
    handler: h.vote(resolution),
  })),
];

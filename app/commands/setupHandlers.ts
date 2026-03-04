import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  InteractionType,
  MessageFlags,
  type InteractionUpdateOptions,
} from "discord.js";
import { Effect } from "effect";

import {
  interactionDeferUpdate,
  interactionEditReply,
  interactionUpdate,
} from "#~/effects/discordSdk";
import { logEffect } from "#~/effects/observability";
import type { MessageComponentCommand } from "#~/helpers/discord";
import { commandStats } from "#~/helpers/metrics";
import { CREATE_SENTINEL, setupAll } from "#~/helpers/setupAll.server.ts";

// --- State management ---

interface PendingSetup {
  modRoleId?: string; // undefined until selected (required)
  modLogChannel: string; // defaults to CREATE_SENTINEL
  deletionLogChannel: string; // defaults to CREATE_SENTINEL
  honeypotChannel: string; // defaults to CREATE_SENTINEL
  ticketChannel: string; // defaults to CREATE_SENTINEL
  restrictedRoleId?: string; // undefined = skip
  createdAt: number;
}

const STALE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const pendingSetups = new Map<string, PendingSetup>();

function setupKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

function cleanupStaleSetups() {
  const now = Date.now();
  for (const [key, state] of pendingSetups) {
    if (now - state.createdAt > STALE_TIMEOUT_MS) {
      pendingSetups.delete(key);
    }
  }
}

function defaultSetup(): Omit<PendingSetup, "createdAt"> {
  return {
    modRoleId: undefined,
    modLogChannel: CREATE_SENTINEL,
    deletionLogChannel: CREATE_SENTINEL,
    honeypotChannel: CREATE_SENTINEL,
    ticketChannel: CREATE_SENTINEL,
    restrictedRoleId: undefined,
  };
}

// --- Helper functions ---

function channelValue(value: string, createLabel: string): string {
  return value === CREATE_SENTINEL
    ? `Create new #${createLabel}`
    : `<#${value}>`;
}

function v2Payload(payload: object) {
  return payload as unknown as InteractionUpdateOptions;
}

// Alias for update interactions — same cast, named for clarity at call sites
const v2Update = v2Payload;

// --- Public: initialize state and return the form payload for slash command use ---

export function initSetupForm(guildId: string, userId: string): object {
  cleanupStaleSetups();
  const state: PendingSetup = { ...defaultSetup(), createdAt: Date.now() };
  pendingSetups.set(setupKey(guildId, userId), state);
  return buildSetupFormMessage(guildId, state);
}

function buildSetupFormMessage(
  guildId: string,
  state: PendingSetup,
  errorText?: string,
) {
  function channelDefaultValues(value: string) {
    return value !== CREATE_SENTINEL
      ? [{ id: value, type: "channel" as const }]
      : undefined;
  }

  function roleDefaultValues(roleId: string | undefined) {
    return roleId ? [{ id: roleId, type: "role" as const }] : undefined;
  }

  return v2Update({
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: ComponentType.Container,
        components: [
          {
            type: ComponentType.TextDisplay,
            content: "## Configure Euno",
          },
          {
            type: ComponentType.TextDisplay,
            content:
              "Select your channels and roles below. Channels left on 'Create new' will be auto-created with sensible defaults.",
          },
          ...(errorText
            ? [
                {
                  type: ComponentType.TextDisplay,
                  content: `⚠ ${errorText}`,
                },
              ]
            : []),
          { type: ComponentType.Separator, spacing: 2 },
          {
            type: ComponentType.TextDisplay,
            content: "**Moderator Role** *(required)*",
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.RoleSelect,
                custom_id: `setup-sel|${guildId}|modRole`,
                placeholder: "Select a moderator role…",
                ...(state.modRoleId
                  ? { default_values: roleDefaultValues(state.modRoleId) }
                  : {}),
              },
            ],
          },
          { type: ComponentType.Separator },
          {
            type: ComponentType.TextDisplay,
            content:
              "**Mod Log** — Moderation actions and reports. Visible only to moderators.",
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.ChannelSelect,
                custom_id: `setup-sel|${guildId}|modLog`,
                placeholder: "Create new #mod-log (default)",
                channel_types: [ChannelType.GuildText],
                ...(channelDefaultValues(state.modLogChannel)
                  ? {
                      default_values: channelDefaultValues(state.modLogChannel),
                    }
                  : {}),
              },
            ],
          },
          {
            type: ComponentType.TextDisplay,
            content:
              "**Deletion Log** — Captures deleted messages. Visible only to moderators.",
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.ChannelSelect,
                custom_id: `setup-sel|${guildId}|deletionLog`,
                placeholder: "Create new #deletion-log (default)",
                channel_types: [ChannelType.GuildText],
                ...(channelDefaultValues(state.deletionLogChannel)
                  ? {
                      default_values: channelDefaultValues(
                        state.deletionLogChannel,
                      ),
                    }
                  : {}),
              },
            ],
          },
          {
            type: ComponentType.TextDisplay,
            content:
              "**Honeypot** — Trap channel placed at top of channel list. Bots that post here are auto-banned.",
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.ChannelSelect,
                custom_id: `setup-sel|${guildId}|honeypot`,
                placeholder: "Create new #honeypot (default)",
                channel_types: [ChannelType.GuildText],
                ...(channelDefaultValues(state.honeypotChannel)
                  ? {
                      default_values: channelDefaultValues(
                        state.honeypotChannel,
                      ),
                    }
                  : {}),
              },
            ],
          },
          {
            type: ComponentType.TextDisplay,
            content:
              "**Ticket Channel** — Where members open private tickets with moderators.",
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.ChannelSelect,
                custom_id: `setup-sel|${guildId}|tickets`,
                placeholder: "Create new #contact-mods (default)",
                channel_types: [ChannelType.GuildText],
                ...(channelDefaultValues(state.ticketChannel)
                  ? {
                      default_values: channelDefaultValues(state.ticketChannel),
                    }
                  : {}),
              },
            ],
          },
          { type: ComponentType.Separator },
          {
            type: ComponentType.TextDisplay,
            content:
              "**Restricted Role** *(optional)* — Role assigned to muted or restricted members.",
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.RoleSelect,
                custom_id: `setup-sel|${guildId}|restrictedRole`,
                placeholder: "None — skip (default)",
                ...(state.restrictedRoleId
                  ? {
                      default_values: roleDefaultValues(state.restrictedRoleId),
                    }
                  : {}),
              },
            ],
          },
          { type: ComponentType.Separator },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: `setup-continue|${guildId}`,
                label: "Continue →",
                style: ButtonStyle.Primary,
              },
            ],
          },
        ],
      },
    ],
  });
}

function buildSetupConfirmMessage(guildId: string, state: PendingSetup) {
  const summaryLines = [
    `**Moderator Role:** <@&${state.modRoleId}>`,
    `**Mod Log:** ${channelValue(state.modLogChannel, "mod-log")}`,
    `**Deletion Log:** ${channelValue(state.deletionLogChannel, "deletion-log")}`,
    `**Honeypot:** ${channelValue(state.honeypotChannel, "honeypot")}`,
    `**Ticket Channel:** ${channelValue(state.ticketChannel, "contact-mods")}`,
    `**Restricted Role:** ${state.restrictedRoleId ? `<@&${state.restrictedRoleId}>` : "None"}`,
  ];

  return v2Update({
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: ComponentType.Container,
        components: [
          {
            type: ComponentType.TextDisplay,
            content: "## Confirm Setup",
          },
          {
            type: ComponentType.TextDisplay,
            content:
              "Review your configuration. Click **Confirm** to apply, or go back to make changes.",
          },
          { type: ComponentType.Separator, spacing: 2 },
          {
            type: ComponentType.TextDisplay,
            content: summaryLines.join("\n"),
          },
          { type: ComponentType.Separator },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: `setup-back|${guildId}`,
                label: "← Go Back",
                style: ButtonStyle.Secondary,
              },
              {
                type: ComponentType.Button,
                custom_id: `setup-exec|${guildId}`,
                label: "Confirm ✓",
                style: ButtonStyle.Primary,
              },
            ],
          },
        ],
      },
    ],
  });
}

const EXPIRED_MESSAGE = {
  content: "Setup session expired. Please run `/setup` again.",
  components: [],
};

const button = (name: string) => ({
  type: InteractionType.MessageComponent as const,
  name,
});

const FIELD_MAP = {
  modRole: "modRoleId",
  modLog: "modLogChannel",
  deletionLog: "deletionLogChannel",
  honeypot: "honeypotChannel",
  tickets: "ticketChannel",
  restrictedRole: "restrictedRoleId",
} as const;

type FieldKey = keyof typeof FIELD_MAP;

export const SetupComponentCommands: MessageComponentCommand[] = [
  // 1. setup-sel — update one state field, deferUpdate to preserve UI
  {
    command: button("setup-sel"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const parts = interaction.customId.split("|");
        const guildId = parts[1];
        const field = parts[2] as FieldKey;

        if (!guildId || !field || !(field in FIELD_MAP)) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Invalid customId"));
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        let value: string | undefined;
        if (interaction.isRoleSelectMenu()) {
          value = interaction.values[0];
        } else if (interaction.isChannelSelectMenu()) {
          value = interaction.values[0];
        } else {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Unexpected interaction type"));
        }

        if (value) {
          const stateKey = FIELD_MAP[field];
          (state as unknown as Record<string, string>)[stateKey] = value;
        }

        yield* interactionDeferUpdate(interaction);
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect("error", "Commands", "setup-sel handler failed", {
              error: err,
            });
          }),
        ),
        Effect.withSpan("setupSelHandler"),
      ),
  },

  // 3. setup-continue — validate modRoleId, show confirmation
  {
    command: button("setup-continue"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        if (!state.modRoleId) {
          yield* interactionUpdate(
            interaction,
            buildSetupFormMessage(
              guildId,
              state,
              "Please select a Moderator Role before continuing.",
            ),
          );
          return;
        }

        yield* interactionUpdate(
          interaction,
          buildSetupConfirmMessage(guildId, state),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect(
              "error",
              "Commands",
              "setup-continue handler failed",
              { error: err },
            );
            yield* interactionUpdate(interaction, {
              content: `Setup failed: ${err.message}`,
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupContinueHandler"),
      ),
  },

  // 4. setup-back — rebuild form with current state (pre-populated selects)
  {
    command: button("setup-back"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        yield* interactionUpdate(
          interaction,
          buildSetupFormMessage(guildId, state),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect("error", "Commands", "setup-back handler failed", {
              error: err,
            });
          }),
        ),
        Effect.withSpan("setupBackHandler"),
      ),
  },

  // 5. setup-exec — defer, execute setupAll, show results
  {
    command: button("setup-exec"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        yield* interactionDeferUpdate(interaction);

        const result = yield* Effect.tryPromise(() =>
          setupAll({
            guildId,
            moderatorRoleId: state.modRoleId!,
            restrictedRoleId: state.restrictedRoleId,
            modLogChannel: state.modLogChannel,
            deletionLogChannel: state.deletionLogChannel,
            honeypotChannel: state.honeypotChannel,
            ticketChannel: state.ticketChannel,
          }),
        );

        // Clean up state
        pendingSetups.delete(key);

        yield* logEffect(
          "info",
          "Commands",
          "Setup completed successfully via Discord",
          {
            guildId,
            userId: interaction.user.id,
            modRoleId: state.modRoleId,
            created: result.created,
          },
        );

        commandStats.setupCompleted(interaction, {
          moderator: state.modRoleId!,
          modLog: result.modLogChannelId,
        });

        const statusLines = [
          `**Moderator Role:** <@&${state.modRoleId}>`,
          `**Mod Log:** <#${result.modLogChannelId}>${result.created.includes("mod-log") ? " (created)" : ""}`,
          `**Deletion Log:** <#${result.deletionLogChannelId}>${result.created.includes("deletion-log") ? " (created)" : ""}`,
          `**Honeypot:** <#${result.honeypotChannelId}>${result.created.includes("honeypot") ? " (created)" : ""}`,
          `**Tickets:** <#${result.ticketChannelId}>${result.created.includes("contact-mods") ? " (created)" : ""}`,
          ...(state.restrictedRoleId
            ? [`**Restricted Role:** <@&${state.restrictedRoleId}>`]
            : []),
        ];

        yield* interactionEditReply(
          interaction,
          v2Update({
            flags: MessageFlags.IsComponentsV2,
            components: [
              {
                type: ComponentType.Container,
                accent_color: 0x00cc00,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: "## Setup Complete ✓",
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content:
                      "All channels and features have been configured. Run `/check-requirements` to verify everything is working.",
                  },
                  { type: ComponentType.Separator },
                  {
                    type: ComponentType.TextDisplay,
                    content: statusLines.join("\n"),
                  },
                ],
              },
            ],
          }),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));

            yield* logEffect("error", "Commands", "setup-exec handler failed", {
              guildId: interaction.guildId,
              userId: interaction.user.id,
              error: err,
            });

            yield* interactionEditReply(
              interaction,
              v2Update({
                flags: MessageFlags.IsComponentsV2,
                components: [
                  {
                    type: ComponentType.Container,
                    accent_color: 0xed4245,
                    components: [
                      {
                        type: ComponentType.TextDisplay,
                        content: `Setup failed. Run \`/check-requirements\` to see what was configured.\n\`\`\`\n${err.toString()}\n\`\`\``,
                      },
                    ],
                  },
                ],
              }),
            ).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupExecHandler", {
          attributes: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
          },
        }),
      ),
  },
];

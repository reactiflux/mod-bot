import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  InteractionType,
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
import {
  CREATE_SENTINEL,
  setupAll,
  type SetupAllResult,
} from "#~/helpers/setupAll.server.ts";

// --- State management ---

interface PendingSetup {
  modRoleId: string;
  modLogChannel?: string; // channel ID or CREATE_SENTINEL
  deletionLogChannel?: string;
  honeypotChannel?: string;
  ticketChannel?: string;
  restrictedRoleId?: string;
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

// --- Channel step definitions ---

const CHANNEL_STEPS = [
  {
    name: "mod-log",
    label: "Mod Log",
    stateKey: "modLogChannel" as const,
    desc: "Where moderation actions and reports are logged. Visible only to moderators.",
  },
  {
    name: "deletion-log",
    label: "Deletion Log",
    stateKey: "deletionLogChannel" as const,
    desc: "Where deleted messages are captured. Visible only to moderators.",
  },
  {
    name: "honeypot",
    label: "Honeypot",
    stateKey: "honeypotChannel" as const,
    desc: "A trap channel placed at the top of the channel list. Bots that post here are automatically banned.",
  },
  {
    name: "contact-mods",
    label: "Ticket Channel",
    stateKey: "ticketChannel" as const,
    desc: "Where members can open private tickets with moderators.",
  },
];

// --- Helper functions ---

function buildChannelStepMessage(guildId: string, stepNum: number) {
  const step = CHANNEL_STEPS[stepNum - 1];
  if (!step) throw new Error(`Invalid step number: ${stepNum}`);

  return {
    embeds: [
      {
        title: `Step ${stepNum}/5: ${step.label}`,
        description: step.desc,
        color: 0x5865f2,
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.ChannelSelect,
            customId: `setup-ch|${guildId}|${stepNum}`,
            channelTypes: [ChannelType.GuildText],
            placeholder: "Select an existing channel…",
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: `setup-ch|${guildId}|${stepNum}|new`,
            label: `Create new #${step.name}`,
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ],
  };
}

function buildRestrictedRoleMessage(guildId: string) {
  return {
    embeds: [
      {
        title: "Step 5/5: Restricted Role",
        description:
          "Optionally select a role for restricted users (e.g. muted members). Members with this role will have limited permissions.",
        color: 0x5865f2,
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.RoleSelect,
            customId: `setup-rr|${guildId}`,
            placeholder: "Select a restricted role…",
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: `setup-rr|${guildId}|skip`,
            label: "Skip",
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ],
  };
}

function buildConfirmationMessage(guildId: string, state: PendingSetup) {
  const fields = [
    {
      name: "Moderator Role",
      value: `<@&${state.modRoleId}>`,
      inline: true,
    },
    {
      name: "Mod Log",
      value:
        state.modLogChannel === CREATE_SENTINEL
          ? "Create new #mod-log"
          : `<#${state.modLogChannel}>`,
      inline: true,
    },
    {
      name: "Deletion Log",
      value:
        state.deletionLogChannel === CREATE_SENTINEL
          ? "Create new #deletion-log"
          : `<#${state.deletionLogChannel}>`,
      inline: true,
    },
    {
      name: "Honeypot",
      value:
        state.honeypotChannel === CREATE_SENTINEL
          ? "Create new #honeypot"
          : `<#${state.honeypotChannel}>`,
      inline: true,
    },
    {
      name: "Tickets",
      value:
        state.ticketChannel === CREATE_SENTINEL
          ? "Create new #contact-mods"
          : `<#${state.ticketChannel}>`,
      inline: true,
    },
    {
      name: "Restricted Role",
      value: state.restrictedRoleId ? `<@&${state.restrictedRoleId}>` : "None",
      inline: true,
    },
  ];

  return {
    embeds: [
      {
        title: "Confirm Setup",
        description:
          "Review the settings below, then click **Confirm** to apply them.",
        fields,
        color: 0x5865f2,
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: `setup-exec|${guildId}`,
            label: "Confirm",
            style: ButtonStyle.Primary,
          },
          {
            type: ComponentType.Button,
            customId: `setup-discord|${guildId}`,
            label: "Start Over",
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ],
  };
}

function buildStatusFields(
  result: SetupAllResult,
  modRoleId: string,
  restrictedRoleId?: string,
) {
  return [
    {
      name: "Moderator Role",
      value: `<@&${modRoleId}>`,
      inline: true,
    },
    {
      name: "Mod Log",
      value: result.created.includes("mod-log")
        ? `<#${result.modLogChannelId}> (created)`
        : `<#${result.modLogChannelId}> (existing)`,
      inline: true,
    },
    {
      name: "Deletion Log",
      value: result.created.includes("deletion-log")
        ? `<#${result.deletionLogChannelId}> (created)`
        : `<#${result.deletionLogChannelId}> (existing)`,
      inline: true,
    },
    {
      name: "Honeypot",
      value: result.created.includes("honeypot")
        ? `<#${result.honeypotChannelId}> (created)`
        : `<#${result.honeypotChannelId}> (existing)`,
      inline: true,
    },
    {
      name: "Tickets",
      value: result.created.includes("contact-mods")
        ? `<#${result.ticketChannelId}> (created)`
        : `<#${result.ticketChannelId}> (existing)`,
      inline: true,
    },
    ...(restrictedRoleId
      ? [
          {
            name: "Restricted Role",
            value: `<@&${restrictedRoleId}>`,
            inline: true,
          },
        ]
      : []),
  ];
}

const EXPIRED_MESSAGE = {
  content: "Setup session expired. Please run `/setup` again.",
  embeds: [],
  components: [],
};

const button = (name: string) => ({
  type: InteractionType.MessageComponent as const,
  name,
});

export const SetupComponentCommands: MessageComponentCommand[] = [
  // 1. setup-discord — show role select (unchanged)
  {
    command: button("setup-discord"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          //
          return yield* Effect.fail(new Error("Missing guildId in customId"));
        }

        yield* interactionUpdate(interaction, {
          embeds: [
            {
              title: "Select Moderator Role",
              description:
                "Choose the role that grants moderator permissions. Euno will use this role to control access to log channels and other mod-only features.",
              color: 0x5865f2,
            },
          ],
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.RoleSelect,
                  customId: `setup-role|${guildId}`,
                  placeholder: "Select a moderator role…",
                },
              ],
            },
          ],
        });
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect(
              "error",
              "Commands",
              "setup-discord handler failed",
              { error: err },
            );
          }),
        ),
        Effect.withSpan("setupDiscordHandler"),
      ),
  },

  // 2. setup-role — store role, show defaults/customize
  {
    command: button("setup-role"),
    handler: (interaction) =>
      Effect.gen(function* () {
        if (!interaction.isRoleSelectMenu()) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Invalid interaction"));
        }

        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
        }

        const modRoleId = interaction.values[0];
        if (!modRoleId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("No role selected"));
        }

        // Clean up stale setups and store the new one
        cleanupStaleSetups();
        const key = setupKey(guildId, interaction.user.id);
        pendingSetups.set(key, {
          modRoleId,
          createdAt: Date.now(),
        });

        yield* interactionUpdate(interaction, {
          embeds: [
            {
              title: "Setup Mode",
              description: `Moderator role: <@&${modRoleId}>\n\nChoose how to configure the remaining settings:`,
              color: 0x5865f2,
              fields: [
                {
                  name: "Use Defaults",
                  value:
                    "Automatically create all channels with default names.",
                  inline: true,
                },
                {
                  name: "Customize",
                  value:
                    "Walk through each setting and choose existing channels or create new ones.",
                  inline: true,
                },
              ],
            },
          ],
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  customId: `setup-defaults|${guildId}`,
                  label: "Use Defaults",
                  style: ButtonStyle.Primary,
                },
                {
                  type: ComponentType.Button,
                  customId: `setup-custom|${guildId}`,
                  label: "Customize",
                  style: ButtonStyle.Secondary,
                },
              ],
            },
          ],
        });
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect("error", "Commands", "setup-role handler failed", {
              error: err,
            });
            yield* interactionUpdate(interaction, {
              content: `Setup failed: ${err.message}`,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupRoleHandler"),
      ),
  },

  // 3. setup-defaults — populate CREATE_SENTINEL, show confirmation
  {
    command: button("setup-defaults"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
          return;
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        state.modLogChannel = CREATE_SENTINEL;
        state.deletionLogChannel = CREATE_SENTINEL;
        state.honeypotChannel = CREATE_SENTINEL;
        state.ticketChannel = CREATE_SENTINEL;

        yield* interactionUpdate(
          interaction,
          buildConfirmationMessage(guildId, state),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect(
              "error",
              "Commands",
              "setup-defaults handler failed",
              { error: err },
            );
            yield* interactionUpdate(interaction, {
              content: `Setup failed: ${err.message}`,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupDefaultsHandler"),
      ),
  },

  // 4. setup-custom — show channel step 1
  {
    command: button("setup-custom"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
          return;
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        yield* interactionUpdate(
          interaction,
          buildChannelStepMessage(guildId, 1),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect(
              "error",
              "Commands",
              "setup-custom handler failed",
              { error: err },
            );
            yield* interactionUpdate(interaction, {
              content: `Setup failed: ${err.message}`,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupCustomHandler"),
      ),
  },

  // 5. setup-ch — handle channel select or "create new" button
  {
    command: button("setup-ch"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const parts = interaction.customId.split("|");
        const guildId = parts[1];
        const stepStr = parts[2];
        const isNew = parts[3] === "new";

        if (!guildId || !stepStr) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Invalid customId"));
          return;
        }

        const stepNum = parseInt(stepStr, 10);
        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        // Get the value: channel ID from select or CREATE_SENTINEL from button
        let value: string;
        if (isNew) {
          value = CREATE_SENTINEL;
        } else if (interaction.isChannelSelectMenu()) {
          const selected = interaction.values[0];
          if (!selected) {
            // @effect-diagnostics-next-line globalErrorInEffectFailure:off
            return yield* Effect.fail(new Error("No channel selected"));
            return;
          }
          value = selected;
        } else {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Unexpected interaction type"));
          return;
        }

        // Store the value based on step number
        const step = CHANNEL_STEPS[stepNum - 1];
        if (!step) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(
            new Error(`Invalid step number: ${stepNum}`),
          );
          return;
        }
        state[step.stateKey] = value;

        // Advance to next channel step, or restricted role after step 4
        if (stepNum < CHANNEL_STEPS.length) {
          yield* interactionUpdate(
            interaction,
            buildChannelStepMessage(guildId, stepNum + 1),
          );
        } else {
          yield* interactionUpdate(
            interaction,
            buildRestrictedRoleMessage(guildId),
          );
        }
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect("error", "Commands", "setup-ch handler failed", {
              error: err,
            });
            yield* interactionUpdate(interaction, {
              content: `Setup failed: ${err.message}`,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupChannelHandler"),
      ),
  },

  // 6. setup-rr — handle restricted role select or skip
  {
    command: button("setup-rr"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const parts = interaction.customId.split("|");
        const guildId = parts[1];
        const isSkip = parts[2] === "skip";

        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
          return;
        }

        const key = setupKey(guildId, interaction.user.id);
        const state = pendingSetups.get(key);
        if (!state) {
          yield* interactionUpdate(interaction, EXPIRED_MESSAGE);
          return;
        }

        if (isSkip) {
          state.restrictedRoleId = undefined;
        } else if (interaction.isRoleSelectMenu()) {
          state.restrictedRoleId = interaction.values[0];
        } else {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Unexpected interaction type"));
          return;
        }

        yield* interactionUpdate(
          interaction,
          buildConfirmationMessage(guildId, state),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect("error", "Commands", "setup-rr handler failed", {
              error: err,
            });
            yield* interactionUpdate(interaction, {
              content: `Setup failed: ${err.message}`,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupRestrictedRoleHandler"),
      ),
  },

  // 7. setup-exec — defer, execute setupAll, show results
  {
    command: button("setup-exec"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          return yield* Effect.fail(new Error("Missing guildId in customId"));
          return;
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
            moderatorRoleId: state.modRoleId,
            restrictedRoleId: state.restrictedRoleId,
            modLogChannel: state.modLogChannel!,
            deletionLogChannel: state.deletionLogChannel!,
            honeypotChannel: state.honeypotChannel!,
            ticketChannel: state.ticketChannel!,
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
          moderator: state.modRoleId,
          modLog: result.modLogChannelId,
        });

        yield* interactionEditReply(interaction, {
          embeds: [
            {
              title: "Setup Complete",
              description:
                "All channels and features have been configured. Run `/check-requirements` to verify everything is working.",
              fields: buildStatusFields(
                result,
                state.modRoleId,
                state.restrictedRoleId,
              ),
              color: 0x00cc00,
            },
          ],
          components: [],
        });
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

            yield* interactionEditReply(interaction, {
              content: `Setup failed. Run \`/check-requirements\` to see what was configured.\n\`\`\`\n${err.toString()}\n\`\`\``,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
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

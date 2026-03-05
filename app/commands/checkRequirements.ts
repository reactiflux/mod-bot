import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { Effect } from "effect";

import { DatabaseService } from "#~/Database.ts";
import {
  fetchChannel,
  interactionDeferReply,
  interactionEditReply,
} from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import { REQUIRED_PERMISSIONS } from "#~/helpers/botPermissions";
import type { SlashCommand } from "#~/helpers/discord";
import { commandStats } from "#~/helpers/metrics";
import { fetchSettingsEffect, SETTINGS } from "#~/models/guilds.server";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export const Command = {
  command: new SlashCommandBuilder()
    .setName("check-requirements")
    .setDescription(
      "Check if Euno is properly configured and has the permissions it needs",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  handler: (interaction) =>
    Effect.gen(function* () {
      if (!interaction.guild || !interaction.guildId) {
        yield* Effect.fail(new Error("This command must be used in a server."));
        return;
      }

      yield* interactionDeferReply(interaction, {
        flags: [MessageFlags.Ephemeral],
      });

      const guild = interaction.guild;
      const guildId = interaction.guildId;
      const results: CheckResult[] = [];

      // --- Guild settings ---
      const settings = yield* fetchSettingsEffect(guildId, [
        SETTINGS.moderator,
        SETTINGS.modLog,
        SETTINGS.deletionLog,
        SETTINGS.restricted,
      ]).pipe(
        Effect.catchAll(() =>
          Effect.succeed(null as null | Record<string, string | undefined>),
        ),
      );

      if (!settings) {
        results.push({
          name: "Guild Registration",
          ok: false,
          detail: "Guild not registered. Run `/setup`.",
        });
      } else {
        results.push({
          name: "Guild Registration",
          ok: true,
          detail: "Registered",
        });
      }

      // --- Moderator role ---
      if (settings?.moderator) {
        const role = yield* Effect.tryPromise(() =>
          guild.roles.fetch(settings.moderator!),
        ).pipe(Effect.catchAll(() => Effect.succeed(null)));

        results.push({
          name: "Moderator Role",
          ok: !!role,
          detail: role
            ? `<@&${role.id}>`
            : `Role \`${settings.moderator}\` not found`,
        });
      } else {
        results.push({
          name: "Moderator Role",
          ok: false,
          detail: "Not configured",
        });
      }

      // --- Mod-log channel ---
      if (settings?.modLog) {
        const ch = yield* fetchChannel(guild, settings.modLog).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        );

        results.push({
          name: "Mod Log Channel",
          ok: !!ch,
          detail: ch
            ? `<#${ch.id}>`
            : `Channel \`${settings.modLog}\` not found`,
        });
      } else {
        results.push({
          name: "Mod Log Channel",
          ok: false,
          detail: "Not configured",
        });
      }

      // --- Deletion-log channel (optional) ---
      if (settings?.deletionLog) {
        const ch = yield* fetchChannel(guild, settings.deletionLog).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        );

        results.push({
          name: "Deletion Log Channel",
          ok: !!ch,
          detail: ch
            ? `<#${ch.id}>`
            : `Channel \`${settings.deletionLog}\` not found`,
        });
      } else {
        results.push({
          name: "Deletion Log Channel",
          ok: false,
          detail: "Not configured (optional but recommended)",
        });
      }

      // --- Restricted role (optional) ---
      if (settings?.restricted) {
        const role = yield* Effect.tryPromise(() =>
          guild.roles.fetch(settings.restricted!),
        ).pipe(Effect.catchAll(() => Effect.succeed(null)));

        results.push({
          name: "Restricted Role",
          ok: !!role,
          detail: role
            ? `<@&${role.id}>`
            : `Role \`${settings.restricted}\` not found`,
        });
      } else {
        results.push({
          name: "Restricted Role",
          ok: false,
          detail: "Not configured (optional)",
        });
      }

      // --- Honeypot channels ---
      const db = yield* DatabaseService;
      const honeypotRows = yield* db
        .selectFrom("honeypot_config")
        .selectAll()
        .where("guild_id", "=", guildId);

      if (honeypotRows.length === 0) {
        results.push({
          name: "Honeypot",
          ok: false,
          detail: "No honeypot channels configured",
        });
      } else {
        let validCount = 0;
        const details: string[] = [];
        for (const row of honeypotRows) {
          const ch = yield* fetchChannel(guild, row.channel_id).pipe(
            Effect.catchAll(() => Effect.succeed(null)),
          );
          if (ch) {
            validCount++;
            details.push(`<#${ch.id}>`);
          } else {
            details.push(`\`${row.channel_id}\` (missing)`);
          }
        }
        results.push({
          name: "Honeypot",
          ok: validCount > 0,
          detail: details.join(", "),
        });
      }

      // --- Ticket configuration ---
      // tickets_config has no guild_id, so check all rows and see which channels
      // belong to this guild
      const ticketRows = yield* db.selectFrom("tickets_config").selectAll();

      let ticketFound = false;
      const ticketDetails: string[] = [];
      for (const row of ticketRows) {
        if (!row.channel_id) continue;
        const ch = yield* fetchChannel(guild, row.channel_id).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        );
        if (ch) {
          ticketFound = true;
          ticketDetails.push(`<#${ch.id}>`);
        }
      }

      if (ticketFound) {
        results.push({
          name: "Tickets",
          ok: true,
          detail: ticketDetails.join(", "),
        });
      } else {
        results.push({
          name: "Tickets",
          ok: false,
          detail:
            ticketRows.length > 0
              ? "Configured but channel(s) not found"
              : "No ticket buttons configured",
        });
      }

      // --- Bot permissions ---
      const botMember = guild.members.me;
      if (botMember) {
        const missing = REQUIRED_PERMISSIONS.filter(
          ({ flag }) => !botMember.permissions.has(flag),
        );

        results.push({
          name: "Bot Permissions",
          ok: missing.length === 0,
          detail:
            missing.length === 0
              ? "All required permissions granted"
              : `Missing: ${missing.map((p) => p.name).join(", ")}`,
        });
      } else {
        results.push({
          name: "Bot Permissions",
          ok: false,
          detail: "Could not check (bot member not cached)",
        });
      }

      // --- Build result ---
      const allOk = results.every((r) => r.ok);
      const requiredFailing = results
        .filter(
          (r) =>
            !r.ok &&
            !r.name.includes("Restricted") &&
            !r.name.includes("Deletion"),
        )
        .map((r) => r.name);

      yield* interactionEditReply(interaction, {
        embeds: [
          {
            title: "Euno Configuration Check",
            color: requiredFailing.length === 0 ? 0x00cc00 : 0xcc0000,
            fields: results.map((r) => ({
              name: `${r.ok ? "\u2713" : "\u2717"} ${r.name}`,
              value: r.detail,
              inline: true,
            })),
            footer: {
              text:
                requiredFailing.length === 0
                  ? allOk
                    ? "All checks passed"
                    : "Core features configured. Optional features noted above."
                  : "Run /setup to fix configuration",
            },
          },
        ],
      });

      commandStats.commandExecuted(interaction, "check-requirements", true);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const err = error instanceof Error ? error : new Error(String(error));

          yield* logEffect(
            "error",
            "Commands",
            "Check-requirements command failed",
            {
              guildId: interaction.guildId,
              userId: interaction.user.id,
              error: err,
            },
          );

          commandStats.commandFailed(
            interaction,
            "check-requirements",
            err.message,
          );

          yield* interactionEditReply(interaction, {
            content: `Something broke:\n\`\`\`\n${err.toString()}\n\`\`\``,
          }).pipe(Effect.catchAll(() => Effect.void));
        }),
      ),
      Effect.withSpan("checkRequirementsCommand", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
} satisfies SlashCommand;

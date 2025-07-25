import type {
  APIApplicationCommand,
  Client,
  ContextMenuCommandBuilder,
  OAuth2Guild,
  SlashCommandBuilder,
} from "discord.js";
import { InteractionType, Routes } from "discord.js";

import { rest } from "#~/discord/api";
import type { AnyCommand } from "#~/helpers/discord";
import {
  isMessageComponentCommand,
  isMessageContextCommand,
  isModalCommand,
  isSlashCommand,
  isUserContextCommand,
} from "#~/helpers/discord";
import { applicationId, isProd } from "#~/helpers/env.server";
import { calculateChangedCommands } from "#~/helpers/discordCommands";
import { log, trackPerformance } from "#~/helpers/observability.js";

/**
 * deployCommands notifies Discord of the latest commands to use and registers
 * interaction event handlers.
 * @param client A discord.js client
 */
export const deployCommands = async (client: Client) => {
  const localCommands = [...commands.values()]
    .filter(
      (c) =>
        isSlashCommand(c) ||
        isUserContextCommand(c) ||
        isMessageContextCommand(c),
    )
    .map(({ command }) => command);

  await (isProd()
    ? deployProdCommands(client, localCommands)
    : deployTestCommands(client, localCommands));

  client.on("interactionCreate", (interaction) => {
    console.log("info", "interaction received", interaction.id);
    switch (interaction.type) {
      case InteractionType.ApplicationCommand: {
        const config = matchCommand(interaction.commandName);
        if (!config) return;

        if (
          isMessageContextCommand(config) &&
          interaction.isMessageContextMenuCommand()
        ) {
          config.handler(interaction);
          return;
        }
        if (
          isUserContextCommand(config) &&
          interaction.isUserContextMenuCommand()
        ) {
          config.handler(interaction);
          return;
        }
        if (isSlashCommand(config) && interaction.isChatInputCommand()) {
          config.handler(interaction);
          return;
        }
        throw new Error("Didn't find a handler for an interaction");
      }

      case InteractionType.MessageComponent: {
        const config = matchCommand(interaction.customId);
        if (!config) return;

        if (
          isMessageComponentCommand(config) &&
          interaction.isMessageComponent()
        ) {
          config.handler(interaction);
        }
        return;
      }
      case InteractionType.ModalSubmit: {
        const config = matchCommand(interaction.customId);
        if (!config) return;

        if (isModalCommand(config) && interaction.isModalSubmit()) {
          config.handler(interaction);
        }
        return;
      }
    }
  });
};

type ChangedCommands = ReturnType<typeof calculateChangedCommands>;

const applyCommandChanges = async (
  localCommands: (ContextMenuCommandBuilder | SlashCommandBuilder)[],
  toDelete: ChangedCommands["toDelete"],
  didCommandsChange: boolean,
  remoteCount: number,
  put: () => `/${string}`,
  del: (id: string) => `/${string}`,
) => {
  await Promise.allSettled(
    toDelete.map((commandId) => rest.delete(del(commandId))),
  );

  if (!didCommandsChange && remoteCount === localCommands.length) {
    return;
  }

  await rest.put(put(), { body: localCommands });
};

export const deployProdCommands = async (
  client: Client,
  localCommands: (ContextMenuCommandBuilder | SlashCommandBuilder)[],
) => {
  // If a randomly sampled guild has guild commands, wipe all guild commands
  // This should only one once as a migration, but maybe stuff will get into
  // weird states.
  const guilds = await client.guilds.fetch();
  const randomGuild = ((): OAuth2Guild => {
    let g: OAuth2Guild | undefined;
    // This is really just to appease TS
    while (!g) {
      g = guilds.at(Math.floor(Math.random() * guilds.size));
    }
    return g;
  })();
  const randomGuildCommands = (await rest.get(
    Routes.applicationGuildCommands(applicationId, randomGuild.id),
  )) as APIApplicationCommand[];
  if (randomGuildCommands.length > 0) {
    await Promise.allSettled(
      // for each guild,
      guilds.map(async (g) => {
        // fetch all commands,
        const commands = (await rest.get(
          Routes.applicationGuildCommands(applicationId, g.id),
        )) as APIApplicationCommand[];
        // and delete each one
        await Promise.allSettled(
          commands.map(async (c) =>
            rest.delete(
              Routes.applicationGuildCommand(applicationId, g.id, c.id),
            ),
          ),
        );
      }),
    );
  }

  const remoteCommands = (await rest.get(
    Routes.applicationCommands(applicationId),
  )) as APIApplicationCommand[];
  const { didCommandsChange, toDelete } = calculateChangedCommands(
    localCommands,
    remoteCommands,
  );

  console.log(
    `Deploying commands…
  local:  ${localCommands.map((c) => c.name).join(",")}
  global: ${remoteCommands.map((c) => c.name).join(",")}
Global commands ${
      didCommandsChange || localCommands.length !== remoteCommands.length
        ? "DID"
        : "DID NOT"
    } change
      ${toDelete.length > 0 ? `  deleting: ${toDelete.join(",")}\n` : ""}`,
  );

  await applyCommandChanges(
    localCommands,
    toDelete,
    didCommandsChange,
    remoteCommands.length,
    () => Routes.applicationCommands(applicationId),
    (commandId: string) => Routes.applicationCommand(applicationId, commandId),
  );
};

export const deployTestCommands = async (
  client: Client,
  localCommands: (ContextMenuCommandBuilder | SlashCommandBuilder)[],
) => {
  // Delete all global commands
  // This shouldn't happen, but ensures a consistent state esp in development
  const globalCommands = (await rest.get(
    Routes.applicationCommands(applicationId),
  )) as APIApplicationCommand[];
  // and delete each one
  await Promise.allSettled(
    globalCommands.map(async (c) =>
      rest.delete(Routes.applicationCommand(applicationId, c.id)),
    ),
  );

  // Deploy directly to all connected guilds
  const guilds = await client.guilds.fetch();
  console.log(`Deploying test commands to ${guilds.size} guilds…`);
  await Promise.all(
    guilds.map(async (guild) => {
      const guildCommands = (await rest.get(
        Routes.applicationGuildCommands(applicationId, guild.id),
      )) as APIApplicationCommand[];

      const changes = calculateChangedCommands(localCommands, guildCommands);
      console.log(
        `${guild.name} (${localCommands.length} local): ${
          changes.didCommandsChange
            ? `Upserting ${localCommands.length} commands.`
            : "No command updates."
        } ${
          changes.toDelete.length > 0
            ? `Deleting ${changes.toDelete.join(", ")}`
            : ""
        }`,
      );
      await applyCommandChanges(
        localCommands,
        changes.toDelete,
        changes.didCommandsChange,
        guildCommands.length,
        () => Routes.applicationGuildCommands(applicationId, guild.id),
        (commandId: string) =>
          Routes.applicationGuildCommand(applicationId, guild.id, commandId),
      );
    }),
  );
};

const withPerf = <T extends AnyCommand>({ command, handler }: T) => {
  return {
    command,
    handler: (interaction: Parameters<T["handler"]>[0]) => {
      trackPerformance(`withPerf HoF ${command.name}`, async () => {
        try {
          // @ts-expect-error Unclear why this isn't working but it seems fine
          await handler(interaction);
        } catch (e) {
          log("debug", `perf`, "rethrowing error", { error: e });
          throw e;
        }
      });
    },
  };
};

const commands = new Map<string, AnyCommand>();
export const registerCommand = (config: AnyCommand | AnyCommand[]) => {
  if (Array.isArray(config)) {
    config.forEach((c) => {
      // @ts-expect-error Higher order functions are weird
      commands.set(c.command.name, withPerf(c));
    });
    return;
  }
  // @ts-expect-error Higher order functions are weird
  commands.set(config.command.name, withPerf(config));
};
const matchCommand = (customId: string) => {
  const config = commands.get(customId);
  if (config) {
    return config;
  }
  const key = [...commands.keys()].find((k) => customId.startsWith(`${k}|`));
  return commands.get(key || "??");
};

import discord, { Intents } from "discord.js";
import automod from "./automod";

export default function init() {
  const bot = new discord.Client({
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MEMBERS,
      Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
      Intents.FLAGS.DIRECT_MESSAGES,
      Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION"],
  });

  console.log("INI", "Bootstrap starting…");
  bot
    .login(process.env.DISCORD_HASH || "")
    .then(async () => {
      console.log("INI", "Bootstrap complete");

      bot.user?.setActivity("server activity…", { type: "WATCHING" });

      try {
        const guilds = await bot.guilds.fetch();
        guilds.each((guild) =>
          console.log("INI", `Bot connected to Discord server: ${guild.name}`),
        );
      } catch (error) {
        console.log("Something went wrong when fetching the guilds: ", error);
      }

      if (bot.application) {
        const { id } = bot.application;
        console.log("Bot started. If necessary, add it to your test server:");
        console.log(
          `https://discord.com/api/oauth2/authorize?client_id=${id}&permissions=8&scope=applications.commands%20bot`,
        );
      }
    })
    .catch((e) => {
      console.log({ e });
      console.log(
        `Failed to log into discord bot. Make sure \`.env.local\` has a discord token. Tried to use '${process.env.DISCORD_HASH}'`,
      );
      console.log(
        'You can get a new discord token at https://discord.com/developers/applications, selecting your bot (or making a new one), navigating to "Bot", and clicking "Copy" under "Click to reveal token"',
      );
      process.exit(1);
    });

  bot.on("ready", () => {
    automod(bot);
  });

  bot.on("messageReactionAdd", () => {});

  bot.on("threadCreate", (thread) => {
    thread.join();
  });

  bot.on("messageCreate", async (msg) => {
    if (msg.author?.id === bot.user?.id) return;

    //
  });

  const errorHandler = (error: unknown) => {
    if (error instanceof Error) {
      console.log("ERROR", error.message);
    } else if (typeof error === "string") {
      console.log("ERROR", error);
    }
  };

  bot.on("error", errorHandler);
  process.on("uncaughtException", errorHandler);
  process.on("unhandledRejection", errorHandler);
}

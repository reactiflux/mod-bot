import { Intents, Client } from "discord.js";
import { ReacordDiscordJs } from "reacord";

export const client = new Client({
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

export const reacord = new ReacordDiscordJs(client);

export const login = () => {
  console.log("INI", "Bootstrap starting…");
  client
    .login(process.env.DISCORD_HASH || "")
    .then(async () => {
      console.log("INI", "Bootstrap complete");

      client.user?.setActivity("server activity…", { type: "WATCHING" });

      try {
        const guilds = await client.guilds.fetch();
        console.log(
          "INI",
          `client connected to Discord server: ${guilds
            .map(({ name }) => name)
            .join(", ")}`,
        );
      } catch (error) {
        console.log("Something went wrong when fetching the guilds: ", error);
      }

      if (client.application) {
        const { id } = client.application;
        console.log(
          "client started. If necessary, add it to your test server:",
        );
        console.log(
          `https://discord.com/oauth2/authorize?client_id=${id}&permissions=8&scope=applications.commands%20bot`,
        );
      }
    })
    .catch((e) => {
      console.log({ e });
      console.log(
        `Failed to log into discord client. Make sure \`.env.local\` has a discord token. Tried to use '${process.env.DISCORD_HASH}'`,
      );
      console.log(
        'You can get a new discord token at https://discord.com/developers/applications, selecting your client (or making a new one), navigating to "client", and clicking "Copy" under "Click to reveal token"',
      );
      process.exit(1);
    });
};

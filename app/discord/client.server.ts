import { GatewayIntentBits, Client, Partials, ActivityType } from "discord.js";
import { ReacordDiscordJs } from "reacord";
import { discordToken } from "~/helpers/env";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

export const reacord = new ReacordDiscordJs(client);

export const login = () => {
  console.log("INI", "Bootstrap starting…");
  client
    .login(discordToken)
    .then(async () => {
      console.log("INI", "Bootstrap complete");

      client.user?.setActivity("server activity…", {
        type: ActivityType.Watching,
      });

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

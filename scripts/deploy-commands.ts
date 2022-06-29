import "dotenv/config";
import { client, login } from "~/discord/client";
import { deployCommands } from "~/discord/deployCommands.server";

login();
client.on("ready", async () => {
  try {
    const guilds = await client.guilds.fetch();
    await Promise.all(
      guilds.map(async (guild) => deployCommands(await guild.fetch())),
    );
    process.exit();
  } catch (e) {
    console.log("DEPLOY EXCEPTION", e as string);
  }
});

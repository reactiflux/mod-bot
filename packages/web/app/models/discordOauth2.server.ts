import { AuthorizationCode, ClientCredentials } from "simple-oauth2";

// redirect(
//     `https://discord.com/api/oauth2/authorize?client_id=968540724322791446&redirect_uri=${}&response_type=code&scope=`
//   );

const config = {
  client: {
    id: process.env.DISCORD_APP_ID || "",
    secret: process.env.DISCORD_SECRET || "",
  },
  auth: {
    tokenHost: "https://discord.com",
    tokenPath: "/api/oauth2/token",
    authorizePath: "/api/oauth2/authorize",
    revokePath: "/api/oauth2/revoke",
  },
};

export const authorization = new AuthorizationCode(config);

export const credentials = new ClientCredentials(config);

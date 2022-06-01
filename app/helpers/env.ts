const enum ENVIONMENTS {
  production = "production",
}

export const applicationKey = process.env.DISCORD_PUBLIC_KEY ?? "";
export const applicationId = process.env.DISCORD_APP_ID ?? "";
export const discordToken = process.env.DISCORD_HASH ?? "";

export const isProd = () => process.env.ENVIRONMENT === ENVIONMENTS.production;

console.log("Running as", isProd() ? "PRODUCTION" : "TEST", "environment");

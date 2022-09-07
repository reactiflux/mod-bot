const enum ENVIONMENTS {
  production = "production",
}

let ok = true;
const getEnv = (key: string, optional = false) => {
  const value = process.env[key];
  if (!value && !optional) {
    console.log(`Add a ${key} value to .env`);
    ok = false;
    return "";
  }
  return value ?? "";
};

export const isProd = () => process.env.ENVIRONMENT === ENVIONMENTS.production;
console.log("Running as", isProd() ? "PRODUCTION" : "TEST", "environment");

export const applicationKey = getEnv("DISCORD_PUBLIC_KEY");
export const applicationId = getEnv("DISCORD_APP_ID");
export const discordToken = getEnv("DISCORD_HASH");

if (!ok) throw new Error("Environment misconfigured");

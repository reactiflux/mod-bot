const enum ENVIRONMENTS {
  production = "production",
  test = "test",
  local = "",
}

let ok = true;
const getEnv = (key: string, optional = false) => {
  const value = process.env[key];
  if (process.env.NODE_ENV === "test") {
    return "";
  }
  if (!value && !optional) {
    console.log(`Add a ${key} value to .env`);
    ok = false;
    return "";
  }
  return value ?? "";
};

export const isProd = () => process.env.NODE_ENV === ENVIRONMENTS.production;
console.log(
  "Running as",
  isProd() ? "PRODUCTION" : "TEST",
  `environment: '${process.env.NODE_ENV}'`,
);

export const databaseUrl = getEnv("DATABASE_URL");
export const sessionSecret = getEnv("SESSION_SECRET");

export const applicationKey = getEnv("DISCORD_PUBLIC_KEY");
export const discordSecret = getEnv("DISCORD_SECRET");
export const applicationId = getEnv("DISCORD_APP_ID");
export const discordToken = getEnv("DISCORD_HASH");
export const testGuild = getEnv("DISCORD_TEST_GUILD");

if (!ok) throw new Error("Environment misconfigured");

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
const defaultConfig = {
  client: "better-sqlite3",
  connection: {
    filename: "./jobs-bot.sqlite3",
  },
  useNullAsDefault: true,
};

export default {
  ...defaultConfig,
  development: {
    ...defaultConfig,
    // seeds: {
    //   directory: "./seeds",
    // },
  },
  test: defaultConfig,
  production: defaultConfig,
};

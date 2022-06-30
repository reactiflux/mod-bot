/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
const defaultConfig = {
  client: "better-sqlite3",
  connection: {
    filename: "./mod-bot.sqlite3",
  },
  useNullAsDefault: true,
};

/**
 * @type { import("./knexfile.d").Knexfile> }
 */
module.exports = {
  development: {
    ...defaultConfig,
    // seeds: {
    //   directory: "./seeds",
    // },
  },
  test: defaultConfig,
  production: {
    ...defaultConfig,
    connection: {
      filename: "/data/mod-bot.sqlite3",
    },
  },
};

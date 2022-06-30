/**
 * @type {(knex: import("knex").Knex) => Promise<any>}
 */
function up(knex) {
  return knex.schema.createTable("guilds", (table) => {
    table.uuid("id").primary();
    table.json("settings");
  });
}

/**
 * @type {(knex: import("knex").Knex) => Promise<any>}
 */
function down(knex) {
  return knex.schema.dropTable("guilds");
}

module.exports = { up, down };

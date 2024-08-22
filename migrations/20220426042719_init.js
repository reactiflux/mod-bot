/**
 * @type {(knex: import("knex").Knex) => Promise<any>}
 */
function up(knex) {
  return knex.schema
    .createTable("users", (table) => {
      table.uuid("id").primary().index().notNullable();
      table.string("email");
      table.string("externalId").notNullable();
      table.string("authProvider").defaultTo("discord");
    })
    .createTable("sessions", (table) => {
      table.uuid("id").primary().index();
      table.json("data");
      table.datetime("expires");
    });
}
/**
 * @type {(knex: import("knex").Knex) => Promise<any>}
 */
function down(knex) {
  return knex.schema.dropTable("users").dropTable("sessions");
}

module.exports = { up, down };

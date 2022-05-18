import type { Knex } from "knex";

function up(knex: Knex) {
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

function down(knex: Knex) {
  return knex.schema.dropTable("users").dropTable("sessions");
}

module.exports = { up, down };

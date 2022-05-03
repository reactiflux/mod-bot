function up(knex) {
  return knex.schema
    .createTable("users", (table) => {
      table.uuid("id").primary().index().notNullable();
    })
    .createTable("sessions", (table) => {
      table.uuid("id").primary().index();
      table.uuid("user_id").index().notNullable();
      table.string("discord_refresh_token", 40).notNullable();
    });
}

function down(knex) {
  return knex.schema.dropTable("users").dropTable("sessions");
}

module.exports = { up, down };

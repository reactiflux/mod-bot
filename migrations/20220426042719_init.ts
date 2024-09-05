import type { Kysely } from "kysely";

export async function up(db: Kysely<any>) {
  db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().notNull())
    .addColumn("email", "text")
    .addColumn("externalId", "text", (c) => c.notNull())
    .addColumn("authProvider", "text", (c) => c.defaultTo("discord"))
    .execute();

  db.schema
    .createTable("sessions")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("data", "json")
    .addColumn("expires", "datetime")
    .execute();
}

export async function down(db: Kysely<any>) {
  return db.schema.dropTable("users").execute();
}

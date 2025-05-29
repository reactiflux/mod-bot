import type { Kysely } from "kysely";

/*
This is needed in order to mig


  knex_migrations
  id, name, batch, migration_time

knex_migrations_lock
index, is_locked

sqlite_sequence
name, seq



kysely_migration
name, timestamp

kysely_migration_lock
id, is_locked
(id is 'migration_lock')
*/

export async function up(db: Kysely<any>): Promise<void> {
  // CREATE TABLE "kysely_migration" ("name" varchar(255) not null primary key, "timestamp" varchar(255) not null)
  // CREATE TABLE "kysely_migration_lock" ("id" varchar(255) not null primary key, "is_locked" integer default 0 not null)
  await db.schema
    .createTable("kysely_migration")
    .ifNotExists()
    .addColumn("name", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("timestamp", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("kysely_migration_lock")
    .ifNotExists()
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("is_locked", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  const query = db
    .selectFrom("kysely_migration_lock")
    .selectAll()
    .where("id", "==", "migration_lock");
  const data = await query.execute();
  if (data.length === 0) {
    await db
      .insertInto("kysely_migration_lock")
      .values({ id: "migration_lock" })
      .execute();
  }

  try {
    await db.schema.dropTable("knex_migrations").ifExists().execute();
    await db.schema.dropTable("knex_migrations_lock").ifExists().execute();
    await db
      .deleteFrom("sqlite_sequence")
      .where("name", "=", "knex_migrations")
      .where("name", "=", "knex_migrations_lock")
      .execute();
  } catch {
    /* fallthrough */
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  // down migration code goes here...
  // note: down migrations are optional. you can safely delete this function.
  // For more info, see: https://kysely.dev/docs/migrations
}

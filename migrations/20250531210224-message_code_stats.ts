import type { Kysely } from "kysely";

const column = "code_stats";

export async function up(db: Kysely<any>) {
  return await db.schema
    .alterTable("message_stats")
    // {
    //   chars: number
    //   words: number
    //   lines: number
    //   lang: string | undefined
    // }[]
    .addColumn(column, "text", (c) => c.notNull().defaultTo("[]"))
    .execute();
}

export async function down(db: Kysely<any>) {
  return db.schema.alterTable("message_stats").dropColumn(column).execute();
}

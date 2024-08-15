import { randomUUID } from "crypto";

import type { DB } from "~/db.server";
import db from "~/db.server";

export type User = DB["users"];

export async function getUserById(id: User["id"]) {
  return db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function getUserByExternalId(externalId: User["externalId"]) {
  return await db
    .selectFrom("users")
    .selectAll()
    .where("externalId", "=", externalId)
    .executeTakeFirst();
}

export async function getUserByEmail(email: User["email"]) {
  return await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}

export async function createUser(
  email: User["email"],
  externalId: User["externalId"],
) {
  const out = await db
    .insertInto("users")
    .values([
      {
        id: randomUUID(),
        email,
        externalId,
        authProvider: "discord",
      },
    ])
    .returningAll()
    .executeTakeFirstOrThrow();
  return out.id;
}

export async function deleteUserByEmail(email: User["email"]) {
  return db.deleteFrom("users").where("email", "=", email).execute();
}

import { randomUUID } from "crypto";
import type { Users } from "kysely-codegen";

import db from "~/db.server";

export async function getUserById(id: Users["id"]) {
  return db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function getUserByExternalId(externalId: Users["externalId"]) {
  return await db
    .selectFrom("users")
    .selectAll()
    .where("externalId", "=", externalId)
    .executeTakeFirst();
}

export async function getUserByEmail(email: Users["email"]) {
  return await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}

export async function createUser(
  email: Users["email"],
  externalId: Users["externalId"],
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

export async function deleteUserByEmail(email: Users["email"]) {
  return db.deleteFrom("users").where("email", "=", email).execute();
}

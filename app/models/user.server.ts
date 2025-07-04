import { randomUUID } from "crypto";

import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";

export type User = DB["users"];

export async function getUserById(id: User["id"]) {
  return trackPerformance(
    "getUserById",
    async () => {
      log("debug", "User", "Fetching user by ID", { userId: id });

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      log("debug", "User", user ? "User found" : "User not found", {
        userId: id,
        userExists: !!user,
        email: user?.email,
        authProvider: user?.authProvider,
      });

      return user;
    },
    { userId: id },
  );
}

export async function getUserByExternalId(externalId: User["externalId"]) {
  return trackPerformance(
    "getUserByExternalId",
    async () => {
      log("debug", "User", "Fetching user by external ID", { externalId });

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("externalId", "=", externalId)
        .executeTakeFirst();

      log(
        "debug",
        "User",
        user ? "User found by external ID" : "User not found by external ID",
        {
          externalId,
          userExists: !!user,
          userId: user?.id,
          email: user?.email,
          authProvider: user?.authProvider,
        },
      );

      return user;
    },
    { externalId },
  );
}

export async function getUserByEmail(email: User["email"]) {
  return trackPerformance(
    "getUserByEmail",
    async () => {
      log("debug", "User", "Fetching user by email", { email });

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();

      log(
        "debug",
        "User",
        user ? "User found by email" : "User not found by email",
        {
          email,
          userExists: !!user,
          userId: user?.id,
          authProvider: user?.authProvider,
        },
      );

      return user;
    },
    { email },
  );
}

export async function createUser(
  email: User["email"],
  externalId: User["externalId"],
) {
  return trackPerformance(
    "createUser",
    async () => {
      log("info", "User", "Creating new user", {
        email,
        externalId,
        authProvider: "discord",
      });

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

      log("info", "User", "User created successfully", {
        userId: out.id,
        email: out.email,
        externalId: out.externalId,
        authProvider: out.authProvider,
      });

      return out.id;
    },
    { email, externalId },
  );
}

export async function deleteUserByEmail(email: User["email"]) {
  return db.deleteFrom("users").where("email", "=", email).execute();
}

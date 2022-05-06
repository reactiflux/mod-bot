import { randomUUID } from "crypto";

import knex from "~/db.server";

export interface User {
  id: string;
  email: string;
  externalId: string;
  authProvider: "discord";
}

export async function getUserById(id: User["id"]) {
  return knex<User>("users").select().where({ id }).first();
}

export async function getUserByExternalId(externalId: User["externalId"]) {
  return await knex<User>("users").select().where({ externalId }).first();
}

export async function getUserByEmail(email: User["email"]) {
  return await knex<User>("users").select().where({ email }).first();
}

export async function createUser(
  email: User["email"],
  externalId: User["externalId"]
) {
  const out = await knex<User>("users").insert(
    {
      id: randomUUID(),
      email,
      externalId,
      authProvider: "discord",
    },
    ["id"]
  );
  return out.at(0)?.id;
}

export async function deleteUserByEmail(email: User["email"]) {
  return knex("users").where({ email }).delete();
}

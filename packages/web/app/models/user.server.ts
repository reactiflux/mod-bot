import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

import knex from "~/db.server";

export interface Password {
  // TODO
  hash: string;
}
export interface User {
  // TODO
  id: string;
  email: string;
  externalId: string;
  authProvider: "discord";
}

export async function getUserById(id: User["id"]) {
  return (await knex("users").select())[0] as User;
  // return (await knex("users").select().where({ id }).limit(1))[0] as User;
}

export async function getUserByEmail(email: User["email"]) {
  return knex("users").select().where({ email });
}

export async function createUser(
  email: User["email"],
  externalId: User["externalId"]
) {
  const out = await knex("users").insert({
    id: randomUUID(),
    email,
    externalId,
    authProvider: "discord",
  });
  return out.at(0);
}

export async function deleteUserByEmail(email: User["email"]) {
  return knex("users").where({ email }).delete();
}

export async function verifyLogin(
  email: User["email"],
  password: Password["hash"]
) {}
//   const userWithPassword = await knex.user.findUnique({
//     where: { email },
//     include: {
//       password: true,
//     },
//   });

//   if (!userWithPassword || !userWithPassword.password) {
//     return null;
//   }

//   const isValid = await bcrypt.compare(
//     password,
//     userWithPassword.password.hash
//   );

//   if (!isValid) {
//     return null;
//   }

//   const { password: _password, ...userWithoutPassword } = userWithPassword;

//   return userWithoutPassword;
// }

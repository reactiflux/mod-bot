import knex from "knex";
// @ts-expect-error because this isn't a typed file
import knexfile from "~/../knexfile";
export { SqliteError } from "better-sqlite3";

const environment = process.env.NODE_ENV || ("development" as const);
// @ts-nocheck
const config: {
  client: string;
  connection: {
    filename: string;
  };
  useNullAsDefault: boolean;
} = (knexfile as any)[environment];

export default knex(config);

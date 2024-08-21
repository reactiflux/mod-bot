import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface Guilds {
  id: string | null;
  settings: string | null;
}

export interface Sessions {
  data: string | null;
  expires: string | null;
  id: string | null;
}

export interface Users {
  authProvider: Generated<string | null>;
  email: string | null;
  externalId: string;
  id: string;
}

export interface DB {
  guilds: Guilds;
  sessions: Sessions;
  users: Users;
}

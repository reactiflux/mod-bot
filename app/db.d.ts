import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface Guilds {
  id: string | null;
  settings: string | null;
}

export interface MessageStats {
  author_id: string;
  channel_category: string | null;
  channel_id: string;
  char_count: number;
  guild_id: string;
  message_id: string | null;
  react_count: Generated<number>;
  recipient_id: string | null;
  sent_at: string;
  word_count: number;
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
  message_stats: MessageStats;
  sessions: Sessions;
  users: Users;
}

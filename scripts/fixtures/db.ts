/**
 * Standalone database connection for fixture scripts.
 * This module duplicates the app's db.server.ts to avoid dependency on the app's module system.
 * This allows scripts to run with `node --experimental-strip-types`.
 */

import SQLite from "better-sqlite3";
import {
  Kysely,
  ParseJSONResultsPlugin,
  SqliteDialect,
  type ColumnType,
} from "kysely";

// Database URL from environment
const databaseUrl = process.env.DATABASE_URL ?? "./mod-bot.sqlite3";

// Type definitions (copied from app/db.d.ts)
type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

interface ChannelInfo {
  category: string | null;
  id: string | null;
  name: string | null;
}

interface EscalationRecords {
  escalation_id: string;
  id: string;
  vote: string;
  voted_at: Generated<string>;
  voter_id: string;
}

interface Escalations {
  created_at: Generated<string>;
  flags: string;
  guild_id: string;
  id: string;
  initiator_id: string;
  reported_user_id: string;
  resolution: string | null;
  resolved_at: string | null;
  thread_id: string;
  vote_message_id: string;
}

interface Guilds {
  id: string | null;
  settings: string | null;
}

interface GuildSubscriptions {
  created_at: Generated<string | null>;
  current_period_end: string | null;
  guild_id: string | null;
  product_tier: Generated<string>;
  status: Generated<string>;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: Generated<string | null>;
}

interface HoneypotConfig {
  channel_id: string;
  guild_id: string;
}

interface MessageStats {
  author_id: string;
  channel_category: string | null;
  channel_id: string;
  char_count: number;
  code_stats: Generated<string>;
  guild_id: string;
  link_stats: Generated<string>;
  message_id: string | null;
  react_count: Generated<number>;
  recipient_id: string | null;
  sent_at: number;
  word_count: number;
}

interface ReactjiChannelerConfig {
  channel_id: string;
  configured_by_id: string;
  created_at: Generated<string>;
  emoji: string;
  guild_id: string;
  id: string;
  threshold: Generated<number>;
}

interface ReportedMessages {
  created_at: Generated<string>;
  deleted_at: string | null;
  extra: string | null;
  guild_id: string;
  id: string;
  log_channel_id: string;
  log_message_id: string;
  reason: string;
  reported_channel_id: string;
  reported_message_id: string;
  reported_user_id: string;
  staff_id: string | null;
  staff_username: string | null;
}

interface Sessions {
  data: string | null;
  expires: string | null;
  id: string | null;
}

interface TicketsConfig {
  channel_id: string | null;
  message_id: string;
  role_id: string;
}

interface Users {
  authProvider: Generated<string | null>;
  email: string | null;
  externalId: string;
  id: string;
}

interface UserThreads {
  created_at: Generated<string>;
  guild_id: string;
  thread_id: string;
  user_id: string;
}

interface DB {
  channel_info: ChannelInfo;
  escalation_records: EscalationRecords;
  escalations: Escalations;
  guild_subscriptions: GuildSubscriptions;
  guilds: Guilds;
  honeypot_config: HoneypotConfig;
  message_stats: MessageStats;
  reactji_channeler_config: ReactjiChannelerConfig;
  reported_messages: ReportedMessages;
  sessions: Sessions;
  tickets_config: TicketsConfig;
  user_threads: UserThreads;
  users: Users;
}

// Create database connection
console.log(`[fixtures] Connecting to database at ${databaseUrl}`);

const dialect = new SqliteDialect({
  database: new SQLite(databaseUrl),
});

const db = new Kysely<DB>({
  dialect,
  plugins: [new ParseJSONResultsPlugin()],
});

export default db;
export type { DB };

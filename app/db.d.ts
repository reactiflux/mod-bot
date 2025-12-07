import type { ColumnType } from "kysely";

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export interface ChannelInfo {
  category: string | null;
  id: string | null;
  name: string | null;
}

export interface Guilds {
  id: string | null;
  settings: string | null;
}

export interface GuildSubscriptions {
  created_at: Generated<string | null>;
  current_period_end: string | null;
  guild_id: string | null;
  product_tier: Generated<string>;
  status: Generated<string>;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: Generated<string | null>;
}

export interface HoneypotConfig {
  channel_id: string;
  guild_id: string;
}

export interface MessageStats {
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

export interface ReportedMessages {
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

export interface Sessions {
  data: string | null;
  expires: string | null;
  id: string | null;
}

export interface TicketsConfig {
  channel_id: string | null;
  message_id: string;
  role_id: string;
}

export interface Users {
  authProvider: Generated<string | null>;
  email: string | null;
  externalId: string;
  id: string;
}

export interface UserThreads {
  created_at: Generated<string>;
  guild_id: string;
  thread_id: string;
  user_id: string;
}

export interface DB {
  channel_info: ChannelInfo;
  guild_subscriptions: GuildSubscriptions;
  guilds: Guilds;
  honeypot_config: HoneypotConfig;
  message_stats: MessageStats;
  reported_messages: ReportedMessages;
  sessions: Sessions;
  tickets_config: TicketsConfig;
  user_threads: UserThreads;
  users: Users;
}

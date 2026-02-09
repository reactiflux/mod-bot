/**
 * In-memory recent activity tracker for velocity-based spam detection.
 * Mutable Map with plain functions — no Effect, no async.
 *
 * State is created inside the SpamDetectionService Layer and lives
 * for the bot's lifetime.
 */

export interface RecentMessage {
  messageId: string;
  channelId: string;
  /** Hash of normalized content for duplicate detection */
  contentHash: string;
  timestamp: number;
  hasLink: boolean;
}

interface UserActivity {
  messages: RecentMessage[];
}

/** Map key is `${guildId}:${userId}` */
export type ActivityMap = Map<string, UserActivity>;

const MAX_MESSAGES_PER_USER = 20;

function makeKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

/** Record a new message for a user */
export function recordMessage(
  tracker: ActivityMap,
  guildId: string,
  userId: string,
  msg: RecentMessage,
): void {
  const key = makeKey(guildId, userId);
  let activity = tracker.get(key);
  if (!activity) {
    activity = { messages: [] };
    tracker.set(key, activity);
  }

  activity.messages.push(msg);

  // Keep bounded — circular buffer behavior
  if (activity.messages.length > MAX_MESSAGES_PER_USER) {
    activity.messages = activity.messages.slice(-MAX_MESSAGES_PER_USER);
  }
}

/** Get recent messages for a user in a guild */
export function getRecentMessages(
  tracker: ActivityMap,
  guildId: string,
  userId: string,
): RecentMessage[] {
  const key = makeKey(guildId, userId);
  return tracker.get(key)?.messages ?? [];
}

/** Remove entries older than maxAge (in ms) */
export function cleanupTracker(tracker: ActivityMap, maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, activity] of tracker) {
    activity.messages = activity.messages.filter((m) => m.timestamp > cutoff);
    if (activity.messages.length === 0) {
      tracker.delete(key);
    }
  }
}

# Simplified Schema Analysis - 2025-07-25

## Proposed Simple Schema

```sql
reported_messages (
  id UUID PRIMARY KEY,
  reported_message_id TEXT NOT NULL,        -- Original Discord message ID
  reported_channel_id TEXT NOT NULL,        -- Where original message lives
  reported_user_id TEXT NOT NULL,           -- Who sent the original message
  guild_id TEXT NOT NULL,                   -- Which guild

  log_message_id TEXT NOT NULL,             -- Mod-log entry Discord message ID
  log_channel_id TEXT NOT NULL,             -- Thread/channel where log lives

  reason TEXT NOT NULL,                     -- ReportReasons enum
  staff_id TEXT,                            -- Who made the report (nullable for anon)
  staff_username TEXT,
  extra TEXT,                               -- Additional context

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_reported_user_guild (reported_user_id, guild_id),
  INDEX idx_reported_message (reported_message_id),
)
```

## Analysis - Does This Work?

### ✅ **Preserves Message Content**

- Store `reported_message_id` → fetch content on-demand from Discord
- No duplicate storage = cheaper
- Content always fresh (handles edits/deletes gracefully)

### ✅ **Handles Rate Limits Well**

- **Moderator review**: Fetch on-demand as moderators click through
- **Bulk operations**: Could batch if needed, but small scale

### ✅ **Report Counting**

```sql
-- Total reports for user
SELECT COUNT(*) FROM reported_messages
WHERE reported_user_id = ? AND guild_id = ?

-- Unique messages reported
SELECT COUNT(DISTINCT reported_message_id) FROM reported_messages
WHERE reported_user_id = ? AND guild_id = ?
```

### ✅ **Delete All Messages Implementation**

```sql
-- Get all reported messages for user
SELECT reported_message_id, reported_channel_id
FROM reported_messages
WHERE reported_user_id = ? AND guild_id = ?

-- Then: channel.messages.fetch(messageId).delete() for each
```

## Questions/Potential Issues

### 1. **Content Grouping Loss**

**Current behavior**: Similar messages grouped together, one log entry gets edited
**New behavior**: Each report = separate log entry

**Is this okay?** Might actually be cleaner - each report stands alone.

### 2. **Message Deletion Edge Cases**

**Scenario**: Original Discord message gets deleted before we can fetch it
**Solutions**:

- Graceful failure in `deleteAllReported`
- Consider storing a backup content hash for critical cases

### 3. **Rate Limit Batching**

**For "delete all messages"**: Could hit rate limits with 20+ messages
**Solutions**:

- Batch delete operations
- Add retry logic with exponential backoff
- Consider per-guild rate limiting

### 4. **Log Message Tracking**

**Question**: Do we need to track which log messages to delete/edit?
**Current**: `deleteAllReported` deletes ORIGINAL messages, not log messages
**Answer**: Probably not needed for this use case

## Revised Implementation

### Database Functions

```typescript
// Replace TTL cache entirely
export async function recordReport(data: {
  reportedMessageId: string;
  reportedChannelId: string;
  reportedUserId: string;
  guildId: string;
  logMessageId: string;
  logChannelId: string;
  reason: ReportReasons;
  staffId?: string;
  staffUsername?: string;
  extra?: string;
}): Promise<void>;

export async function getReportsForUser(
  userId: string,
  guildId: string,
): Promise<ReportRecord[]>;

export async function deleteAllOriginalMessages(
  userId: string,
  guildId: string,
): Promise<void>;
```

### Replace TTL Cache Functions

```typescript
// OLD: queryReportCache(message)
// NEW: getReportsForMessage(messageId, guildId)
export async function getReportsForMessage(messageId: string, guildId: string) {
  return db
    .selectFrom("reported_messages")
    .selectAll()
    .where("reported_message_id", "=", messageId)
    .where("guild_id", "=", guildId)
    .execute();
}

// OLD: queryCacheMetadata(message)
// NEW: getUserReportStats(userId, guildId)
export async function getUserReportStats(userId: string, guildId: string) {
  const [totalReports, uniqueMessages] = await Promise.all([
    db
      .selectFrom("reported_messages")
      .select(db.fn.count("id").as("count"))
      .where("reported_user_id", "=", userId)
      .where("guild_id", "=", guildId)
      .executeTakeFirstOrThrow(),

    db
      .selectFrom("reported_messages")
      .select(db.fn.countDistinct("reported_message_id").as("count"))
      .where("reported_user_id", "=", userId)
      .where("guild_id", "=", guildId)
      .executeTakeFirstOrThrow(),
  ]);

  return {
    reportCount: Number(totalReports.count),
    uniqueMessages: Number(uniqueMessages.count),
    // Could add uniqueChannels if needed
  };
}

// OLD: deleteAllReported(message)
// NEW: deleteAllReportedForUser(userId, guildId)
export async function deleteAllReportedForUser(
  userId: string,
  guildId: string,
) {
  const reports = await getReportsForUser(userId, guildId);

  await Promise.allSettled(
    reports.map(async (report) => {
      try {
        const channel = await client.channels.fetch(report.reported_channel_id);
        const message = await channel.messages.fetch(
          report.reported_message_id,
        );
        return message.delete();
      } catch (error) {
        console.warn(
          `Failed to delete message ${report.reported_message_id}:`,
          error,
        );
      }
    }),
  );
}
```

## Migration Strategy

No migration is possible, because complete data loss occurs when deploying new code. The old data is ephemeral though so that's inevitable.

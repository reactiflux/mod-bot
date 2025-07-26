# Final Implementation Plan - Persistent Escalation Controls - 2025-07-25

## Updated Schema (Based on User Corrections)

### Single Table: `reported_messages`

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
  INDEX idx_reported_message (reported_message_id)
)
```

**Key Changes:**

- ✅ **No expiration** - keep persistent record of everything
- ✅ **No escalation_contexts table** - use customId with user_id instead

## Button Implementation Strategy

### Custom ID Pattern

```typescript
// Button creation
customId: `escalate-delete-${reportedUserId}`;
customId: `escalate-kick-${reportedUserId}`;
customId: `escalate-ban-${reportedUserId}`;
```

### Handler Context Extraction

```typescript
async handler(interaction) {
  // Extract from customId
  const reportedUserId = interaction.customId.split('-')[2];

  // Get from interaction context
  const guildId = interaction.guildId;
  const threadId = interaction.channelId;

  // Get from settings
  const { moderator: modRoleId } = await fetchSettings(guildId, [SETTINGS.moderator]);

  // Now we have all needed context: reportedUserId, guildId, threadId, modRoleId
}
```

## Implementation Steps

### Phase 1: Database Setup

1. **Create migration** for `reported_messages` table
2. **Create model** with database functions
3. **Generate TypeScript types**

### Phase 2: Replace TTL Cache

1. **Update modLog.ts** to use database instead of TTL cache
2. **Replace functions**:
   - `trackReport()` → `recordReport()`
   - `queryReportCache()` → `getReportsForMessage()`
   - `queryCacheMetadata()` → `getUserReportStats()`
   - `deleteAllReported()` → `deleteAllReportedForUser()`

### Phase 3: Native Discord Components

1. **Create component handlers** following setupTickets.ts pattern
2. **Update escalationControls()** to use ButtonBuilder with customId
3. **Remove Reacord dependency** from escalation controls

### Phase 4: Test and Deploy

1. **Test button persistence** across server restarts
2. **Test delete functionality** with database lookup
3. **Verify statistics** still work correctly

## Detailed Implementation

### 1. Database Migration

```typescript
// migrations/YYYYMMDDHHMMSS_reported_messages.ts
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("reported_messages")
    .addColumn("id", "uuid", (c) => c.primaryKey().notNull())
    .addColumn("reported_message_id", "text", (c) => c.notNull())
    .addColumn("reported_channel_id", "text", (c) => c.notNull())
    .addColumn("reported_user_id", "text", (c) => c.notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("log_message_id", "text", (c) => c.notNull())
    .addColumn("log_channel_id", "text", (c) => c.notNull())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("staff_id", "text")
    .addColumn("staff_username", "text")
    .addColumn("extra", "text")
    .addColumn("created_at", "datetime", (c) =>
      c.defaultTo("CURRENT_TIMESTAMP").notNull(),
    )
    .execute();

  await db.schema
    .createIndex("idx_reported_user_guild")
    .on("reported_messages")
    .columns(["reported_user_id", "guild_id"])
    .execute();

  await db.schema
    .createIndex("idx_reported_message")
    .on("reported_messages")
    .columns(["reported_message_id"])
    .execute();
}
```

### 2. Database Model

```typescript
// app/models/reportedMessages.server.ts
import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";
import { ReportReasons } from "#~/models/reportedMessages.server";

export type ReportedMessage = DB["reported_messages"];

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
}): Promise<void> {
  return trackPerformance(
    "recordReport",
    async () => {
      log("info", "ReportedMessage", "Recording report", {
        reportedUserId: data.reportedUserId,
        guildId: data.guildId,
        reason: data.reason,
      });

      await db
        .insertInto("reported_messages")
        .values({
          id: crypto.randomUUID(),
          reported_message_id: data.reportedMessageId,
          reported_channel_id: data.reportedChannelId,
          reported_user_id: data.reportedUserId,
          guild_id: data.guildId,
          log_message_id: data.logMessageId,
          log_channel_id: data.logChannelId,
          reason: data.reason,
          staff_id: data.staffId,
          staff_username: data.staffUsername,
          extra: data.extra,
        })
        .execute();

      log("info", "ReportedMessage", "Report recorded", {
        reportedUserId: data.reportedUserId,
        guildId: data.guildId,
      });
    },
    { reportedUserId: data.reportedUserId, guildId: data.guildId },
  );
}

export async function getReportsForUser(userId: string, guildId: string) {
  return trackPerformance(
    "getReportsForUser",
    async () => {
      log("debug", "ReportedMessage", "Fetching reports for user", {
        userId,
        guildId,
      });

      const reports = await db
        .selectFrom("reported_messages")
        .selectAll()
        .where("reported_user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .execute();

      log("debug", "ReportedMessage", `Found ${reports.length} reports`, {
        userId,
        guildId,
      });
      return reports;
    },
    { userId, guildId },
  );
}

export async function getUserReportStats(userId: string, guildId: string) {
  return trackPerformance(
    "getUserReportStats",
    async () => {
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

      const stats = {
        reportCount: Number(totalReports.count),
        uniqueMessages: Number(uniqueMessages.count),
        uniqueChannels: 0, // Could implement if needed
        allReports: [], // Legacy compatibility
      };

      log("debug", "ReportedMessage", "Calculated stats", {
        userId,
        guildId,
        stats,
      });
      return stats;
    },
    { userId, guildId },
  );
}

export async function deleteAllReportedForUser(
  userId: string,
  guildId: string,
) {
  return trackPerformance(
    "deleteAllReportedForUser",
    async () => {
      log("info", "ReportedMessage", "Deleting all reported messages", {
        userId,
        guildId,
      });

      const reports = await getReportsForUser(userId, guildId);

      const deleteResults = await Promise.allSettled(
        reports.map(async (report) => {
          try {
            const channel = await client.channels.fetch(
              report.reported_channel_id,
            );
            const message = await channel.messages.fetch(
              report.reported_message_id,
            );
            await message.delete();
            log("debug", "ReportedMessage", "Deleted message", {
              messageId: report.reported_message_id,
            });
          } catch (error) {
            log("warn", "ReportedMessage", "Failed to delete message", {
              messageId: report.reported_message_id,
              error: error.message,
            });
          }
        }),
      );

      const deleted = deleteResults.filter(
        (r) => r.status === "fulfilled",
      ).length;
      log("info", "ReportedMessage", "Deletion complete", {
        userId,
        guildId,
        total: reports.length,
        deleted,
      });
    },
    { userId, guildId },
  );
}
```

### 3. Update escalationControls

```typescript
// app/helpers/escalate.tsx - NEW native implementation
export async function escalationControls(
  reportedMessage: Message,
  thread: ThreadChannel,
  modRoleId: string,
) {
  const reportedUserId = reportedMessage.author.id;

  await thread.send({
    content: "Moderator controls",
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-delete-${reportedUserId}`)
          .setLabel("Delete all reported messages")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`escalate-kick-${reportedUserId}`)
          .setLabel("Kick")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`escalate-ban-${reportedUserId}`)
          .setLabel("Ban")
          .setStyle(ButtonStyle.Secondary),
      ),

      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-restrict-${reportedUserId}`)
          .setLabel("Restrict")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`escalate-timeout-${reportedUserId}`)
          .setLabel("Timeout")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}
```

### 4. Component Handlers

```typescript
// Add to existing command exports
export const EscalationCommands = [
  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-delete",
    },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("-")[2];
      const guildId = interaction.guildId!;

      // Permission check
      const member = await interaction.guild!.members.fetch(
        interaction.user.id,
      );
      if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
          content: "Insufficient permissions",
          ephemeral: true,
        });
      }

      await deleteAllReportedForUser(reportedUserId, guildId);
      await interaction.reply(
        `Messages deleted by ${interaction.user.username}`,
      );
    },
  },

  {
    command: { type: InteractionType.MessageComponent, name: "escalate-kick" },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("-")[2];
      const { moderator: modRoleId } = await fetchSettings(
        interaction.guildId!,
        [SETTINGS.moderator],
      );

      if (!interaction.member?.roles?.includes(modRoleId)) {
        return interaction.reply({
          content: "Insufficient permissions",
          ephemeral: true,
        });
      }

      const reportedMember =
        await interaction.guild!.members.fetch(reportedUserId);
      await Promise.allSettled([
        reportedMember.kick(),
        interaction.reply(
          `<@${reportedUserId}> kicked by ${interaction.user.username}`,
        ),
      ]);
    },
  },

  // ... other handlers for ban, restrict, timeout
] as Array<MessageComponentCommand>;
```

## Benefits of This Approach

1. ✅ **Simpler**: No complex escalation context table
2. ✅ **Persistent**: Works across server restarts
3. ✅ **Efficient**: Only store essential IDs, fetch content on-demand
4. ✅ **Follows patterns**: Same approach as setupTickets.ts
5. ✅ **Permanent records**: No artificial expiration of reports

## Ready to Implement?

This plan addresses all the requirements:

- Persistent button handlers ✅
- Database-backed report tracking ✅
- Simplified schema ✅
- No unnecessary context storage ✅
- Permanent audit trail ✅

Should we proceed with Phase 1 (database setup)?

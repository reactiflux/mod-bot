# Persistent Escalation Controls Implementation Plan - 2025-07-25

## Overview

Convert Reacord-based escalation controls to persistent Discord.js components using database-backed report caching, following the setupTickets.ts pattern.

## Phase 1: Database Schema for Report Caching

### New Tables

#### `reported_messages`

Replace TTL cache with persistent storage

```sql
reported_messages (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  message_content TEXT,
  message_link TEXT,
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME, -- TTL equivalent
  INDEX idx_user_guild (user_id, guild_id),
  INDEX idx_expires (expires_at)
)
```

#### `report_entries`

Individual reports for each message

```sql
report_entries (
  id UUID PRIMARY KEY,
  reported_message_id UUID REFERENCES reported_messages(id),
  reason TEXT NOT NULL, -- ReportReasons enum
  staff_id TEXT, -- User ID who made report (nullable for anonymous)
  staff_username TEXT,
  extra TEXT, -- Additional context
  log_message_id TEXT, -- Discord message ID of the log entry
  log_channel_id TEXT, -- Thread/channel where log was posted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `escalation_contexts`

Store context for persistent button handlers

```sql
escalation_contexts (
  id UUID PRIMARY KEY,
  thread_id TEXT NOT NULL,
  reported_message_id UUID REFERENCES reported_messages(id),
  mod_role_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+7 days')),
  INDEX idx_thread (thread_id),
  INDEX idx_expires (expires_at)
)
```

## Phase 2: Database Models and Migration

### Migration Strategy

1. **Dual-write period**: Write to both TTL cache AND database
2. **Background migration**: Convert existing TTL cache entries to database
3. **Read preference**: Try database first, fallback to TTL cache
4. **Cleanup period**: Remove TTL cache after validation

### Model Functions

```typescript
// app/models/reportedMessages.server.ts
export interface ReportedMessage {
  id: string;
  user_id: string;
  guild_id: string;
  // ... other fields
}

export async function getReportedMessagesForUser(
  userId: string,
  guildId: string,
);
export async function createReportedMessage(data: ReportedMessageData);
export async function addReportEntry(
  reportedMessageId: string,
  report: ReportEntryData,
);
export async function deleteReportedMessages(reportedMessageId: string);
export async function createEscalationContext(data: EscalationContextData);
export async function getEscalationContext(contextId: string);
```

## Phase 3: Replace Reacord with Native Discord Components

### Current vs New Pattern

**Current (Reacord):**

```tsx
reacord.createChannelMessage(thread.id).render(
  <Button
    onClick={async (e) => {
      deleteAllReported(reportedMessage);
    }}
  />,
);
```

**New (Native Discord.js):**

```typescript
// In escalationControls function
const contextId = await createEscalationContext({
  thread_id: thread.id,
  reported_message_id: reportedMessage.id,
  mod_role_id: modRoleId,
});

await thread.send({
  content: "Moderator controls",
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`escalate-delete-${contextId}`)
        .setLabel("Delete all reported messages")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`escalate-kick-${contextId}`)
        .setLabel("Kick")
        .setStyle(ButtonStyle.Secondary),
      // ... other buttons
    ),
  ],
});
```

### Component Handlers

```typescript
// Add to existing command structure
export const EscalationCommands = [
  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-delete",
    },
    handler: async (interaction) => {
      const contextId = interaction.customId.split("-")[2];
      const context = await getEscalationContext(contextId);
      // Implement delete logic
    },
  },
  {
    command: { type: InteractionType.MessageComponent, name: "escalate-kick" },
    handler: async (interaction) => {
      // Implement kick logic
    },
  },
  // ... other handlers
] as Array<MessageComponentCommand>;
```

## Phase 4: Implement Delete All Messages Logic

### New Implementation Strategy

**Replace TTL cache dependency:**

```typescript
// Old: deleteAllReported(reportedMessage)
// New: deleteAllReportedById(reportedMessageId)

export async function deleteAllReportedById(reportedMessageId: string) {
  const reportEntries = await getReportEntriesForMessage(reportedMessageId);

  await Promise.allSettled([
    // Delete Discord messages
    ...reportEntries.map(async (entry) => {
      try {
        const channel = await client.channels.fetch(entry.log_channel_id);
        const message = await channel.messages.fetch(entry.log_message_id);
        return message.delete();
      } catch (error) {
        console.warn(
          `Failed to delete message ${entry.log_message_id}:`,
          error,
        );
      }
    }),

    // Mark as deleted in database
    markReportedMessageDeleted(reportedMessageId),
  ]);
}
```

**Handler implementation:**

```typescript
async handler(interaction) {
  const contextId = interaction.customId.split('-')[2];
  const context = await getEscalationContext(contextId);

  if (!context) {
    return interaction.reply({ content: "Context expired", ephemeral: true });
  }

  // Permission check
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return interaction.reply({ content: "Insufficient permissions", ephemeral: true });
  }

  await deleteAllReportedById(context.reported_message_id);
  await interaction.reply(`Messages deleted by ${interaction.user.username}`);
}
```

## Phase 5: Migration from modLog.ts

### Update reportUser function

```typescript
// Replace TTL cache calls with database calls
export const reportUser = async ({ reason, message, extra, staff }) => {
  // ... existing logic ...

  // Replace trackReport(warningMessage, newReport)
  const reportedMsg = await getOrCreateReportedMessage({
    user_id: message.author.id,
    guild_id: message.guild.id,
    channel_id: message.channel.id,
    message_id: message.id,
    message_content: message.content,
    message_link: constructDiscordLink(message),
  });

  await addReportEntry(reportedMsg.id, {
    reason,
    staff_id: staff?.id,
    staff_username: staff?.username,
    extra,
    log_message_id: logMessage.id,
    log_channel_id: thread.id,
  });

  // ... rest of logic ...
};
```

### Update escalationControls function

```typescript
export async function escalationControls(
  reportedMessage: Message,
  thread: ThreadChannel,
  modRoleId: string,
) {
  // Get or create reported message record
  const reportedMsg = await getReportedMessageByDiscordId(
    reportedMessage.id,
    reportedMessage.guild.id,
  );

  if (!reportedMsg) {
    throw new Error("Reported message not found in database");
  }

  // Create escalation context
  const contextId = await createEscalationContext({
    thread_id: thread.id,
    reported_message_id: reportedMsg.id,
    mod_role_id: modRoleId,
  });

  // Send native Discord components
  await thread.send({
    content: "Moderator controls",
    components: [
      /* ... native buttons ... */
    ],
  });
}
```

## Phase 6: Testing and Rollout

### Testing Strategy

1. **Unit tests**: Database models and functions
2. **Integration tests**: Button handlers and context flow
3. **Manual testing**: Server restart scenarios
4. **Gradual rollout**: Test in development first

### Rollback Plan

- Keep TTL cache alongside database during transition
- Feature flag to switch between old/new systems
- Database migration can be reversed if needed

### Performance Considerations

- Index on frequently queried columns (user_id, guild_id)
- Cleanup job for expired records
- Monitor database size and query performance

## Acceptance Criteria

✅ **Functionality**

- All escalation buttons work after server restart
- "Delete all reported messages" works with database lookup
- Permission checks work correctly
- Error handling for missing context

✅ **Data Integrity**

- No data loss during migration from TTL cache
- Report history remains accurate
- Context expiration works correctly

✅ **Performance**

- Button interactions respond within 2 seconds
- Database queries are optimized
- No memory leaks from abandoned contexts

✅ **Maintainability**

- Code follows existing patterns (setupTickets.ts)
- Clear separation between Discord logic and database logic
- Comprehensive logging and error handling

## Estimated Effort

- **Phase 1-2 (Database)**: 1-2 days
- **Phase 3-4 (Components)**: 2-3 days
- **Phase 5 (Migration)**: 1-2 days
- **Phase 6 (Testing)**: 1 day
- **Total**: 5-8 days

This plan maintains all existing functionality while providing persistence across server restarts and better long-term maintainability.

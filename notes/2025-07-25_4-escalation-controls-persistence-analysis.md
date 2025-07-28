# Escalation Controls Persistence Analysis - 2025-07-25

## Problem

Current escalation controls use Reacord with in-memory `onClick` handlers that break when the server restarts. Need to implement persistent button handlers like `setupTickets.ts`.

## Current Implementation Analysis

### Reacord Approach (escalate.tsx)

```tsx
reacord.createChannelMessage(thread.id).render(
  <Button
    onClick={async (e) => {
      /* handler logic */
    }}
  />,
);
```

- **Problem**: `onClick` handlers are in-memory functions
- **Impact**: All buttons become non-functional after server restart
- **Data Access**: Has direct access to `reportedMessage`, `modRoleId` in closure

### setupTickets.ts Approach

```ts
// Button creation
customId: "close-ticket"

// Persistent handler
{ command: { type: InteractionType.MessageComponent, name: "close-ticket" } }
```

- **Advantage**: Handlers are command definitions that persist across restarts
- **Data Storage**: Uses database (`tickets_config`) to store context
- **Context Passing**: Uses `customId` with encoded data or database lookups

## Implementation Approaches

### Approach 1: Direct customId Migration

**Strategy**: Replace Reacord with native Discord.js components using customId patterns

```ts
// Button creation
new ButtonBuilder()
  .setCustomId(`escalate-delete-${reportedMessage.id}`)
  .setLabel("Delete all reported messages")

// Handler
{ command: { type: InteractionType.MessageComponent, name: "escalate-delete" } }
```

**Pros:**

- Minimal database changes
- Follows exact setupTickets.ts pattern

**Cons:**

- CustomId limited to 100 characters
- Need to encode/decode context data
- Complex state reconstruction

### Approach 2: Database-Backed Context Storage

**Strategy**: Create `escalation_contexts` table to store all necessary data

```sql
escalation_contexts (
  id UUID PRIMARY KEY,
  thread_id TEXT,
  reported_message_id TEXT,
  reported_user_id TEXT,
  guild_id TEXT,
  mod_role_id TEXT,
  created_at DATETIME,
  expires_at DATETIME
)
```

```ts
// Button creation
customId: `escalate-${contextId}`;

// Handler looks up context from database
const context = await getEscalationContext(contextId);
```

**Pros:**

- Clean separation of concerns
- Unlimited context data storage
- Easy expiration/cleanup

**Cons:**

- New database table and migration needed
- More complex data flow
- Need expiration logic

### Approach 3: Hybrid Message-Based Context

**Strategy**: Use reported message ID as primary key, supplement with database as needed

```ts
// Button creation
customId: `escalate-delete-${reportedMessage.id}-${guildId}`;

// Handler
const reportedMessage = await channel.messages.fetch(messageId);
// Use existing deleteAllReported(reportedMessage)
```

**Pros:**

- Minimal changes to existing logic
- Leverages existing `deleteAllReported` function
- No new database tables

**Cons:**

- Message might be deleted/unavailable
- CustomId length constraints with guild ID
- Fragile if message gets deleted

## Specific Challenges

### "Delete all reported messages" Button

**Current Logic:**

```ts
deleteAllReported(reportedMessage) // Needs Message object
  -> queryReportCache(message)     // Uses message.guildId + message.author.id
  -> allReports.logs.map(l => l.message.delete()) // Deletes Discord messages
```

**Challenge**: Function requires `Message` object but we only have IDs after restart

**Solutions:**

1. **Message Reconstruction**: Fetch message by ID, pass to existing function
2. **Direct Cache Access**: Bypass message object, directly query cache with IDs
3. **Database Migration**: Store report references in database instead of cache

### Other Buttons (Kick/Ban/etc)

**Current Logic:**

```ts
reportedMessage.member?.kick();
reportedMessage.guild?.bans.create(reportedMessage.author);
```

**Challenge**: Need `reportedMessage.member` and `reportedMessage.author`

**Solutions:**

1. **User ID Storage**: Store user ID in customId/database, fetch member separately
2. **Guild Context**: Store guild ID, reconstruct guild.members.fetch(userId)

## Recommended Approach

**Hybrid Approach 3** with database fallback:

1. **Primary**: Use `escalate-{action}-{messageId}-{guildId}` customId pattern
2. **Fallback**: If message fetch fails, query database for user context
3. **Gradual Migration**: Start with simple actions (kick/ban), then tackle delete-all

**Implementation Steps:**

1. Create message component handlers for each action
2. Modify `escalationControls` to use native Discord.js components
3. Add database table for cases where message context is lost
4. Implement `deleteAllReported` variant that works with user/guild IDs

**Delete Button Specific Solution:**

- Try message fetch first: `deleteAllReported(fetchedMessage)`
- If fails, create new function: `deleteAllReportedByUser(userId, guildId)`
- Query cache directly with `${guildId}${userId}` pattern from reportCache.ts

This maintains existing functionality while providing persistence across server restarts.

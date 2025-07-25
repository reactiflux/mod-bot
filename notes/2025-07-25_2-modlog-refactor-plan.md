# ModLog Refactor Plan - User-Based Threading

## Current System Analysis

### Issues with Current Implementation

- Creates new threads per message via `makeLogThread()` (modLog.ts:43-47)
- Uses message-based caching with `queryReportCache()`
- Thread naming is date-based: `${user.username} – ${format(message.createdAt, "P")}`
- Search history tracking via Discord search is unreliable
- Creates channel clutter with many threads per user

### Key Functions to Refactor

- `reportUser()`: Main function handling report logic (modLog.ts:50-166)
- `makeLogThread()`: Thread creation logic (modLog.ts:43-47)
- `constructLog()`: Message formatting for initial reports (modLog.ts:181-241)
- Cache system in `reportCache.js` for user-based lookup

## New System Design

### Database Schema

```sql
user_threads (
  user_id TEXT,
  guild_id TEXT,
  thread_id TEXT,
  created_at DATETIME,
  PRIMARY KEY (user_id, guild_id)
)
```

### Threading Strategy

1. **One thread per user per guild** - persistent across all reports
2. **Thread naming**: `${user.username} Moderation History`
3. **Top-level notifications**: New message in mod-log channel linking to user thread
4. **Thread content**: All reports, actions, timeouts, kicks/bans for that user

### Notification Flow

1. New report comes in
2. Lookup/create persistent user thread
3. Post report details in user thread
4. Post notification in main mod-log channel linking to thread
5. Update any escalation controls in user thread

## Integration Points

- **Report feature**: Uses `reportUser()` directly
- **Track feature**: Uses `reportUser()` via track commands
- **Automod**: Calls `reportUser()` for automated reports
- **Escalate**: Uses threads created by `reportUser()`

## Benefits

- Consolidated user history in single discoverable thread
- Programmatic access via thread lookup table
- Reduced channel clutter
- Better historical context for moderation decisions
- More reliable than Discord search

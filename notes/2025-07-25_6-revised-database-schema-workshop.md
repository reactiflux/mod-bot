# Revised Database Schema Workshop - 2025-07-25

## Current TTL Cache Analysis

### Cache Structure

```typescript
TTLCache<
  `${UserID}${GuildID}`, // Key: per user per guild
  Map<
    string, // Simplified message content
    {
      logMessage: Message; // Main log message in thread
      logs: Report[]; // All reports for this content
    }
  >
>;
```

### Key Insights

1. **Content Grouping**: Messages with similar content are grouped together
2. **Per-User Caching**: Each user has their own cache entry per guild
3. **Log Message Tracking**: One "main" log message per content group
4. **Multiple Reports**: Each content group can have multiple reports

### Current Functions

- `queryReportCache(message)` → finds existing reports for similar content
- `queryCacheMetadata(message)` → aggregates stats across all user's reports
- `trackReport(logMessage, newReport)` → adds new report to content group
- `deleteAllReported(message)` → deletes all messages in the content group

## Revised Database Schema

### Option A: Direct Cache Translation

#### `report_cache_entries`

```sql
report_cache_entries (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  simplified_content TEXT NOT NULL,     -- Key from cache Map
  log_message_id TEXT NOT NULL,         -- The main thread message
  log_channel_id TEXT NOT NULL,         -- Thread ID where log lives
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+20 hours')),

  PRIMARY KEY (user_id, guild_id, simplified_content),
  INDEX idx_user_guild (user_id, guild_id),
  INDEX idx_expires (expires_at)
)
```

#### `report_logs`

```sql
report_logs (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  simplified_content TEXT NOT NULL,     -- Links to report_cache_entries

  -- Report details (from Report interface)
  reason TEXT NOT NULL,                 -- ReportReasons enum
  message_id TEXT NOT NULL,             -- Original reported message ID
  message_channel_id TEXT NOT NULL,
  message_content TEXT,                 -- Full original content
  message_link TEXT,
  staff_id TEXT,                        -- User ID who made report (nullable)
  staff_username TEXT,
  extra TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id, guild_id, simplified_content)
    REFERENCES report_cache_entries(user_id, guild_id, simplified_content),
  INDEX idx_cache_entry (user_id, guild_id, simplified_content)
)
```

### Option B: Simplified Structure

#### `user_report_groups`

```sql
user_report_groups (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,           -- Hash of simplified content
  log_message_id TEXT NOT NULL,         -- Main log message
  log_thread_id TEXT NOT NULL,          -- Thread where discussions happen
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+20 hours')),

  UNIQUE (user_id, guild_id, content_hash),
  INDEX idx_user_guild (user_id, guild_id),
  INDEX idx_expires (expires_at)
)
```

#### `individual_reports`

```sql
individual_reports (
  id UUID PRIMARY KEY,
  report_group_id UUID NOT NULL REFERENCES user_report_groups(id),

  reason TEXT NOT NULL,
  message_id TEXT NOT NULL,
  message_channel_id TEXT NOT NULL,
  message_content TEXT,
  message_link TEXT,
  staff_id TEXT,
  staff_username TEXT,
  extra TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_group (report_group_id)
)
```

## Questions to Workshop

### 1. Content Grouping Strategy

**Current**: Uses `simplifyString(message.content)` to group similar messages

```typescript
const simplifiedContent = simplifyString(message.content);
```

**Options:**

- **A**: Store `simplified_content` as TEXT (exact match)
- **B**: Store `content_hash` as deterministic hash
- **C**: Remove grouping entirely, treat each message separately

**What does `simplifyString` do exactly?** Need to check implementation.

### 2. Foreign Key Strategy

**Current**: Cache uses compound keys `${guildId}${userId}` + simplified content

**Options:**

- **A**: Composite PRIMARY KEY (user_id, guild_id, simplified_content)
- **B**: UUID PRIMARY KEY with UNIQUE constraint on composite
- **C**: Separate user_guild table with relationships

### 3. Log Message Tracking

**Current**: Each content group has one `logMessage` that gets edited

**Questions:**

- Is this the message in the user thread that gets updated?
- Do we need to track the original notification message separately?
- How does this relate to the new user thread system?

### 4. deleteAllReported Implementation

**Current**:

```typescript
allReports?.logs.map((l) => l.message.delete());
```

**This deletes the ORIGINAL reported messages, not the log messages**

**Database needs:**

- Store original `message_id` and `message_channel_id` for each report
- Query all reports for a user/content group
- Fetch and delete each original Discord message

### 5. Escalation Context Storage

**For persistent buttons, we still need:**

#### `escalation_contexts`

```sql
escalation_contexts (
  id UUID PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,              -- The reported user
  guild_id TEXT NOT NULL,
  mod_role_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+7 days')),

  INDEX idx_thread (thread_id),
  INDEX idx_expires (expires_at)
)
```

## Recommended Approach (Option B + Escalation)

```sql
-- Core report grouping (matches TTL cache structure)
user_report_groups (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,           -- Hash of simplified content
  log_message_id TEXT NOT NULL,         -- Thread message that gets edited
  log_thread_id TEXT NOT NULL,          -- User thread ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+20 hours')),
  UNIQUE (user_id, guild_id, content_hash)
);

-- Individual reports within each group
individual_reports (
  id UUID PRIMARY KEY,
  report_group_id UUID NOT NULL REFERENCES user_report_groups(id),
  reason TEXT NOT NULL,
  message_id TEXT NOT NULL,             -- Original Discord message to delete
  message_channel_id TEXT NOT NULL,     -- Where original message lives
  message_content TEXT,                 -- For reference/display
  staff_id TEXT,
  staff_username TEXT,
  extra TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Button context for persistence
escalation_contexts (
  id UUID PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  mod_role_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+7 days'))
);
```

## Key Functions to Implement

```typescript
// Replace TTL cache functions
export async function findReportGroup(
  userId: string,
  guildId: string,
  content: string,
);
export async function createReportGroup(
  userId: string,
  guildId: string,
  logMessageId: string,
  threadId: string,
);
export async function addReportToGroup(groupId: string, report: ReportData);
export async function getAllReportsForUser(userId: string, guildId: string);
export async function deleteAllOriginalMessages(
  userId: string,
  guildId: string,
);

// Escalation context
export async function createEscalationContext(
  threadId: string,
  userId: string,
  guildId: string,
  modRoleId: string,
);
export async function getEscalationContext(contextId: string);
```

**Questions:**

1. Does this structure make sense for your use case?
2. Should we keep the content grouping or simplify to per-message?
3. Any other data we need to track for the buttons to work?

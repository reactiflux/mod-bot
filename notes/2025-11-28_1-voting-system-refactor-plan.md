# Voting System Refactor Plan - 2025-11-28

## Current State

The `ad302ed` refactor removed the Reacord-based voting UI in favor of native Discord buttons, but left the voting logic incomplete. Currently:

- `escalationControls()` in `app/helpers/escalate.tsx:21` creates buttons for immediate actions (delete, kick, ban, restrict, timeout)
- `escalate()` function at line 76 still uses Reacord's `ModResponse` component (dead code)
- `escalate-escalate` handler in `escalationControls.ts:221` just posts a notification, no voting

## Requirements (Updated per user feedback)

1. **Vote timing**: Wait `24 - (8 * voteCount)` hours before auto-executing leading resolution
2. **Proactive auto-resolution**: Must run on a schedule, persist across restarts
3. **Quorum setting**: Configurable vote count required before action can be taken
4. **Quorum reached**: Majority wins; if tied, disable other options, wait for tiebreaker
5. **Escalate button**: Remains active; each click creates new voting message
6. **Resolutions**: restrict, kick, ban, warning, track, timeout

## Architecture

### Database Schema: `escalation_votes`

```sql
escalation_votes (
  id TEXT PRIMARY KEY,                    -- UUID
  guild_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,                -- Where the vote message lives
  vote_message_id TEXT NOT NULL,          -- Discord message ID with buttons
  reported_user_id TEXT NOT NULL,
  reported_message_id TEXT,               -- Optional: specific message that triggered this
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,                   -- NULL until resolved
  resolution TEXT,                        -- Final resolution taken (NULL if pending)
  quorum_required INTEGER NOT NULL,       -- Snapshot of quorum setting at creation time

  INDEX idx_pending_votes (guild_id, resolved_at)
)
```

### Database Schema: `escalation_vote_records`

```sql
escalation_vote_records (
  id TEXT PRIMARY KEY,
  escalation_id TEXT NOT NULL REFERENCES escalation_votes(id),
  voter_id TEXT NOT NULL,
  voter_username TEXT NOT NULL,
  vote TEXT NOT NULL,                     -- Resolution they voted for
  voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(escalation_id, voter_id)         -- One vote per user per escalation
)
```

### Guild Setting: `quorum`

Add to SETTINGS in `guilds.server.ts`:

```typescript
quorum: "quorum"; // integer, default 3
```

### Button CustomId Schema

```
vote-<resolution>|<escalation_id>
```

Escalation ID is the UUID from `escalation_votes` table.

Resolution values:

- `track`, `warning`, `timeout`, `restrict`, `kick`, `ban`

### Scheduler: Auto-Resolution

Use existing `scheduleTask` from `app/helpers/schedule.ts`.

Run every minute:

1. Query `escalation_votes WHERE resolved_at IS NULL`
2. For each pending vote:
   - Calculate timeout: `24 - (8 * voteCount)` hours
   - If elapsed > timeout, resolve with leading vote
3. Execute resolution, mark as resolved

### Vote Flow

1. User clicks "Escalate" button
2. Handler creates `escalation_votes` record
3. Handler posts voting message with 6 resolution buttons + current vote state
4. On each vote click:
   - Check voter has mod role
   - Upsert vote in `escalation_vote_records`
   - Count votes by resolution
   - If quorum reached AND clear majority: resolve immediately
   - If quorum reached AND tied: update message to show only tied options
   - Otherwise: update message with current vote counts

### Tie Handling

When quorum is reached but tied:

1. Identify tied resolutions
2. Edit message: disable all buttons except tied options
3. Wait for tiebreaker vote
4. On next vote: re-check, resolve if no longer tied

### Resolution Execution

Extract from dead `escalate()` function. Each resolution:

1. Execute moderation action
2. Log via `reportUser()`
3. Edit voting message to show outcome
4. Mark `escalation_votes.resolved_at` and `resolution`

## Implementation Phases

### Phase 1: Database + Model

1. Create migration for `escalation_votes` and `escalation_vote_records`
2. Create `app/models/escalationVotes.server.ts`
3. Add `quorum` to `SETTINGS` in guilds.server.ts

### Phase 2: Vote Handlers

1. Refactor `escalate-escalate` to create vote record + message
2. Add vote button handlers (`vote-track`, `vote-warning`, etc.)
3. Implement vote counting and message updates

### Phase 3: Resolution Logic

1. Extract resolution execution from `escalate()` to standalone functions
2. Wire handlers to call resolutions on quorum+majority
3. Handle tie state (disable non-tied buttons)

### Phase 4: Scheduler

1. Add scheduled task to `app/server.ts`
2. Query pending votes, check timeouts, auto-resolve

### Phase 5: Testing

Manual testing plan:

1. Trigger escalation → verify DB record + message
2. Cast votes → verify counts update
3. Reach quorum with clear winner → verify resolution
4. Reach quorum with tie → verify only tied buttons active
5. Wait for timeout → verify auto-resolution

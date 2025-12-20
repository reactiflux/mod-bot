# Escalation Scheduling Refactor: `scheduled_for` Column

## Problem

Previous escalation timeout logic computed resolution time dynamically on every 15-minute poll:

1. Query all pending escalations (`resolved_at IS NULL`)
2. For each: fetch votes, tally, calculate `36 - 4 * voteCount` hours from `created_at`
3. Compare elapsed time to computed timeout

Inefficient—vote count determines timeout, but we recalculated on every poll instead of when votes changed.

## Solution

Added `scheduled_for` column that stores the computed resolution timestamp. Updated whenever votes change. Poll query becomes:

```sql
SELECT * FROM escalations
WHERE resolved_at IS NULL
AND scheduled_for <= datetime('now')
```

## Changes

### Migration (`20251217145416_add_scheduled_for.ts`)

- Added `scheduled_for` text column
- Backfills existing pending escalations based on current vote count

### Model (`escalationVotes.server.ts`)

- `calculateScheduledFor(createdAt, voteCount)` - computes scheduled time
- `updateScheduledFor(id, scheduledFor)` - persists new scheduled time
- `getDueEscalations()` - queries escalations past their scheduled time
- `createEscalation()` - now sets initial `scheduled_for` (36h from creation)

### Handlers (`handlers.ts`)

- Vote handler: updates `scheduled_for` after recording vote
- Re-escalation handler: updates `scheduled_for` when upgrading to majority voting

### Resolver (`escalationResolver.ts`)

- Simplified to use `getDueEscalations()` instead of `getPendingEscalations()`
- Removed `shouldAutoResolve()` check—query already filters for due escalations

## Behavior

- New escalation: `scheduled_for = created_at + 36h`
- Each vote: `scheduled_for = created_at + (36 - 4 * voteCount)h`
- Vote removal: timeout increases (recalculated)
- Poll: only processes escalations where `scheduled_for` has passed

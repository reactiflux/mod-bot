# The Escalation System: Deep Dive

The escalation system is a multi-stage collaborative moderation workflow. It's
the most complex UI flow in the bot and touches the most files.

## Architecture Overview

```
User reported → Thread created → Control buttons posted
                                       ↓
                        ┌──────────────┴──────────────┐
                        │                             │
                   Direct action               "Escalate" clicked
                  (immediate mod)                     │
                        │                    Creates escalation (level 0)
                        │                    Posts vote message
                        │                             │
                        │                    ┌────────┴────────┐
                        │                    │                 │
                        │              Mods vote         "Require majority"
                        │                    │           Upgrades to level 1
                        │                    │                 │
                        │                    └────────┬────────┘
                        │                             │
                        │                    ┌────────┴────────┐
                        │                    │                 │
                        │              Quorum reached    Timer expires
                        │              (simple only)          │
                        │                    │                 │
                        │              Expedite btn     Auto-resolve
                        │              (confirm)        (background job)
                        │                    │                 │
                        └────────────────────┴────────┬────────┘
                                                      │
                                              Execute mod action
                                              (track/timeout/restrict/kick/ban)
```

## File Map

| File | Role |
| ---- | ---- |
| `helpers/escalate.tsx` | Sends the 2 initial control messages to a user thread |
| `commands/escalate/handlers.ts` | Routes button interactions to the right handler |
| `commands/escalate/escalate.ts` | Creates level-0 escalation OR upgrades to majority |
| `commands/escalate/vote.ts` | Records a vote, recalculates schedule |
| `commands/escalate/voting.ts` | Pure logic: tally votes, detect ties, check quorum |
| `commands/escalate/strings.ts` | Builds vote message text + button rows |
| `commands/escalate/expedite.ts` | Immediately resolves when mod clicks Expedite |
| `commands/escalate/directActions.ts` | Delete/kick/ban/restrict/timeout (no vote) |
| `commands/escalate/escalationResolver.ts` | Processes due escalations (auto-resolve) |
| `commands/escalate/service.ts` | EscalationService: DB operations + action execution |
| `discord/escalationResolver.ts` | Runs `checkPendingEscalations` every 15 min |
| `helpers/modResponse.ts` | Resolution types, voting strategies, severity ordering |

## Message Flow: What Gets Sent Where

### Phase 1: Thread Created
Two messages sent to user thread (`helpers/escalate.tsx`):

**Message 1** — "Moderator controls"
```
[Delete all reported messages] [Kick] [Ban]     ← ActionRow 1
[Restrict] [Timeout]                             ← ActionRow 2
```

**Message 2** — "Anyone can escalate..."
```
[Escalate]                                       ← ActionRow 1
```

### Phase 2: Escalation Created
One new message sent to thread (`escalate.ts` → `strings.ts`):

```
@initiator called for a vote by @ModRole <timestamp> regarding user @reported
0 voter(s), quorum at 3.

_No votes yet_

[No action (abstain)] [Timeout] [Restrict?] [Kick] [Ban]  ← vote buttons
[Require majority vote]                                     ← upgrade button
```

### Phase 3: Votes Come In
Same message updated in-place (`handlers.ts` → `strings.ts`):

```
@initiator called for a vote by @ModRole <timestamp> regarding user @reported
2 voter(s), quorum at 3. Auto-resolves with `ban` <relative time> if no more votes.

-# Vote record:
-# • No action (abstain): @mod1
-# • Ban: @mod2, @mod3

[No action (abstain)] [Timeout] [Kick] [Ban (2)]  ← counts update
[Require majority vote]
```

### Phase 4a: Quorum Reached (Simple Voting)
Message updates to confirmed state:

```
**Ban** ✅ @reportedUser
Executes <relative time>

-# Vote record:
-# • Ban: @mod1, @mod2, @mod3

[Expedite]   ← single button to execute immediately
```

### Phase 4b: Timer Expires (Auto-Resolution)
Background job (`escalationResolver.ts`) processes due escalations:
- Determines winner (leader, or most severe if tied)
- Executes mod action via `executeResolution()`
- Disables all buttons on vote message
- Replies with resolution summary, forwards to mod log

```
Resolved with 3 votes from 3 voters: **Ban** @reported (username)
-# Resolved <timestamp>, 24hrs after escalation
```

## Voting Mechanics (`voting.ts`)

### Simple Strategy (Level 0)
- Quorum default: 3 (configurable in escalation flags JSON)
- **Early resolution**: triggers when any option hits quorum with no tie
- **Timeout calculation**: starts at 36 hours, decreases 4 hours per vote
  (36, 32, 28, 24, 20, 16, 12, 8, 4, 0)
- Vote toggle: clicking same button twice removes vote

### Majority Strategy (Level 1)
- Never triggers early — always waits for timeout
- Timeout: fixed at creation, doesn't shrink with votes
- Simple plurality wins at timeout
- Ties broken by severity (ban > kick > restrict > timeout > track)

### Tie Handling
When tied at quorum (simple voting only):
- Non-tied buttons become **disabled**
- Only tied options remain clickable
- Forces tiebreaker vote

## Custom ID Format

All escalation buttons use pipe-delimited IDs:
```
escalate-delete|{userId}
escalate-kick|{userId}
escalate-ban|{userId}
escalate-restrict|{userId}
escalate-timeout|{userId}
escalate-escalate|{userId}|{level}
escalate-escalate|{userId}|1|{escalationId}    ← upgrade
vote-{resolution}|{escalationId}
expedite|{escalationId}
```

## Database Schema

**`escalations`** table:
- `id`, `guild_id`, `thread_id`, `vote_message_id`
- `reported_user_id`, `initiator_id`
- `voting_strategy` ("simple" | "majority")
- `created_at`, `scheduled_for`, `resolved_at`
- `resolution` (null until resolved)
- `flags` (JSON: `{ quorum: number }`)

**`escalation_records`** table:
- `escalation_id`, `voter_id`, `vote` (resolution string)

## Components v2 Migration Considerations

The escalation system is the hardest to migrate because:

1. **Stateful message updates** — The vote message is edited many times as votes
   come in. If we switch to v2, the initial creation AND every update must use
   the v2 flag and component structure.

2. **Three distinct message states** — Initial vote, confirmed (awaiting
   execution), and resolved. Each has different content/buttons.

3. **Button disabling logic** — Tie handling disables specific buttons. The
   resolver disables ALL buttons. This logic reconstructs ActionRows from the
   existing message components.

4. **Two separate control messages** — The initial "Moderator controls" and
   "Escalate" messages could be merged into one v2 message with a Container,
   but this changes the message IDs stored/referenced elsewhere.

5. **Message forwarding** — Resolution summaries are forwarded to mod log via
   `replyAndForwardSafe`. These are plain text, not embeds, so they'd stay as-is.

### Suggested Approach
- Start with the **initial control messages** (merge 2→1 with Container)
- Then convert the **vote message** to use Container + TextDisplay + ActionRows
- Leave resolution summary replies as plain text (they're fine)
- The auto-resolver's `getDisabledButtons()` helper extracts buttons from
  existing messages — this should work regardless of v2 since buttons are still
  in ActionRows

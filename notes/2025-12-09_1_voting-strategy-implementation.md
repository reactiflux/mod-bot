# Voting Strategy Implementation

## Summary

Added support for two voting strategies:

- **simple** (default/null): Early resolution when any option hits quorum (3 votes)
- **majority**: No early resolution; voting stays open until timeout, then plurality wins

## Key Changes

### Database

- Added `voting_strategy` nullable column to `escalations` table
- Migration: `migrations/20251209140659_add_voting_strategy.ts`

### modResponse.ts

- Added `votingStrategies` constant object and `VotingStrategy` type

### escalationVotes.server.ts

- `createEscalation` now accepts optional `votingStrategy` parameter
- Added `updateEscalationStrategy(id, strategy)` for re-escalation

### voting.ts

- Added `shouldTriggerEarlyResolution(tally, quorum, strategy)`:
  - Returns `false` for majority strategy (never triggers early)
  - Returns `leaderCount >= quorum` for simple strategy

### handlers.ts

- Vote handler uses `shouldTriggerEarlyResolution` instead of direct quorum check
- Escalate handler:
  - Level 0: creates with `votingStrategy: null` (simple)
  - Level 1+: updates existing escalation to `majority` strategy
- Passes voting strategy to string builders

### strings.ts

- `buildVoteMessageContent` shows strategy-specific status messages
- `buildVoteButtons` hides "Require majority vote" button if already using majority

### escalationResolver.ts

- Removed unused `parseFlags` import (quorum check was redundant)
- Both strategies resolve identically on timeout: plurality wins

## Behavior Summary

| Action                    | Simple Strategy                        | Majority Strategy   |
| ------------------------- | -------------------------------------- | ------------------- |
| 3 votes for same option   | Shows "confirmed", schedules execution | Continues voting    |
| Timeout reached           | Leading option wins                    | Leading option wins |
| "Require majority" button | Visible                                | Hidden              |

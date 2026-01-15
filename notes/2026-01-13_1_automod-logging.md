# Automod Event Logging

Added functionality to log Discord's built-in automod trigger events to user mod threads.

## Changes

### Client Intent

Added `GatewayIntentBits.AutoModerationExecution` to `client.server.ts` to receive automod events.

### Event Handler (`automod.ts`)

- Added handler for `Events.AutoModerationActionExecution`
- Skips `Timeout` actions (no message content to log)
- Tries to fetch the message if `messageId` exists
  - If successful: uses existing `reportUser()` with `ReportReasons.automod`
  - If failed (message blocked/deleted): uses new `reportAutomod()` fallback

### New Function (`modLog.ts`)

Created `reportAutomod()` for cases where we don't have a full `Message` object:

- Gets/creates user thread (reusing pattern from `getOrCreateUserThread`)
- Logs automod-specific info: rule name, matched keyword, action type
- Records to database if `messageId` available
- Forwards to mod log and sends summary to parent channel

Also modified `escalationControls()` in `escalate.tsx` to accept either a `Message` or just a `userId` string.

## Design Decisions

1. **Two-path approach**: Try to fetch the message first for full context, fallback to minimal logging if unavailable. This maximizes information captured.

2. **Skip Timeout actions**: These don't have associated message content worth logging. The timeout itself is visible in Discord's audit log.

3. **No MESSAGE_CONTENT intent**: The `content` field in automod events requires privileged intent. We work with what's available (`matchedContent`, `matchedKeyword`).

4. **Database recording conditional on messageId**: If automod blocked the message before sending, there's no message ID to record. We still log to the thread for visibility.

## Related Files

- `app/discord/client.server.ts` - intent added
- `app/discord/automod.ts` - event handler
- `app/helpers/modLog.ts` - `reportAutomod()` function
- `app/helpers/escalate.tsx` - signature update

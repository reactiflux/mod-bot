# Forwarded Message Handling Fix

## Problem

`reportUser` in `app/helpers/modLog.ts` incorrectly handled Discord forwarded messages:

1. Forward detection used `message.type !== MessageType.Reply && message.reference` - unreliable heuristic
2. `message.content` is empty for forwards; actual content lives in `messageSnapshots`
3. `constructLog` called `fetchReference()` which contradicted our policy to track forwarders

## Solution

Policy decision: Track the **forwarder** (person who shared), not original author.

### Changes

1. Added `isForwardedMessage()` helper using `MessageReferenceType.Forward` enum from discord.js
2. Added `getMessageContent()` to extract content from `messageSnapshots` for forwards
3. Updated content extraction in `reportUser` (line 217) to use `getMessageContent()`
4. Updated summary preview (line 260-266) to handle empty `cleanContent` on forwards
5. Removed broken `fetchReference()` block in `constructLog` - we want forwarder attribution
6. Added "(forwarded)" indicator to log preface
7. Attachments now pulled from snapshot for forwarded messages

## Technical Notes

- `MessageSnapshot` does NOT contain `author` - only content, attachments, embeds, etc.
- `fetchReference()` makes API call that can fail if original message deleted
- `message.author` on a forwarded message is the forwarder, which aligns with our tracking policy
- Import `MessageReferenceType` from discord.js (not discord-api-types) to satisfy ESLint enum comparison rules

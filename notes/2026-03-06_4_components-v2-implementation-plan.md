# Components v2 Implementation Plan

Prioritized by effort vs impact. Quick wins first, complex interactions last.

## Phase 0: Foundation

**Check discord.js v2 support**
- Verify which discord.js version we're on, what builder classes exist for v2
- If builders don't exist, create a small helper module for constructing raw
  component objects (TextDisplay, Section, Container, Separator, etc.)
- Define the `IS_COMPONENTS_V2` flag constant if not already exported

**Create component helpers** (`app/helpers/componentsV2.ts`)
- `textDisplay(content: string)` → `{ type: 10, content }`
- `separator(spacing?: 1|2)` → `{ type: 14, divider: true, spacing }`
- `container(opts: { accentColor?, spoiler?, components })` → `{ type: 17, ... }`
- `section(texts: string[], accessory?)` → `{ type: 9, ... }`
- `thumbnail(url: string, description?)` → `{ type: 11, ... }`
- Keep it minimal — just typed factory functions, not a builder pattern

Files: 1 new file

## Phase 1: Read-Only Messages (No Interaction State)

These messages are sent once and never edited. Lowest risk.

### 1a. `/modreport` embed → Container

Convert the `APIEmbed` in `app/commands/modreport.ts` to a Container:
- Section: avatar thumbnail + username + summary stats
- Separator
- TextDisplay: reason/channel/staff breakdowns (keep inline-ish with markdown)
- Separator (if actions exist)
- TextDisplay: action timeline
- Accent color: blurple

Touch: `app/commands/modreport.ts`

### 1b. Attachment/Reaction description embeds → TextDisplay

`describeAttachments()` and `describeReactions()` in `app/helpers/discord.ts`
currently return `APIEmbed`. Change to return component objects instead (or
alongside, with a flag).

**Caution:** These are consumed by `userLog.ts` which sends them as `embeds[]`.
If we convert userLog to v2, these convert too. If not, leave them.

Touch: `app/helpers/discord.ts`, `app/commands/report/userLog.ts`

### 1c. Setup wizard embeds → Containers

`app/commands/setupHandlers.ts` sends embeds for each setup step.
Convert to Container + TextDisplay. The select menus and buttons stay as
ActionRows within the Container.

Touch: `app/commands/setupHandlers.ts`

### 1d. Requirements check → Container

`app/commands/checkRequirements.ts` — straightforward embed-to-container swap.

Touch: `app/commands/checkRequirements.ts`

## Phase 2: Escalation Controls (Merge 2 Messages → 1)

Currently `helpers/escalate.tsx` sends 2 separate messages. Merge into one v2
message with a Container:

```
Container (accent_color: blurple)
├── TextDisplay: "Moderator controls"
├── ActionRow: [Delete all reported] [Kick] [Ban]
├── ActionRow: [Restrict] [Timeout]
├── Separator
├── TextDisplay: "Anyone can escalate..."
└── ActionRow: [Escalate]
```

This is a nice win — fewer messages, clearer grouping. The control buttons don't
get edited after creation, so low risk.

**Check:** Does anything reference the message ID of either control message? If
so, update those references. The escalate button's custom ID format is unchanged.

Touch: `app/helpers/escalate.tsx`

## Phase 3: Vote Message

The vote message is edited on every vote. This is the most complex conversion.

### Current structure
- `content`: multi-line text with mentions, status, vote record
- `components`: vote button ActionRow + optional upgrade ActionRow

### New structure
```
Container (accent_color: contextual?)
├── TextDisplay: "@initiator called for a vote by @ModRole..."
├── TextDisplay: status line (quorum/leader/timing)
├── Separator
├── TextDisplay: "-# Vote record: ..."
├── ActionRow: [Track] [Timeout] [Restrict?] [Kick] [Ban]
└── ActionRow?: [Require majority vote]
```

When confirmed (quorum reached):
```
Container (accent_color: green?)
├── TextDisplay: "**Ban** ✅ @reportedUser"
├── TextDisplay: "Executes <time>"
├── Separator
├── TextDisplay: "-# Vote record: ..."
└── ActionRow: [Expedite]
```

### Required changes
- `strings.ts`: `buildVoteMessageContent()` returns text → needs to return
  components array instead (or a structured object the handler assembles)
- `strings.ts`: `buildVoteButtons()` stays mostly the same (returns ActionRows)
- `strings.ts`: `buildConfirmedMessageContent()` same treatment
- `handlers.ts`: All `interactionUpdate()` calls need `flags: 32768` and
  restructured `components` array
- `escalationResolver.ts`: `processEscalationEffect()` edits the vote message
  on resolution — needs to construct v2 components. `getDisabledButtons()` should
  still work since it extracts from ActionRows.
- `escalate.ts`: Initial vote message creation needs v2 flag

Touch: `app/commands/escalate/strings.ts`, `app/commands/escalate/handlers.ts`,
`app/commands/escalate/escalationResolver.ts`, `app/commands/escalate/escalate.ts`

## Phase 4: Report Log Messages

`userLog.ts` sends multiple messages to the user thread:
1. Log body (constructed text from `constructLog`)
2. Quoted reported message + attachment/reaction embeds
3. Summary to parent channel

Converting these to v2 is appealing but complex:
- Could combine log body + quoted message into one Container
- Could use MediaGallery for image attachments
- Summary to parent channel is small text, maybe leave as-is

This is lower priority — the current format works fine and these messages are
high volume. Risk of breakage is higher here.

Touch: `app/commands/report/userLog.ts`, `app/commands/report/constructLog.ts`,
`app/helpers/discord.ts`

## Migration Checklist Per Message

For each message type converted:
- [ ] Verify discord.js supports the raw component structure we're sending
- [ ] Add `flags: 32768` (or `MessageFlags.IsComponentsV2`) to message options
- [ ] Remove `content` and `embeds` from message options (they're ignored anyway)
- [ ] Move all display content into `components[]`
- [ ] Test that buttons/selects still fire interactions with correct custom IDs
- [ ] Test message editing (if applicable) preserves v2 flag
- [ ] Test in Discord client (v2 rendering may vary on mobile/desktop)

## Risk Assessment

| Phase | Risk | Notes |
| ----- | ---- | ----- |
| 0     | Low  | Just helpers, no behavior change |
| 1     | Low  | Send-once messages, easy to test, easy to revert |
| 2     | Low  | Merges 2 messages → 1, no editing involved |
| 3     | Med  | Stateful message with many edit paths, tie-break logic |
| 4     | Med  | High-volume messages, multiple consumers of helper functions |

# Current Message Patterns & Components v2 Opportunities

## How We Build Messages Today

### 1. Embeds (APIEmbed objects)
We use raw `APIEmbed` objects (not EmbedBuilder). Three colors:
- `0x5865f2` (blurple) — info/primary
- `0x00cc00` (green) — success
- `0xcc0000` (red) — error

**Used in:**
- `app/commands/modreport.ts` — User history with sparkline, reason/channel/staff breakdowns, action timeline
- `app/commands/setupHandlers.ts` — Setup wizard step confirmations
- `app/commands/checkRequirements.ts` — Validation status
- `app/commands/report/userLog.ts` — Attachment/reaction description embeds

### 2. Action Rows + Buttons (discord.js Builders)
Custom IDs use pipe-delimited format: `action|param1|param2`

**Used in:**
- `app/helpers/escalate.tsx` — Thread control buttons (Delete/Kick/Ban/Restrict/Timeout + Escalate)
- `app/commands/escalate/strings.ts` — Vote buttons with dynamic counts
- `app/commands/escalate/handlers.ts` — Expedite button, confirmed resolution display
- `app/commands/setupHandlers.ts` — Setup wizard navigation

### 3. Select Menus (raw ComponentType objects)
- `app/commands/setupHandlers.ts` — RoleSelect and ChannelSelect for setup wizard

### 4. Plain text content
- `app/commands/escalate/strings.ts` — Vote message with status, mentions, vote record
- `app/commands/report/userLog.ts` — Quoted reported messages, summary lines
- `app/commands/report/automodLog.ts` — Simple automod violation notices

### 5. Message Helpers (`app/helpers/discord.ts`)
- `describeAttachments()` → embed with file sizes/links
- `describeReactions()` → embed with emoji counts
- `quoteAndEscape()` / `escapeDisruptiveContent()` — safe quoting
- `getMessageStats()` — char/word/link/code counts

## Components v2 Opportunities

### Quick Wins (swap embed → Container+TextDisplay, minimal logic change)

1. **`/modreport` embed → Container with Sections**
   - Author line (avatar + username) → Section with Thumbnail accessory
   - Description lines → TextDisplay
   - Reason/Channel/Staff fields → side-by-side Sections or TextDisplays
   - Action timeline → TextDisplay
   - Sparkline stays as text content
   - Accent color replaces embed color
   - Can add Separators between logical sections

2. **Setup wizard embeds → Containers**
   - Step title/description → TextDisplay
   - Inline field pairs → Sections
   - Color coding → Container accent_color

3. **Attachment/Reaction description embeds → TextDisplay or Section**
   - These are simple text embeds, trivial to convert

4. **Requirements check embeds → Container with color-coded accent**

### Medium Complexity (restructure message layout)

5. **Escalation control messages** (currently 2 separate messages)
   - Could be ONE message with a Container:
     - TextDisplay: "Moderator controls"
     - ActionRow: Delete/Kick/Ban buttons
     - ActionRow: Restrict/Timeout buttons
     - Separator
     - TextDisplay: "Anyone can escalate..."
     - ActionRow: Escalate button
   - Reduces from 2 messages → 1, keeps controls together

6. **Vote message** (currently plain content + button rows)
   - Container with accent color showing vote state:
     - Section: Initiator info + reported user mention
     - TextDisplay: Status line (quorum, leader, timing)
     - Separator
     - TextDisplay: Vote record (small text)
     - ActionRow: Vote buttons
     - ActionRow: Upgrade button (if applicable)

7. **Report log messages** (userLog.ts)
   - Quoted message + stats + attachment/reaction info → single Container
   - Could use MediaGallery for image attachments instead of links

### Complex (new interaction patterns enabled by v2)

8. **Confirmed escalation + expedite**
   - Container with green accent showing resolution
   - Section: resolution label + user
   - TextDisplay: vote record
   - ActionRow: Expedite button

9. **Auto-resolved escalation**
   - Container with disabled buttons, resolution summary as TextDisplay
   - Timing info as small TextDisplay

10. **Modreport with action buttons**
    - Currently read-only. Could add an ActionRow inside the Container
      with quick-action buttons (View Thread, Escalate, etc.)

## Implementation Notes

- `IS_COMPONENTS_V2` flag is all-or-nothing per message — can't mix old embeds
  with new components in the same message
- Need to check discord.js builder support for new component types
- Messages that use `content` + `embeds` (like report logs with quoted text +
  attachment embeds) need full conversion — can't half-migrate
- Auto-resolved escalation updates existing messages — those messages must have
  been created as v2 from the start
- Custom ID format (`action|param`) is unaffected by the migration

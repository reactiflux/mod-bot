# Euno Design System: Styleguide & Moodboard

## The Magistrate's Desk

**One sentence**: The warm gravity of a judge's chambers — where consequential
decisions are made deliberately, surrounded by the tools and records of careful
judgment.

---

## Moodboard

### Visual References

- **Judge's chambers**: Raised-panel oak wainscoting, green-shaded desk lamps,
  leather-bound volumes, brass fixtures. The light is warm and directional.
- **Case files on a desk**: Manila folders with typed labels, documents stacked
  with purpose, red-bordered stamps for urgency. Everything has a place.
- **Neoclassical inscriptions**: "EQUAL JUSTICE UNDER LAW" carved in stone.
  Letters spaced for permanence, not speed. The serif exists because this will
  outlast the person who carved it.
- **The courtroom bar**: A literal railing that separates observer from
  participant. Crossing it changes your role. In our UI, this is the visual
  threshold between reading and acting.

### Emotional Registers

| Mode        | Feeling                     | Analog                        |
| ----------- | --------------------------- | ----------------------------- |
| Scanning    | Alert but routine           | Clerk processing the docket   |
| Reviewing   | Attentive, absorbing detail | Reading the case file          |
| Deciding    | Deliberate, weight of it    | The judge picking up the pen  |
| Confirming  | Grave, final                | The gavel about to fall       |

### What This Is Not

- Not a law firm marketing site (no stock photos of handshakes)
- Not dark-academia aesthetic (no crumbling parchment, no gothic fonts)
- Not courtroom drama (no theatrical red, no gavel iconography)
- Not bureaucratic brutalism (no institutional fluorescent bleakness)

It's the _working_ side of justice — the desk, not the bench. Private,
professional, consequential.

---

## Color System

### Semantic Palette

```
┌─────────────────────────────────────────────────────┐
│ SURFACES                                            │
│                                                     │
│  surface-deep    stone-950  #0c0a09  Page bg        │
│  surface-base    stone-900  #1c1917  Primary panels  │
│  surface-raised  stone-800  #292524  Cards, sidebar  │
│  surface-overlay stone-700  #44403c  Elevated UI     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ BORDERS                                             │
│                                                     │
│  border-subtle   stone-700  #44403c  Soft divisions  │
│  border-default  stone-600  #57534e  Standard edges  │
│  border-strong   stone-500  #78716c  Emphasis         │
│                                                     │
├─────────────────────────────────────────────────────┤
│ TEXT                                                │
│                                                     │
│  text-primary    stone-100  #f5f5f4  Headings, body  │
│  text-secondary  stone-400  #a8a29e  Supporting      │
│  text-tertiary   stone-500  #78716c  Captions, hints │
│  text-inverse    stone-950  #0c0a09  On light bg     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ACCENT — AMBER (Primary action, navigation, focus)  │
│                                                     │
│  accent          amber-500  #f59e0b  Links, active   │
│  accent-hover    amber-400  #fbbf24  Hover states    │
│  accent-strong   amber-600  #d97706  Buttons, CTA    │
│  accent-subtle   amber-950  #451a03  Tinted bg       │
│                                                     │
├─────────────────────────────────────────────────────┤
│ SEMANTIC                                            │
│                                                     │
│  danger          rose-600   #e11d48  Destructive     │
│  danger-strong   rose-700   #be123c  Danger hover    │
│  danger-subtle   rose-950   #4c0519  Danger bg       │
│  success         emerald-600 #059669 Resolved        │
│  success-strong  emerald-700 #047857 Success hover   │
│  success-subtle  emerald-950 #022c22 Success bg      │
│  info            sky-500    #0ea5e9  Informational   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Landing Page (Light Mode)

The landing page inverts the palette — it's the public-facing courthouse
exterior, not the working chambers. Warm cream/stone backgrounds instead of
dark surfaces.

```
  surface-light      stone-50   #fafaf9  Page bg
  surface-light-alt  stone-100  #f5f5f4  Section alt
  surface-light-card stone-200  #e7e5e4  Cards
  text-on-light      stone-900  #1c1917  Primary text
  text-on-light-2    stone-600  #57534e  Secondary text
  accent on light    amber-600  #d97706  CTAs, links
  accent on light hv amber-700  #b45309  Hover
```

---

## Typography

### Font Stack

- **Headings**: Source Serif 4 (variable weight, optical sizing)
  - The serif signals institutional weight. It says "this matters."
  - Use weights 600-700 for headings. Never use serif below 18px.
- **Body / UI**: System font stack (Inter where available)
  - Clean, readable, functional. The sans-serif is the working typeface.
  - The shift from serif heading → sans-serif body is itself a design device:
    the heading establishes gravity, the body gets to work.

### Scale

| Token         | Size    | Weight   | Font   | Use                          |
| ------------- | ------- | -------- | ------ | ---------------------------- |
| display       | 3rem    | 700      | Serif  | Landing hero                 |
| heading-1     | 2.25rem | 700      | Serif  | Page titles                  |
| heading-2     | 1.5rem  | 600      | Serif  | Section headings             |
| heading-3     | 1.25rem | 600      | Serif  | Card titles, subsections     |
| body-lg       | 1.125rem| 400      | Sans   | Lead paragraphs              |
| body          | 1rem    | 400      | Sans   | Default body text            |
| body-sm       | 0.875rem| 400      | Sans   | Supporting text, metadata    |
| caption       | 0.75rem | 500      | Sans   | Labels, timestamps, badges   |

### Rules

1. Serif is for reading. Sans-serif is for doing.
2. Never use serif on buttons, form labels, or interactive controls.
3. When serif and sans-serif appear in the same card/section, the serif is
   always the heading/title and the sans-serif is always the content/action.
4. Letter-spacing: headings get `tracking-tight`, body gets default,
   captions/labels get `tracking-wide` on uppercase text only.

---

## Spacing & Layout

### General

- Base unit: 4px (Tailwind default)
- Content max-width: `max-w-4xl` (56rem) for reading, `max-w-6xl` for grids
- Section padding: `py-16 lg:py-24` (vertical rhythm)
- Horizontal padding: `px-6 lg:px-8`

### Surface Hierarchy (Dark Theme)

```
┌──────────────────────────────────────────────┐  surface-deep
│  ┌────────────────────────────────────────┐  │
│  │  SIDEBAR / NAV          surface-base   │  │
│  │                                        │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  CONTENT AREA   surface-raised   │  │  │
│  │  │                                  │  │  │
│  │  │  ┌──────────────────────────┐    │  │  │
│  │  │  │ CARD / MODAL  overlay   │    │  │  │
│  │  │  └──────────────────────────┘    │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

Each layer is one step lighter. Elevation = warmth, not shadow.

---

## Component Patterns

### Buttons

| Variant   | Background       | Text          | Border         | Use                |
| --------- | ---------------- | ------------- | -------------- | ------------------ |
| Primary   | amber-600        | white         | none           | Main CTA           |
| Secondary | transparent      | stone-200     | stone-600 1px  | Secondary actions   |
| Danger    | rose-700         | white         | none           | Destructive         |
| Ghost     | transparent      | stone-400     | none           | Tertiary, nav       |

All buttons: `rounded` (4px), `px-4 py-2`, `font-medium`, `text-sm`.
No pill shapes (`rounded-full`). Rounded corners are minimal — this is
furniture, not candy.

Primary buttons on light backgrounds: `amber-600` bg, `white` text.
Primary buttons on dark backgrounds: `amber-600` bg, `white` text.
(Amber is the constant. It's the brass fixture that appears in every room.)

### Cards

```
rounded border border-stone-600 bg-stone-800 p-6
```

- No heavy shadows. Borders define edges, like the edge of a document.
- `rounded` not `rounded-lg` — restrained, not playful.
- Inner content follows the serif/sans-serif split: title in serif, content
  in sans-serif.

### The Bar (Divider)

The most important UI element. Borrowed from the courtroom railing.

```
border-t border-stone-600 my-6
```

When used to separate "evidence" from "action" in a case view, it should be
slightly more prominent:

```
border-t-2 border-amber-600/30 my-8
```

The amber tint signals: "you are crossing from reading to deciding."

### Badges / Tags

```
rounded bg-amber-950 px-2 py-0.5 text-xs font-medium text-amber-400 tracking-wide uppercase
```

For the Standard tier badge specifically:
```
rounded bg-amber-950 text-amber-400
```

For danger badges:
```
rounded bg-rose-950 text-rose-400
```

Badges use uppercase + tracking-wide. They are inscriptions — small, permanent
labels that classify.

---

## Friction Devices (Interaction Patterns)

### Weight Hierarchy

Actions are not equal. The visual weight of a control should match the weight
of its consequence.

1. **Light actions** (view, navigate, filter): Ghost buttons, text links.
   No visual barrier.
2. **Medium actions** (track, assign, note): Secondary buttons. One click.
3. **Heavy actions** (warn, mute, escalate): Primary buttons, but with
   contextual confirmation.
4. **Grave actions** (ban, delete): Two-step. First click transforms the
   button area — it expands, the color shifts from amber to rose, serif text
   appears asking "Are you sure?" This is the gavel moment.

### The Threshold Pattern

When a moderator moves from reviewing evidence to taking action, the UI should
mark that transition. Implementations:

- A horizontal divider with amber tint (the bar)
- A change in background tint (from stone-800 to stone-900 below the bar)
- Action buttons only appear below the bar
- The serif/sans-serif shift: the case summary above the bar uses serif
  headings; the action area below uses only sans-serif

---

## Iconography

- Prefer text labels over icons. When icons are necessary, use outlined
  (not filled) variants — the line weight should match the text.
- No emoji in the UI chrome. Emoji is for user content (Discord messages),
  not for the tool itself.
- If we ever need a logo mark, it should reference: scales (not of justice
  specifically, but of measurement/balance), a column/pillar, or wheat/laurel
  (Eunomia's seasonal associations).

---

## Motion

- Transitions: `duration-150` for hover states, `duration-200` for layout
  shifts. Never longer than 300ms.
- Easing: default ease. No bounce, no spring. Furniture doesn't bounce.
- The only place for meaningful animation is the threshold transition —
  when a confirmation panel expands after a destructive action click.

---

## Voice & Tone (UI Copy)

- **Labels**: Imperative, brief. "Track message", "View history", "Confirm ban".
- **Confirmations**: Direct but not dramatic. "Ban @user? This is permanent."
  Not "Are you absolutely sure you want to ban this user? This action cannot
  be undone!"
- **Empty states**: Factual. "No reports for this user." Not "Nothing to see
  here! 🎉"
- **Error states**: Honest. "Failed to load reports. Try again." Not "Oops!
  Something went wrong."

The tone is a magistrate's: measured, clear, without embellishment.

# Visual Aesthetic Options for Euno

## Source Material

### Eunomia: Goddess of Good Order

Eunomia is the daughter of Zeus and Themis (divine law), one of the three Horae
alongside Dike (Justice) and Eirene (Peace). Her name translates to "good order"
or "governance according to good laws" — _eu_ (good) + _nomos_ (law, custom).
She personified not the _enforcement_ of justice through punishment, but the
underlying condition that makes justice possible: sound institutions, fair
customs, citizens oriented toward the common good. Her conceptual opposite was
Dysnomia, the spirit of lawlessness and disorder.

The three Horae formed a causal sequence: good laws produce justice, justice
produces peace. Solon invoked _eunomia_ as the ideal political condition —
restraining hubris, fostering collective well-being. In art, she carried a staff
or scepter, sometimes scales, occasionally flowers connecting her to the seasonal
Horae.

### The Architecture of Judgment

Judicial architecture has never been neutral. From the Stoa Basileios (a modest
Doric colonnade where Socrates was charged) through Roman basilicas, medieval
great halls, neoclassical temples, and modern glass courthouses, every era has
designed judicial spaces to _create friction_. Steps slow the approach. Thresholds
mark transitions. Scale and material insist that ordinary carelessness must be set
aside.

The consistent thread: the architecture is a moral argument. The elevated bench
forces everyone to look up. The bar separates participants from observers. The
witness stand isolates. The jury box confines. Even modern security screening
performs the same function as a ceremonial staircase — it creates a pause, a
moment of heightened awareness.

Key vocabulary across eras:

- **Classical**: columns, symmetry, elevation, marble, bronze
- **Medieval**: wood paneling, carved screens, vaulted stone, candlelight
- **Neoclassical**: porticos, pediments, inscriptions, scales of justice
- **Modern**: glass transparency, natural light, controlled sightlines
- **Chambers**: raised-panel wainscoting, bookshelves, substantial desks, leather,
  dark carpet — "deliberately serious"

---

## Design Principles (Shared Across All Options)

These principles apply regardless of which aesthetic direction is chosen.

### 1. Form Follows Function Creates Friction

Moderation decisions affect real people. The interface should never let a
moderator act carelessly. This doesn't mean making things _hard_ — it means
making them _deliberate_. Every interaction that carries consequence should
require a conscious act, not a casual click.

- **Progressive disclosure**: Don't show the "confirm" button until the moderator
  has seen the evidence
- **Weight hierarchy**: Destructive actions (bans, message deletion) should feel
  heavier than informational actions (viewing reports, reading logs)
- **Transition states**: Moving from reading a report to taking action should feel
  like crossing a threshold — a visual shift that signals "you are now deciding"

### 2. The Eunomia Principle: Order Before Enforcement

Eunomia didn't personify punishment — she personified the conditions that make
justice possible. The tool should emphasize _understanding context_ before
_taking action_. The visual hierarchy should make it easier to read and
comprehend than to act.

- Information-dense layouts where the moderator needs to review
- Clear, spacious layouts where the moderator needs to decide
- The density/spaciousness shift itself communicates "you've moved from gathering
  to judging"

### 3. Dual Register: Workbench and Bench

Courthouses have two modes: the working spaces (chambers, clerk offices) and
the ceremonial spaces (courtrooms). Euno needs both:

- **Workbench mode**: Dense, efficient, optimized for throughput — reviewing
  queues, scanning logs, routine triage. This is the chambers.
- **Bench mode**: Deliberate, spacious, focused — reviewing a specific case,
  deciding on an escalation, confirming a ban. This is the courtroom.

The interface should shift between these registers based on what the moderator is
doing, not based on what page they're on.

---

## Option A: The Magistrate's Desk

**Reference**: Judge's chambers — wood paneling, substantial furniture, the
gravity of a private workspace where consequential decisions are made.

**Color palette**:

- Background: Deep warm neutrals — not pure gray but slightly warm, like aged
  paper or oak-lit rooms. `stone-900`, `stone-800`, `stone-700` for the dark
  theme.
- Accent: Deep amber/gold — `amber-600`, `amber-500`. Evokes brass fixtures,
  gilt lettering, the warmth of a desk lamp.
- Danger: `rose-700` stays — blood-serious.
- Success/resolved: `emerald-700` stays — the seal of completion.
- Text: `stone-100`, `stone-300` — warm whites, not blue-whites.

**Typography**:

- A serif or semi-serif for headings — something like Lora, Libre Baskerville,
  or Source Serif Pro. This is the most direct signal of judicial gravity.
- A clean sans-serif for body/UI text — Inter, still. Readability is paramount.
- The contrast between serif headings and sans-serif body creates the
  "threshold" — headings feel institutional, body text feels functional.

**Surface treatment**:

- Subtle texture or very slight warmth in backgrounds — not flat gray but
  something that reads as _material_
- Borders that feel like edges of paper or wood — `stone-600` with 1px, not
  rounded to softness but `rounded-sm` or `rounded`
- Cards and panels feel like documents laid on a desk — slight shadow, clear
  edges, stacked

**Friction devices**:

- Destructive actions use a two-step pattern: first click reveals the
  confirmation, which uses a different visual register (wider spacing, serif
  text, the amber accent shifting to rose)
- The "action area" of any case view is visually separated from the "evidence
  area" — a literal bar/divider, the courtroom railing made digital

**Mood**: Sitting at a substantial desk, case files open, considering the
evidence. Warm but not cozy. Serious but not cold.

---

## Option B: The Glass Courthouse

**Reference**: Modern judicial architecture — transparency, natural light,
the tension between openness and gravity. The Multnomah County Courthouse,
the Los Angeles Federal Courthouse.

**Color palette**:

- Background: Cool slate — `slate-900`, `slate-800`, `slate-700`. Cleaner and
  cooler than Option A.
- Accent: Clear blue — `blue-500`, `blue-600`. Evokes daylight through glass,
  institutional clarity. Not playful blue — _serious_ blue, the blue of a
  federal seal.
- Danger: `red-600` — more stark than rose, like a stop sign.
- Success: `teal-600` — balances the blue, feels resolved.
- Text: `slate-100`, `slate-300` — cool whites.

**Typography**:

- All sans-serif. A geometric sans like Outfit, Geist, or even the current
  Tailwind default. Modern courthouses don't reference the past — they assert
  contemporary authority.
- Weight hierarchy does more work here: `font-light` for ambient information,
  `font-medium` for important, `font-bold` only for critical.

**Surface treatment**:

- Glass-like panels: subtle border + slight transparency/backdrop blur on
  overlays and modals
- Clean, thin borders — `slate-600`, 1px, `rounded-md`
- Generous whitespace — the modern courthouse's most powerful tool
- Light comes from the content: brighter panels against darker backgrounds

**Friction devices**:

- Actions that carry consequence slide open a panel rather than showing a
  modal — the spatial expansion _is_ the friction
- Destructive actions shift the entire color temperature: the panel becomes
  warmer (reds, ambers) to signal that the neutral observation space has become
  a decision space
- The queue/triage view is dense and compact; clicking into a case expands
  into generous space, like walking from the hallway into the courtroom

**Mood**: Standing in a modern atrium, light pouring through glass walls. The
architecture is minimal but the scale commands respect. Everything visible,
nothing hidden, but the openness itself creates a kind of accountability.

---

## Option C: The Stoa

**Reference**: The original — the open Greek colonnade where civic business
was conducted. Not the grand temple, but the functional covered walkway.
The Stoa Basileios where Socrates was charged was eighteen meters long.
Modest. Functional. Consequential.

**Color palette**:

- Background: True neutrals with a slight olive/earth undertone — `neutral-900`,
  `neutral-800`, `zinc-700`. Mediterranean stone, not Scandinavian gray.
- Accent: Muted terracotta or clay — `orange-700`, `orange-800`. The color of
  fired pottery and Mediterranean earth. Warm but not bright — _earthen_.
- Secondary accent: Deep olive — `green-800`, `green-900`. The columns' patina.
- Danger: `red-800` — dark, not alarming but grave.
- Text: `neutral-100`, `neutral-300`.

**Typography**:

- A humanist sans-serif — Source Sans Pro, Noto Sans, or IBM Plex Sans.
  These have the proportions of Roman inscriptions but the clarity of modern
  type. They feel _civic_ without feeling _corporate_.
- Slightly more generous letter-spacing on headings — `tracking-wide` — to
  evoke inscriptions without pastiche.

**Surface treatment**:

- Minimal decoration. The Stoa was a covered walkway, not a palace.
- Flat surfaces, no shadows — information laid out on a stone surface
- Strong horizontal rules — `border-b` in `neutral-600` — evoking the
  horizontal emphasis of classical architecture (entablature, stylobate)
- Content organized in clear columns, like a colonnade creating rhythm

**Friction devices**:

- The stoa was a _public_ space. Friction comes from visibility and
  accountability, not from ceremony.
- Moderation actions show who took them and when — the friction is social,
  not procedural
- The layout emphasizes the _record_ — what was done, by whom, in what
  context — making every action feel like it's being inscribed in stone
- Less modal/overlay pattern, more inline expansion — everything stays
  on the record, in view

**Mood**: Standing in the shade of a colonnade, the agora bustling beyond.
The space is functional, public, and unpretentious — but everyone knows
that what's decided here will be remembered.

---

## Comparison Matrix

| Dimension | A: Magistrate's Desk | B: Glass Courthouse | C: The Stoa |
| --- | --- | --- | --- |
| Temperature | Warm | Cool | Earthy |
| Formality | High | High | Moderate |
| Historical reference | 18th-19th c. chambers | 21st c. modernism | 5th c. BCE Athens |
| Friction mechanism | Ceremony, threshold | Space, temperature shift | Visibility, record |
| Primary accent | Amber/gold | Clear blue | Terracotta/clay |
| Typography | Serif + sans mix | All sans-serif | Humanist sans |
| Surface feel | Material, textured | Glass, transparent | Stone, flat |
| Density model | Documents on desk | Hallway → courtroom | Colonnade rhythm |
| Eunomia connection | The law library | Democratic transparency | The original civic space |

---

## Recommendation

**Option A (Magistrate's Desk)** is the strongest fit for a moderation tool.

1. **Warmth matters for sustained use.** Moderators spend hours in this
   interface reviewing difficult content. Cool, clinical interfaces create
   fatigue. The warm neutrals and amber accents of Option A create a workspace
   that's serious without being harsh.

2. **The serif/sans-serif split is a powerful friction device.** When headings
   shift from "Report #1847" in a serif to the action buttons in sans-serif,
   the typographic shift itself signals a change in register. This is cheap
   to implement and immediately legible.

3. **The "documents on a desk" metaphor is intuitive.** Moderation _is_
   reviewing case files. Cards as documents, stacking, clear edges — this maps
   directly to the mental model.

4. **It ages well.** The magistrate's desk aesthetic has been the baseline for
   professional decision-making interfaces for centuries. It won't feel dated
   in two years the way a glass-effect UI might.

Elements worth borrowing from the others:

- From B: The **spatial expansion** when moving from queue to case review.
  Dense triage → spacious deliberation.
- From C: The emphasis on the **record** — making the audit trail of who did
  what feel permanent and visible. Inscribed, not ephemeral.

### Proposed Accent Palette (Option A, refined)

```
Primary:      amber-600 (#d97706) — action, navigation, focus
Primary-dark: amber-700 (#b45309) — hover, active states
Surface-1:    stone-900 (#1c1917) — deepest background
Surface-2:    stone-800 (#292524) — panels, sidebar
Surface-3:    stone-700 (#44403c) — cards, elevated surfaces
Border:       stone-600 (#57534e) — subtle divisions
Text-primary: stone-100 (#f5f5f4) — primary text
Text-secondary: stone-400 (#a8a29e) — secondary text
Danger:       rose-700  (#be123c) — destructive actions
Success:      emerald-700 (#047857) — resolved, complete
```

# Euno: Product State Report

_February 2026_

## What Euno Is

Euno is a Discord moderation bot for large community servers. It gives moderator
teams the tooling to handle reports, track problem users, detect and remove spam,
and make collective decisions about enforcement — all without leaving Discord.

The tagline on the landing page is: "A community-in-a-box bot for large Discord
servers with advanced analytics and moderation tools."

That's mostly right, but undersells what the product actually is. Euno's real
value proposition is **institutional memory for moderation teams.** Discord's
built-in moderation is stateless — it tells you what happened just now. Euno
tells you what happened _over time_ with a specific user, and makes sure your
team agrees on what to do about it.

---

## Target Customer

**Large Discord communities (500+ members) with volunteer or semi-professional
moderation teams of 3+ people.**

The sweet spot is servers where:

- Mod teams are large enough that individuals don't have full context on every
  user.
- Spam volume is high enough that manual review is a bottleneck.
- The community cares about fair, consistent moderation (not just banning on
  instinct).

This maps to: open-source project servers, gaming communities, educational
communities, creator/fan servers, and professional communities (like Reactiflux,
where Euno was built and battle-tested).

**Who this is _not_ for:**

- Small friend groups (< 100 members). The coordination overhead isn't worth it.
- Servers that want a pure automod. Euno's automod is good, but it's a
  complement to human moderation, not a replacement.
- Servers looking for engagement/leveling bots, music bots, or general-purpose
  bots. Euno is opinionated about moderation and doesn't try to do everything.

---

## Feature Inventory

### Core Loop: Report → Track → Escalate → Resolve

This is the product's backbone and its strongest differentiator.

1. **Anonymous community reports.** Any member can right-click a message and
   report it. Reports are anonymous to prevent retaliation — a real problem in
   large communities. Reports land in a per-user moderation thread that
   accumulates history over time.

2. **Staff message tracking.** Moderators can right-click a message to "track"
   it in a user's moderation thread without taking action. This builds a paper
   trail. Tracked messages include a button to delete them if needed.

3. **Moderation history (`/modreport`).** Any moderator can pull up a user's
   full report: total report count with recency indicators, a 6-month sparkline,
   breakdown by reason, top channels, reporting staff, and recent mod actions.
   This is the "is this person actually a problem or was it a one-time thing?"
   command.

4. **Escalation voting.** When a situation needs team input, moderators escalate
   to a vote. The system supports graduated responses (track, timeout, restrict,
   kick, ban), quorum-based voting, and time-based auto-resolution. Ties default
   to "track" (no action). This is democratic moderation — no single mod acts
   unilaterally on ambiguous cases.

### Automated Spam Detection

A multi-signal scoring pipeline that runs on every message:

- **Content analysis:** keyword matching across categories (scam, NSFW, crypto,
  phishing), mass ping detection, high mention density, zalgo text, URL
  patterns.
- **Behavioral analysis:** account age, server tenure, new-account rapid-fire
  posting patterns.
- **Velocity analysis:** cross-channel duplicate spam, channel hopping, rapid
  messaging, duplicate messages.
- **Honeypot channels:** designate a channel as a trap; any message there = automatic softban.

Graduated response based on confidence score:

| Score   | Action                         |
| ------- | ------------------------------ |
| 0–5     | None                           |
| 6–9     | Log only                       |
| 10–14   | Delete + apply restricted role |
| 15–99   | Delete + timeout user          |
| 100+    | Softban (honeypot)             |

After 3 high-tier spam detections, the user is auto-kicked. This is
deliberately conservative — false positives destroy community trust.

### Message Deletion Logging

Every deleted message is captured (from cache or Discord's partial data) and
logged to a per-user deletion log thread. Includes audit log lookups for who
deleted what. This means moderators can always see what was said, even after
someone deletes their messages to cover their tracks.

### Mod Action Recording

All kicks, bans, unbans, and timeouts are recorded with the executor, reason,
and timestamp. This feeds into `/modreport` and creates an audit trail that
survives staff turnover.

### Tickets

A configurable private ticket system. Admins set up a button in a channel;
users click it, fill out a form, and a private thread is created with the mod
team pinged. Simple, but it's table-stakes for community servers.

### Reactji Forwarding

Configure an emoji + threshold; when a message gets enough reactions, it's
forwarded to a designated channel. Commonly used for "best of" or "highlights"
channels. Supports both unicode and custom emojis.

### Force Ban

Context menu action to ban users who aren't currently in the server. Useful for
ban-evasion situations where the alt account has already left.

### Web Dashboard

- Guild settings configuration (moderator role, log channels)
- Subscription management with Stripe integration
- Admin panel for internal use (guild overview, subscription status, feature
  flags, PostHog analytics)
- Discord OAuth authentication
- Data export endpoint for paid users

Available at https://euno.reactiflux.com/. The dashboard is not the primary
interface — Discord is. The dashboard is for setup, billing, and the admin view.

---

## Commercial Model

| Tier     | Price     | What you get                                                       |
| -------- | --------- | ------------------------------------------------------------------ |
| Free     | $0        | Core bot functionality (specifics TBD via feature flags)           |
| Standard | $100/year | Anonymous reports, ticketing, auto-kick spammers, decision tools   |
| Custom   | Contact   | Dedicated instance, stable version, SLA support                    |

The paid tier includes a 90-day trial via Stripe. Feature gating is handled at
two layers: subscription tier checks in the application code, and PostHog
feature flags for rollout control. The features currently behind flags are:
mod-log, anon-report, escalate, ticketing, analytics, and deletion-log.

**Current state of the billing system:** Stripe integration is fully wired —
checkout, webhooks, cancellation, and lifecycle management all work. There are no
paying customers yet. The single production guild (Reactiflux) has no
subscription record in the database.

---

## What Euno Does Well

1. **Per-user moderation threads are the killer feature.** Discord gives you
   audit logs and automod, but neither creates a narrative. Euno creates a
   persistent, growing record for each user that any moderator can review. When
   someone says "this user has been a problem for months," there's a thread to
   prove it.

2. **The escalation voting system is novel for this space.** Most moderation
   bots give one person a hammer. Euno gives the team a ballot. Quorum-based
   voting with time-based auto-resolution is a meaningful innovation for
   preventing both inaction and overreaction.

3. **Spam detection is tuned for precision over recall.** The graduated response
   system and the 3-strikes-before-kick policy show a product built by someone
   who's been burned by false positives. Cross-channel duplicate detection and
   honeypot channels are particularly effective against bot raids.

4. **Anonymous reporting removes a real barrier.** In communities with power
   dynamics (e.g., a newer member reporting a well-known one), anonymity
   matters. This isn't commonly available in moderation bots.

5. **The deletion log is underrated.** Users deleting problematic messages is a
   constant headache for mod teams. Capturing and attributing deletions is
   genuinely useful.

---

## What Euno Does Not Attempt

1. **No AI/LLM-powered content moderation.** All analysis is rule-based and
   statistical. No toxicity scoring, no sentiment analysis, no contextual
   understanding. This is a deliberate choice — it keeps the system predictable,
   debuggable, and free from the trust issues that come with AI moderation.

2. **No engagement or community-building features.** No leveling, XP, welcome
   messages (beyond the bot's own setup), role rewards, giveaways, or social
   features. Euno is moderation infrastructure, not a community engagement
   platform.

3. **No automod rule builder.** Discord's built-in automod lets admins create
   keyword filters and regex rules. Euno doesn't replicate or extend that — it
   integrates with Discord's automod by logging trigger events.

4. **No cross-server moderation (yet).** Each guild is currently independent.
   Server federation — enabling mod teams from different communities to share
   news of moderation decisions and collaborate — is on the roadmap. The intent
   is coordination, not automation: no shared ban lists or automatic
   enforcement, but visibility across allied communities so mod teams can make
   informed decisions together.

5. **No mobile-friendly dashboard.** The web portal is desktop-oriented and
   secondary to the Discord interface anyway.

6. **No self-hosting path.** The product is SaaS. There's no documentation or
   configuration for running your own instance (beyond development).

---

## Honest Assessment of Readiness

### What's solid

- The Discord bot functionality is production-tested on Reactiflux. The core
  loop (report → track → escalate → resolve) works.
- Spam detection is mature, with cross-channel analysis and graduated responses.
- The codebase is well-architected (Effect-TS, observability throughout,
  migrations, CI/CD to Kubernetes).
- Stripe billing is fully integrated and functional.
- Feature flagging via PostHog allows controlled rollout.

### What needs attention before scaling

- **The free vs. paid boundary is undefined in practice.** The upgrade page
  lists 4 benefits, but the actual mapping of features to tiers is controlled by
  PostHog flags that can be toggled independently of subscription status. There's
  no clear "try free, hit the wall, pay to continue" moment. This needs to be a
  deliberate product decision, not an artifact of the flag system.

- **The landing page is minimal.** "A community-in-a-box bot" and two buttons.
  No feature explanations, no screenshots, no social proof, no pricing on the
  homepage. A customer evaluating Euno against competitors (Wick, Carl-bot,
  Dyno) has nothing to go on. The upgrade page copy is also incomplete — there
  are empty TODO comments for the pitch copy.

- **Custom tier has no implementation.** The "Contact Sales" button submits a
  form but the handler is a TODO comment. There's no way for a custom-tier
  prospect to actually reach you.

- **Only one guild in production.** The bot has been tested in one environment.
  Multi-guild edge cases (permission variations, channel structure differences,
  concurrent guild operations) are untested at scale.

---

## Recommendations for Launch

1. **Define the free tier explicitly.** Pick 2-3 features that are genuinely
   useful standalone (e.g., spam detection + deletion logging) and make them
   always-on. The paid tier should unlock the coordination features
   (reports, escalations, tickets) that only matter to teams.

2. **Write the landing page.** The product is good; the pitch doesn't exist yet.
   Screenshots of the moderation thread, the `/modreport` output, and the
   escalation vote would sell this better than bullet points.

3. **Get to 3-5 guilds before marketing push.** One guild is dogfooding. Three
   to five gives you confidence in the multi-tenant path and gives you early
   testimonials.

4. **Lean into federation as the roadmap story.** "Your mod team can collaborate
   with allied communities" is a compelling differentiator that no major
   competitor offers. Even before it ships, it positions Euno as the bot for
   communities that take moderation seriously — not just individual servers, but
   networks of servers. This is worth featuring in marketing materials as
   "coming soon."

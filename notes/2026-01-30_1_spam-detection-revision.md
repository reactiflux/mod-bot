# Spam Detection Revision

Implements GitHub Issue #268: Multi-signal scoring pipeline with graduated responses.

## Architecture

The spam detection system is organized as `app/features/spam/` with a clear
separation between pure analysis functions and Effect-based service code.

### Pure Modules (no Effect, no I/O)

- **spamPatterns.ts** — Keyword lists organized by category (scam, nsfw, crypto, phishing)
- **contentAnalyzer.ts** — Keyword matching, link ratio, mention density, zalgo detection
- **behaviorAnalyzer.ts** — Account age scoring, server tenure, role checks
- **velocityAnalyzer.ts** — Channel-hop detection, duplicate detection, rapid-fire
- **spamScorer.ts** — Types (SpamSignal, SpamVerdict, ConfidenceTier), thresholds, computeVerdict()
- **recentActivityTracker.ts** — In-memory Map with bounded circular buffer per user

### Effect Modules

- **service.ts** — `SpamDetectionService` wires analyzers + honeypot cache + DB checks
- **spamResponseHandler.ts** — Graduated response execution (delete, restrict, timeout, kick, softban)

## Scoring Thresholds

| Tier    | Score | Action                          |
|---------|-------|---------------------------------|
| none    | 0-5   | No action                       |
| low     | 6-9   | Log to mod thread only          |
| medium  | 10-14 | Delete + apply restricted role  |
| high    | 15+   | Delete + timeout user           |
| honeypot| 100+  | Softban (ban + unban, 7 days)   |

3+ cumulative high-tier reports → auto-kick (preserves old AUTO_SPAM_THRESHOLD behavior).

## Key Design Decisions

1. **Threshold shift from 4 to 6**: The old system triggered on score 4 (a link + 2 keywords).
   The new system intentionally requires more evidence — content alone rarely exceeds 5, but
   behavioral signals (new account, just joined) push real spammers into medium/high tiers.

2. **Honeypot unified into pipeline**: Instead of a separate MessageCreate listener,
   honeypot checking is done inside SpamDetectionService with the same caching pattern.
   Moderators are still exempt.

3. **In-memory tracker**: Lives in the Layer closure, bounded to 20 messages per user,
   cleaned every 10 minutes. Lost on restart, which is fine — spammers act in seconds.

## Files Removed

- `app/helpers/isSpam.ts` — replaced by contentAnalyzer.ts + spamPatterns.ts
- `app/helpers/isSpam.test.ts` — replaced by contentAnalyzer.test.ts
- `app/discord/honeypotTracker.ts` — absorbed into service.ts

# Fixture Generation System

## Overview

Implemented a fixture data generation system for non-production environments (staging, local dev). Runs as part of `start:staging` flow after migrations.

## Files Created

```
scripts/fixtures/
├── constants.ts           # Single source of truth for test IDs
├── integrity-checks.ts    # Data consistency validation
├── seed-fixtures.ts       # Known Discord fixture data
├── generate-historical.ts # Historical record generation
├── index.ts              # Re-exports
└── run.ts                # Orchestrator
```

## Usage

```bash
npm run seed:fixtures     # Run fixture setup
npm run start:staging     # Migrations + fixtures + bot
```

## Architecture Decisions

### Single Source of Truth
`scripts/fixtures/constants.ts` centralizes all fixture IDs:
- Test user IDs
- Test guild IDs
- Test session IDs
- Stripe test IDs
- Channel IDs for historical data

Both `scripts/seed-e2e.ts` and `tests/e2e/fixtures/db.ts` now import from this shared module.

### Integrity Checks
Validates data consistency before seeding:
- Orphaned guild_subscriptions (no parent guild)
- Invalid product_tier values
- Orphaned escalation_records
- Expired sessions
- Invalid reported_messages reasons
- Messages with future timestamps

Outputs warnings but doesn't fail - informational only.

### Historical Data Generation
Uses seeded random for reproducibility (seed=42):
- 7 days of message_stats (~350 records)
- 5 reported_messages
- 2 escalations with votes

All use `onConflict(doNothing)` for idempotency.

## Package.json Changes

- `seed:fixtures`: New script for fixture runner
- `start:staging`: Changed from `seed:e2e` to `seed:fixtures`
- `seed:e2e`: Kept for backwards compatibility (deprecated)

## Gotchas

Scripts using `#~/db.server` require `import "dotenv/config"` at top level - the env vars aren't loaded automatically like in the main app entry points.
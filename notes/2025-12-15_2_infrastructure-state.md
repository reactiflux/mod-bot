# Infrastructure State

Consolidated view of CI/CD, preview environments, and fixture systems.

## Current Architecture

```
PR → main (production)
    ↓
    - CI runs lint, typecheck, vitest on PR branches
    - CD builds image on all pushes, deploys production on main
    - Preview deploys on non-main branches with open PRs
```

**Preview Environments**: Per-PR at `https://<pr-number>.euno-staging.reactiflux.com`

## Workflows

| Workflow    | Trigger                        | Purpose                                                        |
| ----------- | ------------------------------ | -------------------------------------------------------------- |
| ci.yml      | push (non-main), workflow_call | lint, typecheck, vitest; e2e when called with preview_url      |
| cd.yml      | push (all)                     | Build image; deploy production (main) or preview (PR branches) |
| preview.yml | PR closed/labeled              | Cleanup preview resources only                                 |

Preview deploy and E2E orchestration consolidated into cd.yml.

## Fixture Generation System

```
scripts/fixtures/
├── constants.ts           # Single source of truth for test IDs
├── integrity-checks.ts    # Data consistency validation
├── seed-fixtures.ts       # Known Discord fixture data
├── generate-historical.ts # Historical record generation (seeded random)
├── db.ts                  # Database operations
├── index.ts              # Re-exports
└── run.ts                # Orchestrator
```

- `npm run seed:fixtures` - runs fixture setup
- `npm run start:staging` - migrations + fixtures + bot
- Uses `node --experimental-strip-types` (not tsx)
- Uses `onConflict(doNothing)` for idempotency

## Known Issues

### Stripe Webhooks Don't Work in Previews

Each preview has unique URL but Stripe only has one registered webhook endpoint. Payment flow E2E tests in preview environments won't receive webhooks.

**Status**: Architectural limitation. Options:

- Mock Stripe in previews
- Document payment testing as local-only
- Shared staging webhook with routing

### waitForTimeout Anti-Pattern

`tests/e2e/payment-flow.spec.ts:159` uses hardcoded `waitForTimeout(2000)`.

**Fix**: Replace with condition-based wait.

### GH Pages Permissions May Be Missing

`ci.yml:118-125` uses peaceiris/actions-gh-pages but doesn't declare `contents: write` permission.

**Impact**: Report deploy may fail with permission errors.

## Preview Environment Setup (Manual Steps)

Required before workflow functions:

1. **DNS**: Wildcard A record `*.euno-staging.reactiflux.com → <ingress IP>`
2. **Namespace**: `kubectl create namespace staging`
3. **Discord App**: Create staging app with OAuth redirect
4. **Secret**: modbot-staging-env created automatically by cd.yml on first preview deploy

TLS handled via cert-manager HTTP-01 per-preview.

## Proposed Future Architecture (Not Implemented)

Main as staging with promotion to release branch:

```
PR → main (staging) → release (production)
```

Benefits: RC validation with real users, explicit promotion, staging Discord bot.

See `2025-12-14_1_ci-cd-architecture-review.md` for full proposal.

## Key Files

| Purpose             | File                            |
| ------------------- | ------------------------------- |
| CI                  | .github/workflows/ci.yml        |
| CD + Preview deploy | .github/workflows/cd.yml        |
| Preview cleanup     | .github/workflows/preview.yml   |
| Production K8s      | cluster/deployment.yaml         |
| Preview K8s         | cluster/preview/deployment.yaml |
| Fixtures            | scripts/fixtures/               |
| E2E tests           | tests/e2e/payment-flow.spec.ts  |

## Open Questions

1. Is payment flow testing in preview environments required, or local-only?
2. Should preview environments skip Discord integration entirely?
3. What's the intended behavior if E2E tests fail - should it block the PR?

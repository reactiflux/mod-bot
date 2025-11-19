# CI Integration for Playwright E2E Tests

## Overview

Successfully integrated Playwright E2E tests into the GitHub Actions CI pipeline. The tests were already working locally but weren't being run in CI, leaving the payment flow and other critical paths untested in the automated pipeline.

## Changes Made

### 1. GitHub Actions Workflow (.github/workflows/node.js.yml)

Added new `e2e` job to run Playwright tests:
- Installs Playwright browsers with dependencies (Chromium only for speed)
- Caches Playwright browsers to improve subsequent run times
- Configures environment variables for test execution
- Uses dedicated test database file (`test-db.sqlite3`) for isolation
- Uploads test artifacts (HTML reports, screenshots, videos) on failure
- Retains artifacts for 30 days for debugging

**Environment Variables Configured:**
- `CI=true` - Triggers CI-specific Playwright config
- `DB_FILE=./test-db.sqlite3` - Isolated test database
- `STRIPE_TEST_SECRET_KEY` - From GitHub Secrets (needs to be added)
- `STRIPE_TEST_PUBLISHABLE_KEY` - From GitHub Secrets (needs to be added)
- Discord vars set to test placeholders (tests use mocked responses)

### 2. Documentation Updates

**CONTRIBUTING.md:**
- Added "GitHub Secrets for CI" section
- Documented required Stripe test keys with instructions on where to obtain them
- Listed all deployment-related secrets for reference
- Emphasized that only TEST mode Stripe keys should be used

**tests/e2e/README.md:**
- Expanded CI/CD section with comprehensive details
- Documented CI configuration features (retries, workers, artifacts)
- Explained required environment variables
- Added instructions for viewing test results from CI runs
- Documented database isolation strategy

**README.md:**
- Added CI status badge for visibility

## Required Manual Steps

### Add GitHub Secrets

The following secrets must be added to the GitHub repository (Settings → Secrets and variables → Actions):

1. `STRIPE_TEST_SECRET_KEY` - Get from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) in test mode (sk_test_...)
2. `STRIPE_TEST_PUBLISHABLE_KEY` - Get from Stripe Dashboard in test mode (pk_test_...)

**Important:** These are TEST mode keys only and will not charge real money.

## CI Configuration Highlights

The Playwright config already had excellent CI optimizations:
- Forbids `.only()` in CI to prevent accidental test skipping
- Configures 2 retries for flaky test resilience
- Uses single worker in CI for stability (prevents database race conditions)
- Always starts fresh dev server (no reuse in CI)
- GitHub reporter for nice PR annotations
- Screenshots on failure + video recording

## Test Coverage

Current E2E test suite (11 tests in `payment-flow.spec.ts`):
- Onboarding flow tests (free/pro guilds)
- Upgrade page display
- Complete Stripe checkout flow (real Stripe test mode)
- Payment success/cancel pages
- Error handling (missing parameters)
- Database isolation verification

## Technical Details

### Browser Installation
Uses `npx playwright install --with-deps chromium` to install only Chromium browser with system dependencies, keeping CI runs fast.

### Browser Caching
Implemented `actions/cache@v4` to cache `~/.cache/ms-playwright` directory, keyed by OS and package-lock.json hash. This significantly speeds up subsequent CI runs.

### Database Isolation
Tests use a dedicated `test-db.sqlite3` file in CI to avoid conflicts with other jobs. Each test automatically cleans up after itself using fixtures defined in `tests/e2e/fixtures/db.ts`.

### Artifact Retention
Test artifacts (HTML report, screenshots, videos) are uploaded with 30-day retention using the `if: always()` condition, ensuring they're available even when tests fail.

## Performance

Local test execution:
- Full suite: ~13 seconds
- Stripe checkout test: ~11 seconds

CI execution expected to be similar, possibly slightly slower due to cold start.

## Next Steps

1. Add the required Stripe test keys to GitHub Secrets
2. Monitor first CI run to ensure everything works correctly
3. Consider expanding test coverage:
   - Payment failure scenarios (declined cards)
   - Subscription cancellation flows
   - Different card types/countries
   - Webhook handlers
4. Future: Add multi-browser testing (Firefox, Safari) if needed

## Benefits

- Automated testing of critical payment flow on every PR
- Catches regressions before they reach production
- Screenshots and videos available for debugging failures
- Test results visible in PR checks
- GitHub reporter provides inline annotations for failures

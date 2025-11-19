# E2E Tests

End-to-end tests for the Euno payment flow using Playwright.

## Running Tests

```bash
npm run test:e2e
# or
npm run test:e2e:ui
```

## Test Coverage

## Visual Regression Testing

Baseline screenshots are stored in `tests/e2e/payment-flow.spec.ts-snapshots/`.

To update baselines:

```bash
npx playwright test --update-snapshots
```

## CI/CD

### CI Configuration

E2E tests run automatically on every pull request and push to main via GitHub Actions.

The tests are configured to:

- Run with 2 retries in CI for flaky test resilience
- Use a single worker in CI for stability (prevents database race conditions)
- Always start a fresh dev server (no reuse in CI)
- Generate HTML reports with screenshots and videos
- Upload test artifacts on failure (retained for 30 days)
- Forbid `.only()` to prevent accidental test skipping
- Cache Playwright browsers for faster subsequent runs

### Required Environment Variables

CI tests require the following environment variables (configured via GitHub Secrets):

- `STRIPE_TEST_SECRET_KEY` - Stripe test mode secret key
- `STRIPE_TEST_PUBLISHABLE_KEY` - Stripe test mode publishable key

Discord-related variables are set to test placeholders in CI since the tests use mocked Discord responses.

### Database Isolation

Tests in CI use a dedicated test database file (`test-db.sqlite3`) to avoid conflicts with other jobs. Each test automatically cleans up after itself using fixtures.

### Viewing Test Results

After CI runs complete, test artifacts (screenshots, videos, HTML reports) are available in the GitHub Actions run:

1. Navigate to the Actions tab in GitHub
2. Click on the failed workflow run
3. Download the "playwright-report" artifact
4. Extract and open `playwright-report/index.html` in a browser

Or view the HTML report locally after a test run:

```bash
npx playwright show-report
```

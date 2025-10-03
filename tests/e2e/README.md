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

The tests are configured to:

- Run with 2 retries in CI
- Use a single worker in CI for stability
- Start the dev server automatically
- Generate an HTML report

View the HTML report after a test run:

```bash
npx playwright show-report
```

# CI/CD DevOps Review - Pre-Launch Audit

Review of GitHub Actions, npm commands, and supporting scripts following major architectural changes to the preview environment system.

## Critical Issues (Must Fix)

### 1. Dockerfile Missing Scripts Directory

**Location**: `Dockerfile:17-28`

The staging startup command `npm run start:staging` calls `npm run seed:fixtures`, which executes `tsx scripts/fixtures/run.ts`. However, the Dockerfile does not copy the `scripts/` directory into the production image.

```dockerfile
# What's copied:
COPY --from=build /app/build ./build
ADD index.prod.js ./
COPY kysely.config.ts ./
COPY migrations ./migrations
# Missing: scripts/
```

**Impact**: Preview deployments using `start:staging` will crash on startup with "module not found" error.

**Fix**: Add `COPY scripts ./scripts` to Dockerfile, OR create a separate staging Dockerfile, OR inline the seed logic differently.

---

### 2. E2E Test Database Isolation Problem

**Location**: `tests/e2e/fixtures/db.ts:15-25`, `tests/e2e/payment-flow.spec.ts`

When running against remote previews (`E2E_PREVIEW_URL` set), the DbFixture returns pre-seeded fixture data instead of creating new records. This design assumes tests only READ data.

However, `payment-flow.spec.ts` tests Stripe checkout, which:
1. Redirects to Stripe
2. Completes payment
3. Stripe fires webhook to the preview server
4. Server updates database
5. Test verifies upgrade

**Problem**: The test completes Stripe checkout but cannot verify the database was updated because:
- The test fixture returns hardcoded data
- There's no API endpoint to query subscription state
- The webhook has no configured Stripe webhook endpoint per preview

**Impact**: The payment flow test will either:
- Pass falsely (if it only checks UI text)
- Fail/timeout (if webhook never fires)
- Be flaky depending on Stripe webhook timing

**Fix Options**:
1. Add an API endpoint that returns guild subscription state for E2E verification
2. Mock Stripe checkout entirely in remote mode
3. Only run payment tests locally with real database access

---

### 3. Stripe Webhooks Won't Work in Preview Environments

**Location**: `preview.yml:68`, preview deployment env

Each preview environment has a unique URL like `https://123.euno-staging.reactiflux.com`. Stripe webhooks require a registered endpoint URL, but:
- Stripe dashboard only has a single webhook URL configured
- Dynamic preview URLs aren't registered
- The `STRIPE_WEBHOOK_SECRET` is set but Stripe won't know to send webhooks there

**Impact**: Any test or manual validation involving Stripe payments will fail in preview environments.

**Fix Options**:
1. Use Stripe CLI forwarding during E2E runs (complex)
2. Configure a shared staging webhook endpoint that routes based on header/metadata
3. Mock Stripe in preview environments
4. Document that payment testing requires local environment

---

## High Priority Issues

### 4. GitHub Pages Permissions for Test Reports

**Location**: `ci.yml:118-125`

The workflow uses `peaceiris/actions-gh-pages` to deploy test reports but doesn't declare required permissions:

```yaml
# Missing:
permissions:
  contents: write  # Required for gh-pages push
  pages: write     # Required if using GitHub Pages
```

**Impact**: Report deployment may fail with permission errors.

**Fix**: Add permissions block to the e2e job or workflow level.

---

### 5. First Preview Deploy Restart Issue

**Location**: `preview.yml:78`

```yaml
kubectl rollout restart statefulset/mod-bot-pr-${{ github.event.pull_request.number }}
```

On first deploy, the `apply` creates the StatefulSet, then `rollout restart` is called. This should work, but:
- If apply fails silently, restart will error
- There's no error handling if the StatefulSet doesn't exist

Consider: Move restart inside the wait-for-rollout or make it conditional.

---

### 6. waitForTimeout Anti-Pattern

**Location**: `payment-flow.spec.ts:159`

```typescript
await authenticatedPage.waitForTimeout(2000);
```

Hard-coded waits are flaky. This should wait for a specific condition:

```typescript
await expect(authenticatedPage.getByText("subscription updated")).toBeVisible();
// or
await authenticatedPage.waitForResponse(resp => resp.url().includes('/stripe/webhook'));
```

---

## Medium Priority Issues

### 7. Duplicate Docker Builds on PR Push

**Location**: `cd.yml:9` (`on: push`) and `preview.yml:4` (`on: pull_request`)

When a PR is pushed:
1. `cd.yml` triggers (push event) - builds image but doesn't push (line 44 condition)
2. `preview.yml` triggers (pull_request.synchronize) - builds and pushes image

**Impact**: Wasted CI minutes, ~3-5 min per push.

**Fix**: Either:
- Add `branches-ignore: ['**']` except main/develop to cd.yml push trigger
- Or add `if: github.event_name != 'pull_request'` to cd.yml build job

---

### 8. Concurrency Group Collision Risk

**Location**: `ci.yml:4-6`

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
```

When called via `workflow_call` from preview.yml, `github.ref` is the PR branch ref. If someone pushes directly to a branch (not via PR) while a preview workflow is running, they might cancel each other.

**Fix**: Use PR number or run ID in concurrency group when called as reusable workflow:
```yaml
group: ci-${{ github.workflow }}-${{ inputs.preview_url || github.ref }}
```

---

### 9. Secret Naming Inconsistency

**Location**: `cd.yml:75` vs `preview.yml:49`

- CD: `DIGITALOCEAN_TOKEN`
- Preview: `DIGITAL_OCEAN_K8S`

Both should use the same secret for DigitalOcean k8s access. Having two creates confusion and potential drift.

**Fix**: Standardize on one name (prefer `DIGITALOCEAN_TOKEN` as it's more conventional).

---

### 10. PR Comment Script Error Handling

**Location**: `ci.yml:139-143`

```javascript
const prNumber = previewUrl.match(/https:\/\/(\d+)\./)?.[1];
if (!prNumber) {
  console.log('Could not extract PR number from preview URL');
  return;
}
```

If extraction fails, the job succeeds silently without posting a comment. Should at least be logged more visibly or fail the step.

---

## Low Priority / Observations

### 11. tsx Missing from Production Dependencies

**Location**: `package.json:108`

`tsx` is in devDependencies, but `start:staging` uses `tsx scripts/fixtures/run.ts`. In the Docker production image, devDependencies are pruned.

**Impact**: Same as issue #1 - staging startup will fail.

**Fix**: Either:
- Move `tsx` to dependencies
- Pre-compile fixture scripts
- Use a different approach for staging seeds

---

### 12. Hardcoded Branch Reference in CD

**Location**: `cd.yml:44`

```yaml
push: ${{github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/feature/actions'}}
```

The `feature/actions` branch is hardcoded. This was likely for development and should be removed.

---

### 13. Missing Error Boundary in Index.prod.js

**Location**: `index.prod.js:25-34`

The error handler logs but doesn't send to Sentry even though Sentry is configured. Production errors will be lost.

---

## Summary Table

| # | Issue | Severity | Effort | Blocking? |
|---|-------|----------|--------|-----------|
| 1 | Dockerfile missing scripts | Critical | Low | Yes - staging won't start |
| 2 | E2E DB isolation | Critical | Medium | Partial - tests unreliable |
| 3 | Stripe webhooks | Critical | High | Yes - payment tests broken |
| 4 | GH Pages permissions | High | Low | Maybe - reports won't deploy |
| 5 | First deploy restart | High | Low | Edge case |
| 6 | waitForTimeout | Medium | Low | Flaky tests |
| 7 | Duplicate builds | Medium | Low | Wasteful |
| 8 | Concurrency collision | Medium | Low | Edge case |
| 9 | Secret naming | Medium | Low | Confusion |
| 10 | PR comment error handling | Low | Low | Silent failure |
| 11 | tsx in devDeps | Critical | Low | Same as #1 |
| 12 | Hardcoded branch | Low | Low | Tech debt |
| 13 | Sentry in prod errors | Low | Low | Observability gap |

## Recommended Fix Order

1. **Dockerfile + tsx** (Critical, blocks deployments)
2. **GH Pages permissions** (Quick win, unblocks reports)
3. **Stripe webhook strategy decision** (Needs architectural choice)
4. **E2E test reliability** (Once Stripe decided)
5. **Everything else** (Tech debt cleanup)

## Questions for the Team

1. Is payment flow testing in preview environments required, or can it be local-only?
2. Should preview environments use a shared staging Discord app, or skip Discord integration?
3. Is there a dedicated Stripe test account for staging, or shared with production test mode?
4. What's the intended behavior if E2E tests fail - should it block the PR?

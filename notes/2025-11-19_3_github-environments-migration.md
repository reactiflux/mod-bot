# GitHub Environments Migration for CI/CD

## Overview

Migrated the CI/CD pipeline from repository-level secrets to GitHub Environments for better security, organization, and deployment protection.

## Motivation

### Problems with Repository Secrets

1. **Security Risk**: All secrets accessible by all jobs and workflows
2. **No Protection**: Any branch can potentially access production secrets if workflow is modified
3. **Poor Organization**: No logical grouping between test and production credentials
4. **No Deployment Controls**: No approval gates or branch restrictions

### Benefits of GitHub Environments

1. **Enhanced Security**:
   - Branch restrictions prevent PRs from accessing production secrets
   - The `production` environment is restricted to `main` branch only
   - Even if a malicious PR modifies workflows, environment protection blocks secret access

2. **Clear Organization**:
   - Logical separation: `testing` environment for E2E tests, `production` for deployments
   - Same secret names across environments (e.g., `STRIPE_SECRET_KEY` in both, different values)
   - Easier to audit and maintain

3. **Deployment Tracking**:
   - GitHub tracks deployment history per environment
   - Visible in Environments tab with commit SHAs and timestamps

4. **Protection Rules**:
   - Branch restrictions ensure only trusted branches can deploy
   - Optional required reviewers for manual approval gates
   - Wait timers for deployment windows (if needed later)

## Changes Made

### 1. GitHub Actions Workflow (`.github/workflows/node.js.yml`)

**E2E Job**:

```yaml
e2e:
  name: Playwright E2E
  runs-on: ubuntu-latest
  environment: testing # ← Added
  steps:
    # ... existing steps
```

**Deployment Job**:

```yaml
deployment:
  needs: build
  if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/feature/actions'
  runs-on: ubuntu-latest
  environment: production # ← Added
  steps:
    # ... existing steps
```

**Note**: Secret references remain unchanged (`${{ secrets.STRIPE_SECRET_KEY }}`), but the environment context determines which value is used.

### 2. Documentation Updates

**CONTRIBUTING.md**:

- Replaced "GitHub Secrets for CI" section with "GitHub Environments"
- Documented both `testing` and `production` environments
- Added setup instructions for creating environments
- Explained security benefits of environment-based protection
- Updated secret names (no `_TEST_` prefix needed)

**tests/e2e/README.md**:

- Updated environment variables section to reference `testing` environment
- Changed secret names from `STRIPE_TEST_SECRET_KEY` → `STRIPE_SECRET_KEY`
- Added note about environment separation

## Environment Structure

### `testing` Environment

**Purpose**: Run E2E tests with Stripe test mode

**Protection Rules**: None (tests need to run on all PRs)

**Secrets**:

- `STRIPE_SECRET_KEY` = `sk_test_51...` (test mode)
- `STRIPE_PUBLISHABLE_KEY` = `pk_test_...` (test mode)

**Usage**: E2E job in all PRs and branches

### `production` Environment

**Purpose**: Deploy to Kubernetes cluster

**Protection Rules**:

- Branch restriction: Only `main` branch
- Optional: Required reviewer approval

**Secrets**:

- `DIGITALOCEAN_TOKEN`
- `SESSION_SECRET`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_APP_ID`
- `DISCORD_SECRET`
- `DISCORD_HASH`
- `DISCORD_TEST_GUILD`
- `SENTRY_INGEST`
- `SENTRY_RELEASES`
- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_HOST`
- `DATABASE_URL`

**Usage**: Deployment job when pushing to `main`, `develop`, or `feature/actions` branches

## Secret Naming Strategy

### Chosen Approach: Same Names Across Environments

We use the same secret names in both environments with different values:

```
testing environment:
  STRIPE_SECRET_KEY = sk_test_51...
  STRIPE_PUBLISHABLE_KEY = pk_test_...

production environment:
  STRIPE_SECRET_KEY = sk_live_51...  (when production Stripe is added)
  STRIPE_PUBLISHABLE_KEY = pk_live_...
```

**Advantages**:

- No code changes when promoting between environments
- Clearer that secrets serve the same purpose
- Follows infrastructure-as-code best practices
- Easier to maintain and audit

**Rejected Alternative**: Environment-prefixed names (e.g., `STRIPE_TEST_SECRET_KEY`, `STRIPE_PROD_SECRET_KEY`) would require conditional logic and is more error-prone.

## Manual Setup Required

### Step 1: Create `testing` Environment

1. Go to repository **Settings → Environments**
2. Click **New environment**
3. Name: `testing`
4. **Do not add** any protection rules
5. Add secrets:
   - `STRIPE_SECRET_KEY` = Your test mode secret key from Stripe Dashboard
   - `STRIPE_PUBLISHABLE_KEY` = Your test mode publishable key from Stripe Dashboard

### Step 2: Create `production` Environment

1. Go to repository **Settings → Environments**
2. Click **New environment**
3. Name: `production`
4. Add protection rule:
   - Click **Deployment branches** → **Selected branches**
   - Add pattern: `main`
5. Optional: Add **Required reviewers** (select 1-2 team members)
6. Migrate existing repository secrets to this environment:
   - Copy each secret value from repository settings
   - Add to production environment
   - Verify all secrets listed above are present

### Step 3: Verify Workflow

1. Create a test PR to verify E2E tests run with `testing` environment
2. Merge to `main` to verify deployment uses `production` environment
3. Check **Settings → Environments** to see deployment history

### Step 4: Cleanup (Optional)

Once verified, you can:

1. Remove duplicated secrets from repository level
2. Keep `GITHUB_TOKEN` at repository level (GitHub-managed, not environment-specific)
3. Document any shared secrets that should remain at repository level

## Security Improvements

### Defense in Depth

**Before**:

- Workflow conditions (`if: github.ref == 'refs/heads/main'`) were the only protection
- A modified workflow in a PR could potentially access any repository secret

**After**:

- Workflow conditions still exist (belt)
- Environment branch restrictions add a second layer (suspenders)
- Even if a malicious PR modifies the workflow, the `production` environment restriction prevents secret access

### Attack Scenarios Prevented

**Scenario 1: Malicious PR**

- Attacker forks repo, modifies workflow to exfiltrate secrets
- PR workflow runs but cannot access `production` environment (branch restriction)
- `testing` environment only contains test mode Stripe keys (no real charges possible)

**Scenario 2: Compromised Maintainer Account**

- Attacker with write access tries to deploy from feature branch
- Cannot access `production` environment due to branch restriction
- Required reviewers (if enabled) must approve even from `main`

## Future Enhancements

### Potential Additions

1. **Staging Environment**:

   ```yaml
   staging:
     name: staging
     runs-on: ubuntu-latest
     environment:
       name: staging
       url: https://staging.example.com
     steps:
       # Deploy to staging environment
   ```

2. **Wait Timers**:
   - Add deployment windows (e.g., only deploy during business hours)
   - Configure in production environment settings

3. **Custom Protection Rules**:
   - Use GitHub Apps to enforce health checks before deployment
   - Require passing smoke tests before production deployment

4. **Multi-Region Deployments**:
   - Create environment per region (e.g., `production-us-east`, `production-eu-west`)
   - Each with appropriate regional secrets

## Monitoring & Observability

### Deployment History

After implementation, you can:

1. Go to **Settings → Environments**
2. Click on `production`
3. View deployment history with:
   - Commit SHA
   - Deployer
   - Timestamp
   - Success/failure status
   - Approval history (if required reviewers enabled)

### PR Checks

When a PR runs E2E tests:

1. GitHub shows "testing" environment waiting indicator
2. Tests run with access to testing environment secrets
3. Success/failure appears in PR checks
4. Test artifacts available for download if failures occur

## Technical Details

### Secret Precedence

When a job specifies an environment, secret lookup order is:

1. Environment-specific secrets (highest priority)
2. Repository secrets (fallback)
3. Organization secrets (lowest priority)

For our workflow:

- E2E job with `environment: testing` → uses `STRIPE_SECRET_KEY` from `testing` environment
- Deployment job with `environment: production` → uses `STRIPE_SECRET_KEY` from `production` environment (when added)

### Environment Variables vs Secrets

**Secrets** (encrypted, not visible in logs):

- Stripe keys
- Discord tokens
- Database credentials
- API tokens

**Environment Variables** (visible in workflow):

- `CI=true`
- `DB_FILE=./test-db.sqlite3`
- Feature flags (if public)

## Lessons Learned

### What Went Well

1. **Minimal Workflow Changes**: Only needed to add `environment:` line to jobs
2. **Same Secret Names**: No code changes needed, just environment context
3. **Backward Compatible**: Can still use repository secrets as fallback

### Gotchas Encountered

1. **VS Code Diagnostics**: Editor shows warnings about unknown secrets until environments are created in GitHub UI
2. **Case Sensitivity**: Environment names are case-insensitive (`production` = `Production`)
3. **Cannot Rename**: Renaming environments requires creating new ones (loses history)

### Best Practices Established

1. Use `testing` environment for all CI test jobs
2. Use `production` environment for deployment jobs
3. Always configure branch restrictions on `production`
4. Document environment setup in CONTRIBUTING.md
5. Use same secret names across environments (differs only in value)

## References

- [GitHub Docs: Using environments for deployment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub Docs: Deployment protection rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules)
- [GitHub Docs: Environment secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-an-environment)

## Migration Checklist

- [x] Update workflow file with environment declarations
- [x] Update CONTRIBUTING.md documentation
- [x] Update tests/e2e/README.md
- [x] Create migration note
- [ ] Create `testing` environment in GitHub UI (manual)
- [ ] Create `production` environment in GitHub UI (manual)
- [ ] Add Stripe test keys to `testing` environment (manual)
- [ ] Migrate production secrets to `production` environment (manual)
- [ ] Test E2E tests run successfully on PR
- [ ] Test deployment runs successfully on main
- [ ] Verify deployment history appears in Environments tab
- [ ] Optional: Add required reviewers to production environment
- [ ] Optional: Clean up repository-level secrets after verification

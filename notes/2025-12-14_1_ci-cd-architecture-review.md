# CI/CD Strategic Architecture Review

## A new release management scheme

The proposal treats main as a staging/RC environment with a dedicated Discord bot, and introduces a release branch for production. This creates
a natural promotion path where code is validated on staging before reaching production, avoiding the SHA mismatch problem entirely.

## Comparison of release management schemes

| Scheme                  | Description                                          | Pros                                                             | Cons                                                          | Best For                                                    |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Trunk-Based Development | All commits to main, continuous deployment           | Fast iteration, simple branching, encourages small changes       | Requires feature flags, high test confidence, no staging gate | High-velocity teams with mature testing                     |
| GitHub Flow             | Feature branches → main, deploy from main            | Simple, low overhead, clear PR workflow                          | No staging environment, main = production risk                | Small teams, low-risk applications                          |
| GitLab Flow             | Feature → main → environment branches                | Clear promotion path, environment parity                         | Multiple long-lived branches, merge complexity                | Teams needing explicit environment gates                    |
| Git Flow                | develop → release → main, hotfix branches            | Formal release process, version control                          | Complex branching, slow releases, merge hell                  | Packaged software, versioned releases                       |
| Release Trains          | Scheduled releases from main at intervals            | Predictable cadence, batched testing                             | Delays features, doesn't fit continuous delivery              | Enterprise, compliance-heavy environments                   |
| Environment Branches    | Separate branches per environment (dev/staging/prod) | Clear mapping, easy rollback                                     | Drift between branches, complex merges                        | Legacy systems, regulated industries                        |
| Proposed                | main (staging) → release (prod),                     | Promotion via merge, environment isolation, validates in staging | Two long-lived branches, requires staging infra               | Multi-tenant SaaS, Discord bots, apps needing RC validation |

Recommendation: K8s-Based Git Flow model

```
PR → main (staging) → release (production)
    ↓                ↓
    staging k8s      production k8s
    (RC Discord bot) (prod Discord bot)
```

1. Discord bots benefit from RC validation (real users, isolated bot)
2. Squash-and-merge is preserved (no workflow changes for developers)
3. Multi-tenant k8s leverages existing infrastructure
4. Promotion is explicit (merge to release) rather than implicit (push to main)

---

## Current Reality vs. Proposed Model

### What Exists Today

| Component     | Current State                                     |
| ------------- | ------------------------------------------------- |
| Branching     | Feature branches → main (squash merge)            |
| CI            | Runs on PR branches only (branches-ignore: main)  |
| CD            | Runs on all pushes; deploys on main               |
| Gating        | Branch protection requires CI status before merge |
| Environments  | PR previews (ephemeral), production (main)        |
| Staging       | None (PR previews serve this role, imperfectly)   |
| Artifact flow | New image built on main (untested SHA)            |

### What the Proposed Model Changes

| Component     | Proposed State                                                         |
| ------------- | ---------------------------------------------------------------------- |
| Branching     | Feature → main (staging) → release (production)                        |
| CI            | Runs on PR branches (unchanged)                                        |
| CD            | Deploy main → staging namespace; deploy release → production namespace |
| Gating        | Branch protection on both main AND release                             |
| Environments  | PR previews, staging (main), production (release)                      |
| Staging       | Persistent, with dedicated Discord bot, real-ish data                  |
| Artifact flow | Image built on main and validated in staging, promoted to release      |

---

## Implementation Plan

### Phase 1: Create Release Branch Infrastructure

Goal: Establish the release branch and production deployment path.

Steps:

1. Create release branch from current main
2. Update cd.yml to deploy based on branch
3. Create staging namespace and resources

- New cluster/staging/ directory with persistent staging manifests
- Staging uses different Discord bot credentials (new Discord app)
- Staging ingress: staging.euno.reactiflux.com

4. Configure branch protection on release

- Require PR reviews before merge
- Optionally require specific approvers for production releases

Files to modify:

- .github/workflows/cd.yml
- cluster/staging/deployment.yaml (new)
- cluster/staging/kustomization.yaml (new)

---

### Phase 2: Staging Environment Data Strategy

Goal: Staging should have realistic data without copying production.

The seed data problem:

- Hand-written seeds don't scale
- Production copies have privacy/security risks
- Empty databases don't catch real-world bugs

Recommended approach: Synthetic Data Generation

Why this over production snapshots:

1. No PII concerns
2. Reproducible (seeded random)
3. Can generate edge cases intentionally
4. Scales independently of production size

Migration path:

1. Start with expanded seed-e2e.ts (more guilds, varied configs)
2. Evolve to faker-based generation as coverage needs grow
3. Add distribution configs for realistic scenarios

Files to create/modify:

- scripts/generate-staging-data.ts (new)
- scripts/seed-e2e.ts (expand for now)

---

### Phase 3: Staging Discord Bot

Goal: Staging environment has its own Discord bot for RC validation.

Steps:

1. Create new Discord application (Discord Developer Portal)

- Rename current app "Euno Staging" or "Euno RC"
- Invite to a test guild (could be public "beta testers" guild)

2. Create staging secrets in GitHub
3. Update staging deployment to use staging secrets
4. Configure staging Stripe (test mode keys, separate from production)

Benefit: Real users can opt-in to test RC releases before they hit production. Dogfooding path for the team.

---

### Phase 4: CI Workflow Adjustments

Goal: CI continues to gate merges; add staging validation.

Current CI runs on: All branches except main (branches-ignore: main)

Proposed changes:

1. Keep CI as-is for PR branches (lint, typecheck, vitest, e2e)
2. Add staging E2E job that runs after staging deploy

- Trigger: Push to main (after staging deploys)
- Runs E2E against staging.euno.reactiflux.com
- Reports results but doesn't block (staging is already deployed)
- Alerts if staging E2E fails

3. Optional: Add release validation job

- Trigger: PR from main to release
- Runs smoke tests against staging
- Gates the release PR merge

Files to modify:

- .github/workflows/ci.yml (add staging E2E trigger)
- .github/workflows/cd.yml (add staging E2E after deploy)

---

### Phase 5: Release Process Documentation

Goal: Clear process for promoting staging to production.

Release workflow (normal):

1. Code lands in main via squash-merge PR
2. Staging auto-deploys and runs E2E
3. Validation period (hours/days depending on change risk)
4. Create release PR from main → release

- PR description summarizes changes since last release
- Automated checks verify staging health

5. Merge with merge commit (preserves release history)
6. Production auto-deploys from release branch
7. Monitor production health

Merge strategy: Use merge commits for main → release. This:

- Preserves clear release history on the release branch
- Makes it easy to see what was included in each release
- Allows release branch to have its own commits (hotfixes)

Hotfix workflow (critical issues):

1. Create hotfix branch from release (not main)
2. Fix the issue, PR to release
3. Merge and deploy (production gets fix immediately)
4. Cherry-pick to main so staging also gets the fix

When to use hotfix path:

- Production is broken (P0/P1 incidents)
- Security vulnerabilities
- Data corruption risks

When NOT to use hotfix path:

- Features that "should have been in the release"
- Non-critical bugs (wait for next release)
- Anything that needs validation time

Automation opportunities:

- Automated release PR creation (weekly, or on-demand)
- Changelog generation from commit messages
- Slack notification on release merge
- Reminder to cherry-pick hotfixes back to main

---

## Seed Data Strategy Deep Dive

Options Evaluated

| Strategy             | Scalability | Realism     | Privacy | Maintenance | Complexity |
| -------------------- | ----------- | ----------- | ------- | ----------- | ---------- |
| Hand-written seeds   | Poor        | Low         | Safe    | High        | Low        |
| Production snapshots | Good        | High        | Risky   | Low         | Medium     |
| Anonymized snapshots | Good        | High        | Safe    | Medium      | High       |
| Synthetic generation | Good        | Medium-High | Safe    | Medium      | Medium     |
| Fixture factories    | Good        | Medium      | Safe    | Medium      | Low        |

Recommended: Hybrid Approach

1. Immediate: Expand seed-e2e.ts with more scenarios

- Real guilds only. Can fabricate other details

2. Short-term: Add faker-based generation

- Configurable distributions
- Deterministic seeds for reproducibility
- Run on staging deployment, not preview

---

## Tactical Cleanup Checklist

Address these regardless of strategic direction:

- Add data seed step to database migration commands
- preview.yml:44-50 - Remove debug token logging
- cd.yml:44 - Remove hardcoded feature/actions branch
- ci.yml:94 - Fix empty NODE_ENV: assignment
- payment-flow.spec.ts:159 - Replace waitForTimeout(2000) with proper wait
- Standardize secret naming (DIGITALOCEAN_TOKEN vs DIGITAL_OCEAN_K8S)

---

## Key Files Reference

| Purpose           | File                                                 |
| ----------------- | ---------------------------------------------------- |
| CI workflow       | .github/workflows/ci.yml                             |
| CD workflow       | .github/workflows/cd.yml                             |
| Preview workflow  | .github/workflows/preview.yml                        |
| E2E tests         | tests/e2e/payment-flow.spec.ts                       |
| E2E fixtures      | tests/e2e/fixtures/auth.ts, tests/e2e/fixtures/db.ts |
| E2E seed script   | scripts/seed-e2e.ts                                  |
| Playwright config | playwright.config.ts                                 |
| Production K8s    | cluster/deployment.yaml, cluster/kustomization.yaml  |
| Preview K8s       | cluster/preview/deployment.yaml                      |
| Staging K8s (new) | cluster/staging/ (to be created)                     |

---

## Summary: What Changes

| Change                            | Effort | Impact                           |
| --------------------------------- | ------ | -------------------------------- |
| Create release branch             | Low    | Enables promotion model          |
| Update CD for branch-based deploy | Medium | Staging + production separation  |
| Create staging k8s manifests      | Medium | Persistent staging environment   |
| Create staging Discord app        | Low    | RC validation with real users    |
| Expand seed data                  | Low    | Better test coverage             |
| Add synthetic data generation     | Medium | Scalable, realistic staging data |
| Unify test constants              | Low    | Reduce duplication bugs          |
| Tactical cleanup                  | Low    | Reduce footguns                  |

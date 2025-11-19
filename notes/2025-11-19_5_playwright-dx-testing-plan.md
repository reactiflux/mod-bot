# Playwright DX Improvements Testing Plan

## Overview

Testing plan to verify Phase 1 & 2 DX improvements work correctly in all scenarios before merging to main.

## Prerequisites

- [ ] Branch `vc-pricing` has all commits
- [ ] GitHub Pages is enabled for the repository (will be auto-enabled on first deploy)
- [ ] Stripe test keys are configured in the `CI` environment

## Test Scenarios

### Scenario 1: PR with Passing Tests ✅

**Goal**: Verify PR comment and artifacts work with successful tests

**Steps**:

1. Push changes to current branch (`vc-pricing`)
2. Create a Pull Request (or push to existing PR)
3. Wait for E2E tests to complete

**Expected Results**:

✅ **GitHub Actions Summary**:

- Navigate to Actions → E2E job → Summary tab
- Should see "🎭 Playwright E2E Test Results" section
- Status shows as success
- Lists available artifacts

✅ **PR Comment**:

- Bot comment appears on PR within ~30 seconds of job completion
- Comment shows: ✅ status emoji
- Shows "Status: success"
- Shows "Test Suite: Payment Flow (11 tests)"
- Has link to Actions run
- Has link to HTML report (says "available after merge to main")
- Has link to download artifacts
- Collapsible sections work (Test Coverage, Available Artifacts)

✅ **Artifacts**:

- Artifacts section in Actions run shows `playwright-report-{run_id}`
- Name includes unique run ID (e.g., `playwright-report-123456789`)
- Can download and extract successfully
- HTML report opens in browser

**Verification**:

```bash
# Check the PR comment was created
gh pr view {PR_NUMBER} --comments | grep "Playwright E2E Test Results"

# Check artifacts exist
gh run list --workflow="Node.js CI" --limit 1
gh run view {RUN_ID} --log
```

---

### Scenario 2: PR with Failing Tests ❌

**Goal**: Verify failure handling and error visibility

**Steps**:

1. Temporarily break a test (add `expect(false).toBe(true)`)
2. Push to PR branch
3. Wait for tests to fail

**Expected Results**:

✅ **GitHub Actions Summary**:

- Shows "🎭 Playwright E2E Test Results" section
- Status shows as failure/error

✅ **PR Comment**:

- Bot comment updates (doesn't create duplicate)
- Shows: ❌ status emoji
- Shows "Status: failure"
- All links still work
- Failure is immediately visible in PR

✅ **Artifacts**:

- Still uploaded despite failure (`if: always()`)
- Contains screenshots of failure
- Contains video of test execution
- HTML report shows failed test with details

**Verification**:

- Screenshots appear in `test-results/` directory
- Video files present
- HTML report has red failure indicators
- Can click through to see failure details

**Cleanup**:

```bash
# Revert the breaking change
git revert HEAD
git push
```

---

### Scenario 3: Multiple Pushes to Same PR 🔄

**Goal**: Verify comment updates instead of creating duplicates

**Steps**:

1. Make a small change (add comment to test file)
2. Push to PR
3. Wait for tests
4. Make another small change
5. Push again
6. Wait for tests

**Expected Results**:

✅ **PR Comment Behavior**:

- After first push: Comment created
- After second push: Same comment updated (not duplicated)
- Only ONE bot comment exists on PR
- Comment shows latest status
- Run number in comment matches latest run

**Verification**:

```bash
# Count bot comments (should be 1)
gh pr view {PR_NUMBER} --comments | grep -c "Playwright E2E Test Results"

# Should output: 1
```

---

### Scenario 4: Merge to Main (GitHub Pages) 📄

**Goal**: Verify GitHub Pages deployment works

**Steps**:

1. Ensure all tests pass on PR
2. Merge PR to `main`
3. Wait for E2E tests to complete on main
4. Check GitHub Pages deployment

**Expected Results**:

✅ **GitHub Actions**:

- E2E job completes successfully
- "Deploy test report to GitHub Pages" step runs
- Step shows success (no errors)
- Deployment job shows in Actions

✅ **GitHub Pages**:

- Report deployed to `https://reactiflux.github.io/mod-bot/reports/{run-number}`
- HTML report accessible (no 404)
- Report is interactive (can click through tests)
- Screenshots load correctly
- No authentication required

✅ **Branch Creation**:

- `gh-pages` branch created automatically (first deploy only)
- Branch contains `reports/` directory
- Directory structure: `reports/{run-number}/index.html`

**Verification**:

```bash
# Get the run number
RUN_NUMBER=$(gh run list --workflow="Node.js CI" --branch main --limit 1 --json databaseId --jq '.[0].databaseId')

# Try to access the URL
curl -I "https://reactiflux.github.io/mod-bot/reports/${RUN_NUMBER}" | head -1

# Should return: HTTP/2 200
```

**Manual Check**:

- Visit `https://reactiflux.github.io/mod-bot/reports/{run-number}` in browser
- Verify report loads
- Try clicking on a test
- Check screenshots appear

---

### Scenario 5: Cancelled Tests ⚠️

**Goal**: Verify handling of cancelled workflow runs

**Steps**:

1. Push to PR
2. While tests are running, push again (triggers cancel-in-progress)
3. Or manually cancel the running workflow

**Expected Results**:

✅ **PR Comment**:

- Shows: ⚠️ status emoji
- Shows "Status: cancelled"
- Links still present
- Gracefully handles cancellation

✅ **Artifacts**:

- May or may not be uploaded (depending on when cancelled)
- No errors in upload step

---

### Scenario 6: Branch Protection (Non-Main) 🚫

**Goal**: Verify GitHub Pages deployment only runs on main

**Steps**:

1. Run tests on PR branch (not main)
2. Check workflow execution

**Expected Results**:

✅ **GitHub Pages Step**:

- Step is skipped (condition: `github.ref == 'refs/heads/main'`)
- Shows as skipped in Actions UI
- No deployment attempted
- No error

✅ **Other Steps**:

- Summary still generated
- PR comment still created
- Artifacts still uploaded

**Verification**:

```bash
# Check that gh-pages deployment was skipped
gh run view {RUN_ID} --log | grep "Deploy test report to GitHub Pages"

# Should show: skipped
```

---

### Scenario 7: First-Time Setup (Clean Slate) 🆕

**Goal**: Verify everything works on first run (no existing comments, no gh-pages branch)

**Steps**:

1. Create a fresh PR (if possible)
2. Or clear bot comments from existing PR
3. Run tests

**Expected Results**:

✅ **First PR Comment**:

- Bot comment created (not updated)
- All sections render correctly
- No errors in github-script step

✅ **First GitHub Pages Deploy** (on main):

- `gh-pages` branch created
- Branch contains `reports/` directory
- First report deployed successfully

**Note**: This scenario might not be testable if PR comments already exist.

---

## Edge Cases to Test

### Edge Case 1: No Test Report Generated

**Scenario**: Tests crash before generating HTML report

**Steps**:

1. Temporarily break playwright config to prevent report generation
2. Run tests

**Expected Behavior**:

- Summary step shows "⚠️ Test report not generated"
- Artifact upload still works (may be empty)
- PR comment still created
- No critical failures

### Edge Case 2: Very Long Test Run

**Scenario**: Tests take longer than usual (e.g., 5+ minutes)

**Expected Behavior**:

- All steps still execute
- Timeout doesn't cut off deployment
- Comment appears after completion

### Edge Case 3: GitHub API Rate Limits

**Scenario**: Many rapid pushes trigger rate limiting

**Expected Behavior**:

- github-script step may fail gracefully
- Tests still run
- Artifacts still upload
- Doesn't block the workflow

---

## Manual Verification Checklist

### Before Merge

- [ ] PR comment appears on test PR
- [ ] PR comment shows correct status emoji (✅/❌/⚠️)
- [ ] PR comment updates on subsequent pushes (no duplicates)
- [ ] GitHub Actions summary shows test results
- [ ] Artifacts upload with unique names
- [ ] Artifacts are downloadable
- [ ] HTML report opens correctly from artifacts
- [ ] All links in PR comment work
- [ ] Collapsible sections in PR comment work

### After Merge to Main

- [ ] GitHub Pages deployment step runs
- [ ] No errors in deployment step
- [ ] `gh-pages` branch exists (or was created)
- [ ] Report accessible at `https://reactiflux.github.io/mod-bot/reports/{run-number}`
- [ ] HTML report loads completely
- [ ] Screenshots load in report
- [ ] Can navigate through report
- [ ] No authentication required

### Regression Checks

- [ ] Existing CI jobs still work (lint, typecheck, vitest, build, deployment)
- [ ] Tests still run correctly
- [ ] Test environment variables still work
- [ ] Stripe test mode still functional

---

## Troubleshooting Guide

### Issue: PR Comment Not Appearing

**Symptoms**: Tests complete but no bot comment on PR

**Checks**:

1. Verify it's a pull request (not a direct push to branch)
2. Check Actions log for github-script step
3. Look for API errors in logs
4. Verify GITHUB_TOKEN has pull_request write permission

**Solution**:

```bash
# Check if comment was attempted
gh run view {RUN_ID} --log | grep -A 20 "Comment PR with test results"
```

### Issue: GitHub Pages 404

**Symptoms**: Report URL returns 404

**Checks**:

1. Verify deployment ran on `main` branch
2. Check if `gh-pages` branch exists
3. Verify Pages is enabled in repo settings
4. Check deployment logs for errors

**Solution**:

```bash
# Check gh-pages branch
git fetch origin gh-pages
git checkout gh-pages
ls -la reports/

# Verify Pages settings
gh repo view --json name,owner,isInOrganization
```

**GitHub Pages Setup**:

1. Go to repository Settings
2. Pages section in left sidebar
3. Source: Deploy from a branch
4. Branch: `gh-pages`, folder: `/` (root)
5. Save

### Issue: Duplicate PR Comments

**Symptoms**: Multiple bot comments on PR

**Checks**:

1. Verify bot comment detection logic
2. Check comment author type
3. Look for exact match on comment body

**Solution**:

```bash
# Manually delete duplicate comments
gh pr view {PR_NUMBER} --comments
# Note comment IDs
gh api repos/{owner}/{repo}/issues/comments/{comment_id} -X DELETE
```

### Issue: Artifacts Not Uploading

**Symptoms**: No artifacts in Actions run

**Checks**:

1. Verify `playwright-report/` directory exists after tests
2. Check upload-artifact step logs
3. Verify path is correct

**Solution**:

```bash
# In the workflow, add a debug step before upload:
- name: Debug artifacts
  run: |
    ls -la
    ls -la playwright-report/ || echo "No playwright-report directory"
```

---

## Performance Benchmarks

Track these metrics during testing:

| Metric                           | Target        | Actual     |
| -------------------------------- | ------------- | ---------- |
| Time to PR comment (after tests) | < 30 seconds  | **\_\_\_** |
| GitHub Pages deployment time     | < 2 minutes   | **\_\_\_** |
| Artifact upload time             | < 1 minute    | **\_\_\_** |
| Total E2E job time               | 13-15 seconds | **\_\_\_** |
| Overhead from new steps          | < 1 minute    | **\_\_\_** |

---

## Test Execution Plan

### Phase 1: Pre-Merge Testing (on PR)

1. **Create PR** with changes (or use existing `vc-pricing`)
2. **Test passing scenario** (Scenario 1)
   - Verify summary appears
   - Verify PR comment created
   - Verify artifacts upload
3. **Test multiple pushes** (Scenario 3)
   - Make trivial change, push
   - Verify comment updates (not duplicates)
4. **Test failing scenario** (Scenario 2)
   - Break a test temporarily
   - Verify failure is visible
   - Verify artifacts still upload
   - Revert breaking change
5. **Verify no GitHub Pages deployment** (Scenario 6)
   - Confirm step is skipped on PR

### Phase 2: Post-Merge Testing (on main)

1. **Merge PR** to main (after Phase 1 passes)
2. **Wait for E2E tests** on main
3. **Verify GitHub Pages deployment** (Scenario 4)
   - Check deployment step succeeds
   - Visit the GitHub Pages URL
   - Verify report loads
4. **Test permanence**
   - Wait 24 hours
   - Verify URL still works
   - Verify report still accessible

### Phase 3: Edge Case Testing (optional)

1. **Test cancellation** (Scenario 5)
   - Trigger cancel during run
   - Verify graceful handling
2. **Test edge cases**
   - Long test runs
   - Multiple rapid pushes

---

## Success Criteria

All of the following must pass before considering implementation complete:

- [ ] PR comments appear reliably
- [ ] PR comments update (no duplicates)
- [ ] Status emoji reflects actual test status
- [ ] GitHub Actions summary appears on every run
- [ ] Artifacts upload successfully with unique names
- [ ] GitHub Pages deployment works on main
- [ ] Report URLs are accessible and permanent
- [ ] All links in PR comment work correctly
- [ ] No regressions in existing CI jobs
- [ ] Tests still pass reliably
- [ ] Performance overhead is acceptable (< 1 minute total)

---

## Rollback Plan

If critical issues are found:

1. **Immediate**: Revert the workflow changes

   ```bash
   git revert {commit_hash}
   git push
   ```

2. **Preserve**: Keep documentation for future retry

3. **Investigate**: Fix issues in new branch

4. **Retry**: Test again with fixes

---

## Sign-Off

After completing testing:

- [ ] All scenarios tested
- [ ] All edge cases verified
- [ ] Performance is acceptable
- [ ] No regressions found
- [ ] Team members can access reports
- [ ] Documentation is accurate

**Tested by**: ******\_******
**Date**: ******\_******
**Status**: ✅ Ready to merge / ❌ Needs fixes

---

## Quick Reference Commands

```bash
# View PR comments
gh pr view {PR_NUMBER} --comments

# View latest Actions run
gh run list --workflow="Node.js CI" --limit 1

# View run details
gh run view {RUN_ID}

# View run logs
gh run view {RUN_ID} --log

# Download artifacts
gh run download {RUN_ID}

# Check GitHub Pages status
curl -I https://reactiflux.github.io/mod-bot/reports/{RUN_NUMBER}

# List all reports on GitHub Pages
git fetch origin gh-pages
git checkout gh-pages
ls -la reports/
```

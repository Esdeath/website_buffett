# Git Deploy Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `npm run deploy` command that stages, conditionally commits, and pushes the current repository through Git.

**Architecture:** A focused Node.js script invokes Git without shell-specific conditionals. Vitest exercises it against temporary working and bare repositories, so verification never commits or pushes the real workspace.

**Tech Stack:** Node.js 22, Git, npm scripts, Vitest 2

## Global Constraints

- The deploy command performs Git operations only.
- Stage all changes with `git add -A`.
- Use the stable commit message `chore: update content` when staged changes exist.
- Skip commit creation when the index has no changes, but still push existing commits.
- Do not run tests, build Astro, or call Cloudflare from the deploy command.
- Stop with a non-zero exit code when any required Git operation fails.

---

### Task 1: Git Deployment Command

**Files:**
- Create: `site/scripts/deploy.mjs`
- Create: `site/scripts/deploy.test.mjs`
- Modify: `site/package.json`

**Interfaces:**
- Consumes: Git executable, current repository, configured upstream branch.
- Produces: `deploy({ cwd?: string, stdio?: child_process.StdioOptions }): void` and npm script `deploy`.

- [ ] **Step 1: Write failing temporary-repository tests**

Create `site/scripts/deploy.test.mjs`. Initialize a temporary bare remote and working repository in `beforeEach`, configure a local Git identity, and establish an upstream branch. Add one test that changes a tracked file, calls `deploy({ cwd, stdio: 'pipe' })`, and asserts the new local commit message is `chore: update content` and the remote revision matches the local revision. Add a second test that creates an unpushed commit in a clean worktree, calls `deploy`, and asserts the commit count is unchanged while the remote revision advances to the local revision.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd site
npx vitest run scripts/deploy.test.mjs
```

Expected: FAIL because `site/scripts/deploy.mjs` does not exist.

- [ ] **Step 3: Implement the Git command**

Create `site/scripts/deploy.mjs` with an exported `deploy` function. Run these commands in order with `child_process.spawnSync` or `execFileSync` and the supplied working directory:

```text
git rev-parse --show-toplevel
git add -A
git diff --cached --quiet
git commit -m "chore: update content"  # only when diff exits 1
git push
```

Treat `git diff --cached --quiet` exit code `0` as no staged changes and exit code `1` as staged changes. Treat every other non-zero status as an error. When the module is executed directly, call `deploy()` with inherited stdio so Git authentication and errors remain visible.

- [ ] **Step 4: Expose the npm entry point**

Add this property to `site/package.json` under `scripts`:

```json
"deploy": "node scripts/deploy.mjs"
```

- [ ] **Step 5: Run focused and complete verification**

Run:

```bash
cd site
npx vitest run scripts/deploy.test.mjs
npm test
npm run validate
```

Expected: temporary repository tests pass, the full Vitest suite passes, and content validation reports zero errors.

- [ ] **Step 6: Review the real workspace without deploying it**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Do not run `npm run deploy`, because it intentionally commits and pushes the active workspace.

- [ ] **Step 7: Commit the implementation**

```bash
git add site/scripts/deploy.mjs site/scripts/deploy.test.mjs site/package.json site/package-lock.json docs/superpowers/plans/2026-07-30-git-deploy-command.md
git commit -m "Add Git-based deploy command"
```

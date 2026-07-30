# Git Deploy Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root-level `./deploy` command that stages, conditionally commits, and pushes the current repository through Git.

**Architecture:** A focused executable Python script invokes Git without shell-specific conditionals. Vitest exercises it against temporary working and bare repositories, so verification never commits or pushes the real workspace.

**Tech Stack:** Python 3, Git, Node.js 22, Vitest 2

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
- Create: `deploy`
- Create: `site/src/lib/deploy-command.test.mjs`

**Interfaces:**
- Consumes: Git executable, current repository, configured upstream branch.
- Produces: executable command `./deploy`.

- [ ] **Step 1: Write failing temporary-repository tests**

Create `site/src/lib/deploy-command.test.mjs`. Initialize a temporary bare remote and working repository in `beforeEach`, configure a local Git identity, and establish an upstream branch. Add one test that changes a tracked file, executes the root `deploy` script with the temporary repository as its working directory, and asserts the new local commit message is `chore: update content` and the remote revision matches the local revision. Add a second test that creates an unpushed commit in a clean worktree, executes `deploy`, and asserts the commit count is unchanged while the remote revision advances to the local revision.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd site
npx vitest run src/lib/deploy-command.test.mjs
```

Expected: FAIL because the root `deploy` executable does not exist.

- [ ] **Step 3: Implement the Git command**

Create the root `deploy` file with a Python 3 shebang. Run these commands in order with `subprocess.run` and the caller's working directory:

```text
git rev-parse --show-toplevel
git add -A
git diff --cached --quiet
git commit -m "chore: update content"  # only when diff exits 1
git push
```

Treat `git diff --cached --quiet` exit code `0` as no staged changes and exit code `1` as staged changes. Treat every other non-zero status as an error. Inherit terminal input and output so Git authentication and errors remain visible.

- [ ] **Step 4: Make the script executable**

```bash
chmod +x deploy
```

- [ ] **Step 5: Run focused and complete verification**

Run:

```bash
cd site
npx vitest run src/lib/deploy-command.test.mjs
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

Expected: no whitespace errors. Do not run `./deploy` in the active workspace, because it intentionally commits and pushes that workspace.

- [ ] **Step 7: Commit the implementation**

```bash
git add deploy site/src/lib/deploy-command.test.mjs docs/superpowers/specs/2026-07-30-git-deploy-command-design.md docs/superpowers/plans/2026-07-30-git-deploy-command.md
git commit -m "Add Git-based deploy command"
```

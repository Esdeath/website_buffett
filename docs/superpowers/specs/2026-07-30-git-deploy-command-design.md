# Git Deploy Command Design

## Goal

Allow maintainers to run `./deploy.sh` from the repository root to publish the current repository state through the existing GitHub-triggered Cloudflare Pages deployment.

## Behavior

The command performs Git operations only:

1. Stage all tracked and untracked repository changes with `git add -A`.
2. Create a commit with the stable message `chore: update content` when staged changes exist.
3. Skip commit creation when the index has no changes.
4. Push the current branch to its configured upstream in both cases.

The command does not run tests, build the Astro site, or call Cloudflare directly. Git and an upstream branch must already be configured. Any staging, commit, or push failure stops the command and returns a non-zero exit code.

## Implementation

Add an executable Python script named `deploy.sh` at the repository root. The script keeps the no-change branch explicit and avoids shell-specific conditional syntax.

## Verification

Test the script in a temporary Git repository for both dirty and clean worktrees. Do not invoke it from the real repository during automated verification because it would commit and push the maintainer's active worktree.

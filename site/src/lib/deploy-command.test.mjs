import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const deployPath = fileURLToPath(new URL('../../../deploy.sh', import.meta.url));

describe('deploy command', () => {
  let root;
  let remote;
  let repository;

  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'buffett-deploy-'));
    remote = join(root, 'remote.git');
    repository = join(root, 'repository');

    git(root, 'init', '--bare', '--initial-branch=main', remote);
    mkdirSync(repository);
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.name', 'Deploy Test');
    git(repository, 'config', 'user.email', 'deploy@example.com');
    writeFileSync(join(repository, 'content.md'), 'first\n');
    git(repository, 'add', 'content.md');
    git(repository, 'commit', '-m', 'Initial commit');
    git(repository, 'remote', 'add', 'origin', remote);
    git(repository, 'push', '--set-upstream', 'origin', 'main');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('commits workspace changes and pushes them', () => {
    writeFileSync(join(repository, 'content.md'), 'second\n');

    execFileSync(deployPath, { cwd: repository, stdio: 'pipe' });

    expect(git(repository, 'log', '-1', '--format=%s')).toBe('chore: update content');
    expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(git(repository, 'rev-parse', 'HEAD'));
  });

  test('pushes existing commits when the workspace has no changes', () => {
    writeFileSync(join(repository, 'content.md'), 'second\n');
    git(repository, 'add', 'content.md');
    git(repository, 'commit', '-m', 'Existing local commit');
    const commitCount = git(repository, 'rev-list', '--count', 'HEAD');

    execFileSync(deployPath, { cwd: repository, stdio: 'pipe' });

    expect(git(repository, 'rev-list', '--count', 'HEAD')).toBe(commitCount);
    expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(git(repository, 'rev-parse', 'HEAD'));
  });
});

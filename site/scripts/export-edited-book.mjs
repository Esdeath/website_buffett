import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../', import.meta.url));
const bundled = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
const python = process.env.SOURCE_BOOK_PYTHON ?? (existsSync(bundled) ? bundled : 'python3');
execFileSync(python, [join(site, 'scripts/render-edited-book.py'), ...process.argv.slice(2)], { cwd: site, stdio: 'inherit' });

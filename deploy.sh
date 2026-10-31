#!/usr/bin/env python3

import subprocess
import sys
from pathlib import Path


COMMIT_MESSAGE = "chore: update content"
SITE_DIR = Path(__file__).resolve().parent / "site"

# 三本书稿由原文生成，`npm run build` 会逐字校验它们与原文一致。
# 原文一改而书稿没重新生成，Cloudflare 构建就会失败、线上停在旧版本，
# 所以推送前先重新生成，再跑一遍内容校验，失败就不推送。
PREPUSH_STEPS = (
    ("npm", "run", "build:qa-book"),
    ("npm", "run", "build:source-book"),
    ("npm", "run", "build:decision-book"),
    ("npx", "tsx", "scripts/validate-content.mjs"),
)


def run_git(*args: str, check: bool = True, quiet: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        check=check,
        stdout=subprocess.DEVNULL if quiet else None,
    )


def prepare_site() -> None:
    for step in PREPUSH_STEPS:
        subprocess.run(step, check=True, cwd=SITE_DIR)


def main() -> int:
    try:
        run_git("rev-parse", "--show-toplevel", quiet=True)
        prepare_site()
        run_git("add", "-A")

        staged_diff = run_git("diff", "--cached", "--quiet", check=False)
        if staged_diff.returncode == 1:
            run_git("commit", "-m", COMMIT_MESSAGE)
        elif staged_diff.returncode != 0:
            raise subprocess.CalledProcessError(staged_diff.returncode, staged_diff.args)
        else:
            print("No changes to commit; pushing existing commits.")

        run_git("push")
        return 0
    except FileNotFoundError:
        print("git or npm is not installed or is not available on PATH.", file=sys.stderr)
        return 127
    except subprocess.CalledProcessError as error:
        return error.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())

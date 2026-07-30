#!/usr/bin/env python3

import subprocess
import sys


COMMIT_MESSAGE = "chore: update content"


def run_git(*args: str, check: bool = True, quiet: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        check=check,
        stdout=subprocess.DEVNULL if quiet else None,
    )


def main() -> int:
    try:
        run_git("rev-parse", "--show-toplevel", quiet=True)
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
        print("git is not installed or is not available on PATH.", file=sys.stderr)
        return 127
    except subprocess.CalledProcessError as error:
        return error.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = Path.home() / ".codex/skills/harness-init/scripts/harness_audit.py"


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def changed_files() -> list[str]:
    result = run(["git", "diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--"])
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def has_doc_coverage(paths: list[str]) -> bool:
    return any(
        path == "AGENTS.md"
        or path == "CLAUDE.md"
        or path.startswith("docs/")
        for path in paths
    )


def has_sensitive_change(paths: list[str]) -> bool:
    prefixes = (
        ".ai/",
        "app/api/",
        "components/",
        "hooks/",
        "lib/",
        "scripts/",
        "src-tauri/",
    )
    exact = {
        "next.config.ts",
        "package.json",
        "pnpm-lock.yaml",
        "tauri.conf.json",
        "vitest.config.ts",
    }
    return any(path in exact or path.startswith(prefixes) for path in paths)


def main() -> int:
    if not AUDIT.exists():
        print(f"Missing Harness audit script: {AUDIT}")
        return 1

    audit = run(["python3", str(AUDIT), str(ROOT)])
    print(audit.stdout, end="")
    if audit.returncode != 0:
        return audit.returncode

    paths = changed_files()
    if paths and has_sensitive_change(paths) and not has_doc_coverage(paths):
        print(
            "Changed source/config-sensitive paths without AGENTS.md, CLAUDE.md, or docs/ coverage."
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

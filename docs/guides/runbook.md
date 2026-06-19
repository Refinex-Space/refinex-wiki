---
owner: refinex
updated: 2026-06-19
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Runbook

## Local Startup

```bash
pnpm install
pnpm dev
```

For desktop development:

```bash
pnpm desktop:dev
```

## Verification

Start with the narrowest relevant check, then broaden:

```bash
pnpm test:run -- <path-or-pattern>
pnpm test:run
pnpm lint
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

For Harness/control-plane changes:

```bash
pnpm harness:check
python3 ~/.codex/skills/harness-init/scripts/harness_audit.py /Users/refinex/develop/project/refinex-wiki
wc -l AGENTS.md
```

## Desktop Packaging

Build the Tauri web export first when debugging static export issues:

```bash
pnpm build:desktop:web
```

Then run the desktop build target required by the task, for example:

```bash
pnpm desktop:build -- --no-bundle
pnpm desktop:build -- --bundles dmg --no-sign
```

## Rollback

For source changes, prefer `git diff` inspection followed by targeted `git restore <path>` only for files intentionally changed in the current task. Do not revert unrelated user work.

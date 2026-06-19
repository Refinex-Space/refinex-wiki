---
owner: refinex
updated: 2026-06-19
status: active
referenced_by: AGENTS.md#knowledge-map
---

# API Standards

## Next.js API Routes

- `app/api/ai/copilot/route.ts` accepts a request-provided `apiKey` or falls back to `AI_GATEWAY_API_KEY`.
- `app/api/uploadthing/route.ts` exposes the UploadThing route handler configured by `lib/uploadthing.ts`.
- Do not log prompts, uploaded file URLs, API keys, or user local paths unless a task explicitly requires a sanitized diagnostic.

## Tauri Command Bridge

- Frontend calls should flow through `components/workspace/workspace-api.ts`.
- Rust command registration belongs in `src-tauri/src/lib.rs`.
- Command implementation modules are split by domain: `assets.rs`, `git.rs`, `settings.rs`, `terminal.rs`, and `workspace.rs`.
- Keep TypeScript request/response types aligned with Rust command payloads.

## Local Files And Assets

Workspace document APIs should preserve Markdown source files. Asset APIs should stay within the configured Tauri asset protocol and local workspace asset conventions.

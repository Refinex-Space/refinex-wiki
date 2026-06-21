---
owner: refinex
updated: 2026-06-21
status: active
referenced_by: AGENTS.md#knowledge-map
---

# API Standards

## Next.js API Routes

- `app/api/ai/copilot/route.ts` accepts a request-provided `apiKey` or falls back to `AI_GATEWAY_API_KEY`.
- `app/api/link-preview/route.ts` resolves Mardora link card metadata for Web/dev usage. It must keep SSRF protections: only `http`/`https`, no credentialed URLs, no localhost/private/link-local/multicast targets, redirect validation, timeout, and bounded response size.
- `app/api/uploadthing/route.ts` exposes the UploadThing route handler configured by `lib/uploadthing.ts`.
- Do not log prompts, uploaded file URLs, API keys, or user local paths unless a task explicitly requires a sanitized diagnostic.

## Tauri Command Bridge

- Frontend calls should flow through `components/workspace/workspace-api.ts`.
- Rust command registration belongs in `src-tauri/src/lib.rs`.
- Command implementation modules are split by domain: `assets.rs`, `git.rs`, `link_preview.rs`, `settings.rs`, `terminal.rs`, and `workspace.rs`.
- Desktop-only network features should use Tauri commands instead of depending on `app/api`, because desktop production builds statically export the frontend and remove Next API routes.
- Keep TypeScript request/response types aligned with Rust command payloads.

## Local Files And Assets

Workspace document APIs should preserve Markdown source files. Asset APIs should stay within the configured Tauri asset protocol and local workspace asset conventions.

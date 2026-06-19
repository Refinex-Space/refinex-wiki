---
owner: refinex
updated: 2026-06-19
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Security Standards

## Secrets

- Never commit real API keys, UploadThing secrets, signing credentials, tokens, or production credentials.
- `AI_GATEWAY_API_KEY` may be named in docs and code, but real values must stay in local environment or secret storage.
- Redact local absolute paths from shared logs when they reveal private user data outside this repository.

## Desktop Permissions

- Treat `src-tauri/capabilities/default.json`, Tauri plugins, shell/process access, terminal support, and asset protocol scope as security-sensitive.
- Do not widen filesystem, process, shell, opener, or asset protocol permissions without explicit approval and focused verification.
- Terminal and Git features operate on local workspaces; avoid implicit operations outside the selected workspace root.

## Uploads And AI

- UploadThing accepts broad file categories for editor uploads. Validate any expansion of upload behavior against user data exposure and storage expectations.
- AI route changes must preserve abort handling and must not expose keys or raw upstream errors to the client.

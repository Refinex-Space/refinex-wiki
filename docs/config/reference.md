---
owner: refinex
updated: 2026-06-19
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Config Reference

## Package Scripts

- `pnpm dev`: starts the Next.js development server.
- `pnpm desktop:dev`: starts Tauri development mode using `src-tauri/tauri.conf.json`.
- `pnpm test:run`: runs Vitest once.
- `pnpm lint`: runs ESLint.
- `pnpm build`: runs a normal Next.js build.
- `pnpm build:desktop:web`: runs `scripts/build-tauri-web.mjs` for Tauri static export.
- `pnpm desktop:build`: runs `tauri build`.
- `pnpm harness:check`: runs repo-local Harness governance checks.

## Environment Variables

- `NEXT_OUTPUT=export`: enables static export behavior in `next.config.ts`.
- `TAURI_DEV_HOST`: overrides the host used for non-production desktop asset prefix logic.
- `AI_GATEWAY_API_KEY`: optional server-side fallback key for `app/api/ai/copilot/route.ts`. Never document or commit real values.

## Tauri Config

- `src-tauri/tauri.conf.json` sets `devUrl` to `http://localhost:3000`.
- `frontendDist` is `../out`, so desktop builds depend on the static export output.
- `beforeDevCommand` is `npm run dev`; `beforeBuildCommand` is `npm run build:desktop:web`.
- The desktop asset protocol scope allows files under `$HOME/**/.refinex/assets/files/**/*`.

## App Settings

`src-tauri/src/settings.rs` owns persisted app settings. The current schema is `schemaVersion: 1`, `storage.defaultProvider: local`, and `appearance.pageWidthMode` as `standard` or `wide`. Frontend defaults mirror this shape in workspace components.

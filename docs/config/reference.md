---
owner: refinex
updated: 2026-06-20
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

`src-tauri/src/settings.rs` owns persisted app settings. The current schema is `schemaVersion: 1`, `storage.defaultProvider: local`, `appearance.pageWidthMode` as `standard` or `wide`, and `ai` model profile metadata. Frontend defaults mirror this shape in workspace components.

`ai.enabledProfileId` stores the enabled model profile id or `null` when the right AI panel is disabled. `ai.profiles[]` stores profile metadata such as `id`, `label`, `kind`, `providerId`, `providerLabel`, `modelId`, `modelLabel`, `enabled`, and `isTestRuntime`. The default profile is `fake-echo` with provider `local` and model `fake-echo`.

The desktop AI settings panel can detect local assistant accounts through the Tauri `detect_ai_accounts` command. Detection checks `codex` and `claude` binaries, command paths, versions, and Codex `app-server` support; it must not read token files or persist account credentials. Detected model profiles use metadata-only kinds such as `codex_app_server` or `claude_cli`. Until a runtime adapter is wired, detected Codex models are listed as adapter-pending profiles rather than available chat runtimes.

`ai.providers` stores AI provider metadata only: provider ids, names, `apiStyle`, `type`, `baseUrl`, enabled state, default model ids, model capability lists, non-auth custom headers, and `secretStatus`. It must not store API keys, bearer tokens, session tokens, or credential-like custom headers. Provider API keys are stored through Tauri secret-store commands and should only be surfaced in UI as `configured`, `missing`, or `notRequired`.

Do not persist API keys, access tokens, or session credentials in app settings. Real provider credentials must stay in environment variables or secret storage.

## Workspace Metadata

每个工作区根目录下的 `.refinex/workspace.json` 存储工作区级元数据，字段：

- `schemaVersion`：固定为 `1`。
- `recentDocumentPaths`：最近打开文档的绝对路径列表，上限 5，最新在前；应用重启后用于恢复空状态的「最近文档」。
- `expandedPaths`：目录树展开状态（预留）。
- `sortOrder`：目录树拖拽排序记录。

打开文档时通过 `record_recent_document` 命令即时落盘；已删除/重命名的路径在展示层用工作区快照过滤，不从文件清理。旧的 `recentDocumentPath`（单数）字段在读取时迁移进新列表后即淘汰，新写入的文件不再包含该字段。

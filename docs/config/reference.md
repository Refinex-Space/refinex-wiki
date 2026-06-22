---
owner: refinex
updated: 2026-06-22
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
- The desktop asset protocol scope allows files under `$HOME/**/.madora/assets/files/**/*`.

## App Settings

`src-tauri/src/settings.rs` owns persisted app settings. The current schema is `schemaVersion: 1`, `storage.defaultProvider: local`, `appearance.pageWidthMode` as `standard` or `wide`, `appearance.fonts.ui`, `appearance.fonts.document`, `appearance.fonts.code`, and `ai` model profile metadata. Frontend defaults mirror this shape in workspace components.

`appearance.fonts.ui` controls application chrome such as sidebars, toolbars, and settings. `appearance.fonts.document` controls Markdown editor and reading-mode article text. `appearance.fonts.code` controls code blocks and inline code. The desktop settings page obtains available font family names through the Tauri `list_system_fonts` command and persists only the selected family names.

`ai.enabledProfileId` remains in the schema for backward compatibility, but the product UI no longer exposes an "enable profile" selector. The right AI panel auto-selects the first available local assistant profile detected from Codex or Claude Code. `ai.profiles[]` stores profile metadata such as `id`, `label`, `kind`, `providerId`, `providerLabel`, `modelId`, `modelLabel`, `enabled`, and `isTestRuntime`. Test fixtures may still use `fake-echo`.

The desktop AI Account settings panel can detect local assistant accounts through the Tauri `detect_ai_accounts` command. Detection checks `codex` and `claude` binaries, command paths, versions, Codex `app-server` plus `exec` support, and Claude Code `--print --output-format stream-json` support; it must not read token files or persist account credentials. Detected local profiles use metadata-only kinds such as `codex_app_server` or `claude_cli`.

The right AI panel obtains selectable Codex models through the Tauri `list_ai_agent_models` command, which opens a local Codex `app-server` stdio session and requests the real `model/list` response. The UI must not hard-code model names in settings or account detection. If a local assistant cannot return a structured model list, the panel should show the unavailable state instead of guessing.

`ai.providers` remains in the settings schema for backward compatibility with older provider-runtime experiments. The current settings panel does not expose provider, Base URL, custom provider, or API key controls. Provider metadata must still not store API keys, bearer tokens, session tokens, or credential-like custom headers.

Do not persist API keys, access tokens, or session credentials in app settings. Real provider credentials must stay in environment variables or secret storage.

## Workspace Metadata

每个工作区根目录下的 `.madora/workspace.json` 存储工作区级元数据，字段：

- `schemaVersion`：固定为 `1`。
- `recentDocumentPaths`：最近打开文档的绝对路径列表，上限 5，最新在前；应用重启后用于恢复空状态的「最近文档」。
- `expandedPaths`：目录树展开状态（预留）。
- `sortOrder`：目录树拖拽排序记录。
- `dailyNotes`：每日笔记索引，包含最近选中日期 `selectedDate` 和 `entries` 日期映射。每日笔记正文仍保存在工作区可见 Markdown 文件 `Daily/YYYY/MM/YYYY-MM-DD.md`，`.madora/workspace.json` 只保存路径、是否有实际内容的标记和更新时间。
- `gitSync`：当前工作区的 Git Sync 偏好，包含是否启用 `enabled`、同步频率 `intervalMinutes`、差异处理策略 `conflictResolution` 和上次同步时间 `lastSyncedAt`。远程仓库地址从真实 Git remote 读取，不在工作区元数据中保存副本。

打开文档时通过 `record_recent_document` 命令即时落盘；已删除/重命名的路径在展示层用工作区快照过滤，不从文件清理。旧的 `recentDocumentPath`（单数）字段在读取时迁移进新列表后即淘汰，新写入的文件不再包含该字段。

本地资源文件存储在 `.madora/assets` 下，Markdown 文档中的本地资源引用格式为 `madora-asset://{assetId}`。

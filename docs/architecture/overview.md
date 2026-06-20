---
owner: refinex
updated: 2026-06-20
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Madora is a desktop-first local knowledge-base app. The default page renders `WorkspaceLayout` from `app/page.tsx`, and the workspace shell owns the document tree, editor tabs, search dialog, Git panels, terminal panel, settings dialog, and side panels under `components/workspace`.

## Runtime Shape

- Web shell: Next.js App Router with React client components.
- Editor: `components/editor/markdown-editor.tsx` wraps `mardora` and CodeMirror-oriented Markdown behavior.
- Desktop shell: Tauri v2 from `src-tauri`, with `src-tauri/tauri.conf.json` pointing production desktop builds at `../out`.
- Native boundary: React calls Tauri commands through `components/workspace/workspace-api.ts`; command implementations live in `src-tauri/src`.
- Local state: app settings are persisted by `src-tauri/src/settings.rs`; browser panel widths use local storage keys in `workspace-layout.tsx`.

## Main Modules

- `app/`: Next.js routes and API handlers.
- `components/editor/`: Markdown editor, front matter, TOC, and workspace asset upload helpers.
- `components/workspace/`: desktop workspace shell, tree, tabs, search, Git UI, terminal UI, and Tauri API bridge.
- `components/ui/`: shared UI primitives.
- `src-tauri/src/`: Rust commands for assets, Git, settings, terminal, and workspace filesystem behavior.
- `scripts/`: local build helpers, currently including the Tauri web export wrapper.

## Storage And Editor Boundary

Persisted knowledge documents are Markdown files. Keep the disk format, in-memory draft model, and editor input/output aligned around Markdown strings. Do not introduce a second rich-text projection layer unless a separate plan explicitly covers migration, compatibility, and rollback.

## Desktop Build Boundary

`scripts/build-tauri-web.mjs` temporarily moves `app/api` out of the Next static export path, sets `NEXT_OUTPUT=export`, runs the web build, and restores the API directory in `finally`. Changes to this flow need both web build and desktop packaging verification.

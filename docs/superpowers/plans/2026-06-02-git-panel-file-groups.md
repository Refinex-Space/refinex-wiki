---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Git Panel File Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Git panel changed-file list with IDEA-like file rows, staged/unstaged grouping, icons, and group-specific context actions.

**Architecture:** Keep backend Git commands unchanged. `GitPanel` derives staged and unstaged groups from `GitStatus.changes`, renders file name plus secondary path, and calls existing single-file callbacks. `WorkspaceLayout` adds one single-file stage callback using the existing `gitStage` API.

**Tech Stack:** Next.js 16, React 19, Vitest, Testing Library, lucide-react, existing Radix context menu.

---

## File Structure

- Modify `components/workspace/git-panel.tsx`: add grouped rendering, file-name/path display helpers, menu icons, and staged/unstaged menu variants.
- Modify `components/workspace/workspace-layout.tsx`: pass `onStageFile` to `GitPanel`.
- Modify `components/workspace/__tests__/git-panel.test.tsx`: cover grouped lists, file name/path display, and unstaged `暂存` context action.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`: cover single-file stage wiring from the context menu.

## Task 1: GitPanel Grouped Rows

- [x] **Step 1: Add failing tests**
  - Add `GitStatus` data with one staged and one unstaged file.
  - Assert `已暂存 1` and `未暂存 1` render.
  - Assert a file row exposes the file name as main text and parent path as muted secondary text.
  - Assert right-clicking unstaged row shows `暂存` and calls `onStageFile`.

- [x] **Step 2: Implement GitPanel props and rendering**
  - Add `onStageFile: (path: string) => void`.
  - Split `changes` into `stagedChanges` and `unstagedChanges`.
  - Render each group with a heading and `GitChangeRow` rows.
  - Render file name from the last path segment and parent path from the remaining path.

- [x] **Step 3: Add context menu icons and group-specific actions**
  - Use `GitCommit`, `FileDiff`, `Plus`, `Minus`, `RotateCcw`, and `Trash2`.
  - In staged group, show `取消暂存`.
  - In unstaged group, show `暂存`.
  - Keep `提交`、`显示差异`、`回滚`、`删除` for both groups.

- [x] **Step 4: Verify GitPanel**
  - Run `npm run test:run -- components/workspace/__tests__/git-panel.test.tsx`.

## Task 2: Workspace Single-File Stage Wiring

- [x] **Step 1: Add failing integration test**
  - Open Git panel with one unstaged file.
  - Right-click the file, click `暂存`.
  - Assert `gitStage('/repo', ['README.plate.json'])` was called.

- [x] **Step 2: Implement WorkspaceLayout callback**
  - Add `handleGitStageFile(path)` using `gitStage(workspaceRootPath, [path])`.
  - Pass it as `onStageFile`.

- [x] **Step 3: Verify WorkspaceLayout**
  - Run `npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx`.

## Task 3: Focused Verification

- [x] Run `npm run test:run -- components/workspace/__tests__/git-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx`.
- [x] Run `npx eslint components/workspace/git-panel.tsx components/workspace/workspace-layout.tsx components/workspace/__tests__/git-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx`.
- [x] Run `npm run build`.

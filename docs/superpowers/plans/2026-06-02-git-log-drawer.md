---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Git Log Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an IDEA-style bottom Git log drawer with branch navigation, commit history, changed files, and commit details.

**Architecture:** Add read-only Git history commands in Tauri, expose them through `workspace-api`, and render a bottom drawer from `WorkspaceLayout`. The drawer owns search/filter state and selected commit state; destructive Git history actions stay out of scope.

**Tech Stack:** Next.js 16, React 19, Tauri 2, Rust 2021, native `git`, Vitest, Testing Library.

---

## File Structure

- Modify `src-tauri/src/git.rs`: add `git_branches`, `git_log`, and `git_commit_files`.
- Modify `src-tauri/src/lib.rs`: register new commands.
- Modify `components/workspace/workspace-types.ts`: add Git log data types.
- Modify `components/workspace/workspace-api.ts`: add wrapper functions.
- Add `components/workspace/git-log-drawer.tsx`: render bottom drawer.
- Modify `components/workspace/workspace-layout.tsx`: add left-bottom trigger and drawer state/data loading.
- Modify tests under `components/workspace/__tests__` and Rust git tests.

## Tasks

- [x] Add backend Git history commands and tests.
- [x] Add frontend API wrappers and types.
- [x] Build `GitLogDrawer` with branch tree, commit list, file tree, and details pane.
- [x] Add bottom-left trigger and data loading in `WorkspaceLayout`.
- [x] Run focused tests, Rust tests, lint, and build.

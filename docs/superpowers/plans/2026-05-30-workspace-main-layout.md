---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Workspace Main Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `/editor` 单编辑器页面升级为 Notion 式三列桌面工作区：左侧工作区搜索和 Markdown 目录树，中间复用 Plate 主编辑器，右侧 AI 占位面板默认折叠。

**Architecture:** 前端采用组件化 Workspace Shell 管理布局和 UI 状态；Tauri 后端只暴露受控的工作区目录快照命令；目录选择仍由官方 dialog 插件完成；最近工作区路径第一版保存在前端 `localStorage`，Web 环境显示降级空状态。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Plate 53, Tauri v2, Rust 2021, Vitest, React Testing Library.

---

## 规格来源

- `docs/superpowers/specs/2026-05-30-workspace-main-layout-design.md`
- 已确认决策：
  - 视觉方向：Notion 工作区式。
  - 第一版范围：可用工作区雏形。
  - 工作区来源：首次选择文件夹，之后恢复最近工作区。
  - 搜索范围：文件名、路径、Markdown 一级标题。
  - AI 面板：默认折叠，展开后为占位，不调用 AI。
  - 实现方案：组件化 Workspace Shell。

## 约束和边界

- 不接入真实 AI API。
- 不做全文索引。
- 不做文件新建、重命名、删除、拖拽排序。
- 不把 Workspace 状态写进 Plate 插件内部。
- 不要求 Web 环境读本地文件；Web 只展示降级入口。
- 不重新启用 Tauri updater 插件。

## 目标文件清单

新增：

- `components/workspace/workspace-types.ts`
- `components/workspace/workspace-tree.ts`
- `components/workspace/workspace-api.ts`
- `components/workspace/use-workspace.ts`
- `components/workspace/workspace-layout.tsx`
- `components/workspace/workspace-sidebar.tsx`
- `components/workspace/workspace-search.tsx`
- `components/workspace/document-tree.tsx`
- `components/workspace/editor-pane.tsx`
- `components/workspace/ai-side-panel.tsx`
- `components/workspace/__tests__/workspace-tree.test.ts`
- `components/workspace/__tests__/workspace-layout.test.tsx`
- `src-tauri/src/workspace.rs`

修改：

- `app/editor/page.tsx`
- `components/editor/plate-editor.tsx`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `package.json`

---

## Phase 1：测试基础设施和纯数据模型

### 1. 安装并配置前端测试

- [ ] 修改 `package.json`，新增测试脚本和 devDependencies。

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@vitejs/plugin-react": "^6.0.2",
    "jsdom": "^29.1.1",
    "vitest": "^4.1.7"
  }
}
```

- [ ] 新增 `vitest.config.ts`。

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['components/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] 运行：

```bash
npm install
npm run test:run -- --passWithNoTests
```

预期：

```text
No test files found, exiting with code 0
```

提交点：

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: 添加前端测试基础设施"
```

### 2. 定义 Workspace 类型

- [ ] 新增 `components/workspace/workspace-types.ts`。

```ts
export type WorkspaceNodeKind = 'directory' | 'document';

export interface WorkspaceNode {
  id: string;
  name: string;
  kind: WorkspaceNodeKind;
  relativePath: string;
  absolutePath: string;
  title?: string;
  children?: WorkspaceNode[];
}

export interface WorkspaceSnapshot {
  rootPath: string;
  rootName: string;
  nodes: WorkspaceNode[];
}

export interface WorkspaceSearchResult {
  id: string;
  name: string;
  title: string;
  relativePath: string;
  absolutePath: string;
}

export interface WorkspaceLoadError {
  message: string;
  recoverable: boolean;
}
```

### 3. 先写搜索和树工具测试

- [ ] 新增 `components/workspace/__tests__/workspace-tree.test.ts`，先覆盖 Markdown 过滤、排序、一级标题 fallback、搜索。

```ts
import { describe, expect, it } from 'vitest';

import {
  filterWorkspaceNodes,
  flattenDocuments,
  normalizeMarkdownTitle,
  searchWorkspace,
} from '../workspace-tree';
import type { WorkspaceNode } from '../workspace-types';

const nodes: WorkspaceNode[] = [
  {
    id: 'dir-guides',
    name: 'Guides',
    kind: 'directory',
    relativePath: 'Guides',
    absolutePath: '/repo/Guides',
    children: [
      {
        id: 'doc-a',
        name: 'intro.md',
        kind: 'document',
        relativePath: 'Guides/intro.md',
        absolutePath: '/repo/Guides/intro.md',
        title: '入门指南',
      },
    ],
  },
  {
    id: 'doc-root',
    name: 'README.md',
    kind: 'document',
    relativePath: 'README.md',
    absolutePath: '/repo/README.md',
    title: '项目说明',
  },
];

describe('workspace-tree', () => {
  it('normalizes first markdown h1 and falls back to filename', () => {
    expect(normalizeMarkdownTitle('# 标题\n\n正文', 'a.md')).toBe('标题');
    expect(normalizeMarkdownTitle('正文', 'note.md')).toBe('note');
  });

  it('flattens document nodes only', () => {
    expect(flattenDocuments(nodes).map((item) => item.relativePath)).toEqual([
      'Guides/intro.md',
      'README.md',
    ]);
  });

  it('searches by filename, path, and h1 title', () => {
    expect(searchWorkspace(nodes, '入门')).toHaveLength(1);
    expect(searchWorkspace(nodes, 'guides')).toHaveLength(1);
    expect(searchWorkspace(nodes, 'readme')).toHaveLength(1);
  });

  it('keeps parent directory when descendants match filtered tree', () => {
    expect(filterWorkspaceNodes(nodes, 'intro')).toEqual([
      expect.objectContaining({
        kind: 'directory',
        children: [expect.objectContaining({ relativePath: 'Guides/intro.md' })],
      }),
    ]);
  });
});
```

### 4. 实现纯工具函数

- [ ] 新增 `components/workspace/workspace-tree.ts`。

```ts
import type { WorkspaceNode, WorkspaceSearchResult } from './workspace-types';

export function normalizeMarkdownTitle(content: string, fileName: string) {
  const heading = content
    .split(/\r?\n/, 80)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# ') && line.length > 2);

  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }

  return fileName.replace(/\.(md|mdx)$/i, '');
}

export function flattenDocuments(nodes: WorkspaceNode[]): WorkspaceSearchResult[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'document') {
      return [
        {
          id: node.id,
          name: node.name,
          title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
          relativePath: node.relativePath,
          absolutePath: node.absolutePath,
        },
      ];
    }

    return flattenDocuments(node.children ?? []);
  });
}

export function searchWorkspace(nodes: WorkspaceNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return flattenDocuments(nodes).filter((node) => {
    const haystack = `${node.name}\n${node.relativePath}\n${node.title}`.toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function filterWorkspaceNodes(
  nodes: WorkspaceNode[],
  query: string,
): WorkspaceNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes
    .map((node) => {
      if (node.kind === 'document') {
        const haystack = `${node.name}\n${node.relativePath}\n${node.title ?? ''}`.toLowerCase();

        return haystack.includes(normalizedQuery) ? node : null;
      }

      const children = filterWorkspaceNodes(node.children ?? [], normalizedQuery);

      return children.length > 0 ? { ...node, children } : null;
    })
    .filter((node): node is WorkspaceNode => node !== null);
}
```

- [ ] 运行：

```bash
npm run test:run -- components/workspace/__tests__/workspace-tree.test.ts
```

预期：

```text
4 passed
```

提交点：

```bash
git add components/workspace package.json package-lock.json vitest.config.ts
git commit -m "test: 覆盖工作区树搜索逻辑"
```

---

## Phase 2：Tauri 工作区目录快照

### 5. 先写 Rust 目录快照测试

- [ ] 修改 `src-tauri/Cargo.toml`，增加测试依赖。

```toml
[dev-dependencies]
tempfile = "3.23"
```

- [ ] 新增 `src-tauri/src/workspace.rs`，先放结构、纯函数和测试。

```rust
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub root_path: String,
    pub root_name: String,
    pub nodes: Vec<WorkspaceNode>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    pub id: String,
    pub name: String,
    pub kind: WorkspaceNodeKind,
    pub relative_path: String,
    pub absolute_path: String,
    pub title: Option<String>,
    pub children: Option<Vec<WorkspaceNode>>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceNodeKind {
    Directory,
    Document,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_markdown_only_snapshot_with_titles() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let guide_dir = temp_dir.path().join("Guides");
        fs::create_dir(&guide_dir).expect("创建测试目录失败");
        fs::write(temp_dir.path().join("README.md"), "# 项目说明\n正文").unwrap();
        fs::write(guide_dir.join("intro.mdx"), "# 入门\n正文").unwrap();
        fs::write(guide_dir.join("ignore.txt"), "ignore").unwrap();

        let snapshot = build_workspace_snapshot(temp_dir.path()).unwrap();

        assert_eq!(snapshot.nodes.len(), 2);
        assert!(format!("{snapshot:?}").contains("README.md"));
        assert!(format!("{snapshot:?}").contains("intro.mdx"));
        assert!(!format!("{snapshot:?}").contains("ignore.txt"));
        assert!(format!("{snapshot:?}").contains("项目说明"));
    }
}
```

### 6. 实现 Tauri command

- [ ] 在 `src-tauri/src/workspace.rs` 完成读取逻辑和 command。

```rust
#[tauri::command]
pub fn load_workspace_tree(root_path: String) -> Result<WorkspaceSnapshot, String> {
    let root = PathBuf::from(root_path);

    if !root.exists() {
        return Err("工作区路径不存在".to_string());
    }

    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }

    build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
}

pub fn build_workspace_snapshot(root: &Path) -> std::io::Result<WorkspaceSnapshot> {
    let root = root.canonicalize()?;
    let root_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Workspace")
        .to_string();

    Ok(WorkspaceSnapshot {
        root_path: root.to_string_lossy().to_string(),
        root_name,
        nodes: read_children(&root, &root)?,
    })
}

fn read_children(root: &Path, dir: &Path) -> std::io::Result<Vec<WorkspaceNode>> {
    let mut nodes = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') || should_skip_dir(&file_name) {
            continue;
        }

        if path.is_dir() {
            let children = read_children(root, &path)?;

            if !children.is_empty() {
                nodes.push(build_directory_node(root, &path, file_name, children)?);
            }
        } else if is_markdown_file(&path) {
            nodes.push(build_document_node(root, &path, file_name)?);
        }
    }

    nodes.sort_by(|left, right| {
        directory_rank(left)
            .cmp(&directory_rank(right))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(nodes)
}

fn should_skip_dir(file_name: &str) -> bool {
    matches!(file_name, "node_modules" | ".next" | "target" | "dist" | "build")
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn build_directory_node(
    root: &Path,
    path: &Path,
    name: String,
    children: Vec<WorkspaceNode>,
) -> std::io::Result<WorkspaceNode> {
    let relative_path = to_relative_path(root, path)?;

    Ok(WorkspaceNode {
        id: relative_path.clone(),
        name,
        kind: WorkspaceNodeKind::Directory,
        relative_path,
        absolute_path: path.to_string_lossy().to_string(),
        title: None,
        children: Some(children),
    })
}

fn build_document_node(root: &Path, path: &Path, name: String) -> std::io::Result<WorkspaceNode> {
    let relative_path = to_relative_path(root, path)?;
    let title = fs::read_to_string(path)
        .ok()
        .map(|content| extract_markdown_title(&content, &name));

    Ok(WorkspaceNode {
        id: relative_path.clone(),
        name,
        kind: WorkspaceNodeKind::Document,
        relative_path,
        absolute_path: path.to_string_lossy().to_string(),
        title,
        children: None,
    })
}

fn to_relative_path(root: &Path, path: &Path) -> std::io::Result<String> {
    Ok(path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/"))
}

fn extract_markdown_title(content: &str, file_name: &str) -> String {
    content
        .lines()
        .take(80)
        .map(str::trim)
        .find(|line| line.starts_with("# ") && line.len() > 2)
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .unwrap_or_else(|| {
            file_name
                .trim_end_matches(".md")
                .trim_end_matches(".mdx")
                .to_string()
        })
}

fn directory_rank(node: &WorkspaceNode) -> u8 {
    match node.kind {
        WorkspaceNodeKind::Directory => 0,
        WorkspaceNodeKind::Document => 1,
    }
}
```

- [ ] 注册 command，修改 `src-tauri/src/lib.rs`。

```rust
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![workspace::load_workspace_tree])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] 运行：

```bash
cd src-tauri
CARGO_HTTP_PROXY=http://127.0.0.1:7897 cargo test
```

预期：

```text
test workspace::tests::builds_markdown_only_snapshot_with_titles ... ok
```

提交点：

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/workspace.rs
git commit -m "feat: 添加工作区目录读取命令"
```

---

## Phase 3：前端 Tauri 适配层和状态 Hook

### 7. 实现前端 Tauri bridge

- [ ] 新增 `components/workspace/workspace-api.ts`。

```ts
import type { WorkspaceSnapshot } from './workspace-types';

const RECENT_WORKSPACE_KEY = 'refinex-wiki:recent-workspace-path';

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getRecentWorkspacePath() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(RECENT_WORKSPACE_KEY);
}

export function saveRecentWorkspacePath(rootPath: string) {
  window.localStorage.setItem(RECENT_WORKSPACE_KEY, rootPath);
}

export async function selectWorkspaceRoot() {
  if (!isTauriRuntime()) {
    return null;
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: true,
    multiple: false,
  });

  return typeof selected === 'string' ? selected : null;
}

export async function loadWorkspaceTree(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('load_workspace_tree', { rootPath });
}
```

### 8. 先写 Hook 行为测试

- [ ] 新增 `components/workspace/__tests__/workspace-layout.test.tsx`，先覆盖空状态、搜索结果、AI 面板默认折叠。

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'readme',
      name: 'README.md',
      kind: 'document',
      relativePath: 'README.md',
      absolutePath: '/repo/README.md',
      title: '项目说明',
    },
  ],
};

describe('WorkspaceLayout', () => {
  it('shows empty workspace action before selecting folder', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(screen.getAllByRole('button', { name: '选择文件夹' }).length).toBeGreaterThan(0);
  });

  it('filters documents by title', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.type(screen.getByPlaceholderText('搜索标题或路径'), '项目');

    expect(screen.getByText('项目说明')).toBeTruthy();
  });

  it('keeps ai panel collapsed by default and expands on click', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByText('总结此页面')).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    expect(screen.getByText('总结此页面')).toBeTruthy();
  });
});
```

### 9. 实现 Workspace 状态 Hook

- [ ] 新增 `components/workspace/use-workspace.ts`。

```ts
'use client';

import * as React from 'react';

import {
  getRecentWorkspacePath,
  loadWorkspaceTree,
  saveRecentWorkspacePath,
  selectWorkspaceRoot,
} from './workspace-api';
import { searchWorkspace } from './workspace-tree';
import type { WorkspaceLoadError, WorkspaceNode, WorkspaceSnapshot } from './workspace-types';

export function useWorkspace(initialSnapshot?: WorkspaceSnapshot | null) {
  const [snapshot, setSnapshot] = React.useState<WorkspaceSnapshot | null>(initialSnapshot ?? null);
  const [currentDocument, setCurrentDocument] = React.useState<WorkspaceNode | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [error, setError] = React.useState<WorkspaceLoadError | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [isAiPanelCollapsed, setAiPanelCollapsed] = React.useState(true);

  const loadWorkspace = React.useCallback(async (rootPath: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSnapshot = await loadWorkspaceTree(rootPath);
      setSnapshot(nextSnapshot);
      saveRecentWorkspacePath(nextSnapshot.rootPath);
    } catch {
      setError({ message: '无法读取工作区，请重新选择文件夹。', recoverable: true });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openWorkspace = React.useCallback(async () => {
    const selected = await selectWorkspaceRoot();

    if (!selected) {
      return;
    }

    await loadWorkspace(selected);
  }, [loadWorkspace]);

  React.useEffect(() => {
    if (snapshot) {
      return;
    }

    const recentPath = getRecentWorkspacePath();

    if (recentPath) {
      void loadWorkspace(recentPath);
    }
  }, [loadWorkspace, snapshot]);

  return {
    currentDocument,
    error,
    isAiPanelCollapsed,
    isLoading,
    isSidebarCollapsed,
    openWorkspace,
    searchQuery,
    searchResults: snapshot ? searchWorkspace(snapshot.nodes, searchQuery) : [],
    setAiPanelCollapsed,
    setCurrentDocument,
    setSearchQuery,
    setSidebarCollapsed,
    snapshot,
  };
}
```

- [ ] 测试中如需要 mock Tauri bridge，使用 `vi.mock('../workspace-api', ...)` 隔离真实插件。

---

## Phase 4：三列布局组件

### 10. WorkspaceLayout

- [ ] 新增 `components/workspace/workspace-layout.tsx`。

```tsx
'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { PlateEditor } from '@/components/editor/plate-editor';
import { cn } from '@/lib/utils';

import { AiSidePanel } from './ai-side-panel';
import { EditorPane } from './editor-pane';
import { useWorkspace } from './use-workspace';
import { WorkspaceSidebar } from './workspace-sidebar';
import type { WorkspaceSnapshot } from './workspace-types';

interface WorkspaceLayoutProps {
  initialSnapshot?: WorkspaceSnapshot | null;
}

export function WorkspaceLayout({ initialSnapshot = null }: WorkspaceLayoutProps) {
  const workspace = useWorkspace(initialSnapshot);

  return (
    <main className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <WorkspaceSidebar workspace={workspace} />

      <section className="min-w-0 flex-1 border-x bg-background">
        <EditorPane
          currentDocument={workspace.currentDocument}
          hasWorkspace={workspace.snapshot !== null}
          onOpenWorkspace={workspace.openWorkspace}
        >
          {workspace.currentDocument ? <PlateEditor variant="workspace" /> : null}
        </EditorPane>
      </section>

      <AiSidePanel
        currentDocument={workspace.currentDocument}
        isCollapsed={workspace.isAiPanelCollapsed}
        onCollapsedChange={workspace.setAiPanelCollapsed}
      />

      <button
        aria-label={workspace.isSidebarCollapsed ? '展开目录' : '折叠目录'}
        className={cn('fixed left-3 top-3 z-20 hidden h-8 w-8 items-center justify-center rounded-md border bg-background md:flex')}
        type="button"
        onClick={() => workspace.setSidebarCollapsed(!workspace.isSidebarCollapsed)}
      >
        {workspace.isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
    </main>
  );
}
```

注意：最终实现时，左侧折叠按钮可放在侧栏头部；上面代码只表达状态边界，实际样式以不遮挡 macOS 窗口控制区为准。

### 11. Sidebar、Search、Tree

- [ ] 新增 `components/workspace/workspace-sidebar.tsx`。

```tsx
import { FolderOpen, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentTree } from './document-tree';
import { WorkspaceSearch } from './workspace-search';
import type { useWorkspace } from './use-workspace';

interface WorkspaceSidebarProps {
  workspace: ReturnType<typeof useWorkspace>;
}

export function WorkspaceSidebar({ workspace }: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col border-r bg-muted/30 transition-[width]',
        workspace.isSidebarCollapsed ? 'w-12' : 'w-[280px]',
      )}
    >
      {workspace.isSidebarCollapsed ? null : (
        <>
          <header className="flex h-12 items-center justify-between px-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {workspace.snapshot?.rootName ?? 'Refinex Wiki'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {workspace.snapshot?.rootPath ?? '未选择工作区'}
              </p>
            </div>
            <Button aria-label="切换工作区" size="icon" variant="ghost" onClick={workspace.openWorkspace}>
              <FolderOpen size={16} />
            </Button>
          </header>

          <div className="px-3 pb-2">
            <WorkspaceSearch value={workspace.searchQuery} onChange={workspace.setSearchQuery} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {workspace.snapshot ? (
              <DocumentTree
                currentDocumentPath={workspace.currentDocument?.absolutePath ?? null}
                nodes={workspace.snapshot.nodes}
                searchQuery={workspace.searchQuery}
                onSelectDocument={workspace.setCurrentDocument}
              />
            ) : (
              <div className="space-y-3 px-2 py-8 text-sm text-muted-foreground">
                <p>选择一个包含 Markdown 文档的文件夹。</p>
                <Button onClick={workspace.openWorkspace}>选择文件夹</Button>
              </div>
            )}
          </div>

          {workspace.error ? (
            <footer className="border-t p-3 text-xs text-destructive">
              <p>{workspace.error.message}</p>
              <Button className="mt-2 h-7 px-2 text-xs" variant="outline" onClick={workspace.openWorkspace}>
                <RefreshCw size={13} />
                重新选择
              </Button>
            </footer>
          ) : null}
        </>
      )}
    </aside>
  );
}
```

- [ ] 新增 `components/workspace/workspace-search.tsx`。

```tsx
import { Search } from 'lucide-react';

interface WorkspaceSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function WorkspaceSearch({ value, onChange }: WorkspaceSearchProps) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-2 text-sm">
      <Search className="text-muted-foreground" size={15} />
      <input
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        placeholder="搜索标题或路径"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
```

- [ ] 新增 `components/workspace/document-tree.tsx`。

```tsx
'use client';

import * as React from 'react';
import { ChevronRight, FileText, Folder } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { filterWorkspaceNodes } from './workspace-tree';
import type { WorkspaceNode } from './workspace-types';

interface DocumentTreeProps {
  nodes: WorkspaceNode[];
  searchQuery: string;
  currentDocumentPath: string | null;
  onSelectDocument: (node: WorkspaceNode) => void;
}

export function DocumentTree({
  nodes,
  searchQuery,
  currentDocumentPath,
  onSelectDocument,
}: DocumentTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const visibleNodes = filterWorkspaceNodes(nodes, searchQuery);
  const forceExpanded = searchQuery.trim().length > 0;

  if (visibleNodes.length === 0) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">没有匹配的文档</p>;
  }

  return (
    <div className="space-y-0.5 py-2">
      {visibleNodes.map((node) => (
        <TreeNode
          key={node.id}
          currentDocumentPath={currentDocumentPath}
          expanded={expanded}
          forceExpanded={forceExpanded}
          node={node}
          level={0}
          onExpandedChange={setExpanded}
          onSelectDocument={onSelectDocument}
        />
      ))}
    </div>
  );
}

function TreeNode({
  currentDocumentPath,
  expanded,
  forceExpanded,
  level,
  node,
  onExpandedChange,
  onSelectDocument,
}: {
  currentDocumentPath: string | null;
  expanded: Set<string>;
  forceExpanded: boolean;
  level: number;
  node: WorkspaceNode;
  onExpandedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSelectDocument: (node: WorkspaceNode) => void;
}) {
  const isDirectory = node.kind === 'directory';
  const isExpanded = forceExpanded || expanded.has(node.id);
  const isCurrent = node.absolutePath === currentDocumentPath;

  return (
    <div>
      <Button
        className={cn('h-8 w-full justify-start gap-2 px-2 text-left text-sm', isCurrent && 'bg-accent')}
        style={{ paddingLeft: 8 + level * 14 }}
        variant="ghost"
        onClick={() => {
          if (isDirectory) {
            onExpandedChange((previous) => {
              const next = new Set(previous);
              next.has(node.id) ? next.delete(node.id) : next.add(node.id);
              return next;
            });
          } else {
            onSelectDocument(node);
          }
        }}
      >
        {isDirectory ? (
          <ChevronRight className={cn('shrink-0 transition-transform', isExpanded && 'rotate-90')} size={14} />
        ) : (
          <FileText className="shrink-0 text-muted-foreground" size={14} />
        )}
        {isDirectory ? <Folder className="shrink-0 text-muted-foreground" size={14} /> : null}
        <span className="truncate">{node.title || node.name}</span>
      </Button>

      {isDirectory && isExpanded
        ? node.children?.map((child) => (
            <TreeNode
              key={child.id}
              currentDocumentPath={currentDocumentPath}
              expanded={expanded}
              forceExpanded={forceExpanded}
              level={level + 1}
              node={child}
              onExpandedChange={onExpandedChange}
              onSelectDocument={onSelectDocument}
            />
          ))
        : null}
    </div>
  );
}
```

### 12. EditorPane 和 AI 面板

- [ ] 新增 `components/workspace/editor-pane.tsx`。

```tsx
import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { WorkspaceNode } from './workspace-types';

interface EditorPaneProps {
  children: ReactNode;
  currentDocument: WorkspaceNode | null;
  hasWorkspace: boolean;
  onOpenWorkspace: () => void;
}

export function EditorPane({
  children,
  currentDocument,
  hasWorkspace,
  onOpenWorkspace,
}: EditorPaneProps) {
  return (
    <div className="flex h-screen min-w-0 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-5 text-sm text-muted-foreground">
        <span className="truncate">{currentDocument?.relativePath ?? '未选择文档'}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {currentDocument ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm space-y-3">
              <h1 className="text-xl font-semibold">
                {hasWorkspace ? '选择左侧文档开始编辑' : '打开一个 Markdown 工作区'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Refinex Wiki 会展示文件夹中的 .md 和 .mdx 文档。
              </p>
              <Button onClick={onOpenWorkspace}>
                <FolderOpen size={16} />
                选择文件夹
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] 新增 `components/workspace/ai-side-panel.tsx`。

```tsx
import { Bot, ChevronLeft, ChevronRight, ListTree, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { WorkspaceNode } from './workspace-types';

interface AiSidePanelProps {
  currentDocument: WorkspaceNode | null;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function AiSidePanel({
  currentDocument,
  isCollapsed,
  onCollapsedChange,
}: AiSidePanelProps) {
  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col border-l bg-background transition-[width]',
        isCollapsed ? 'w-12' : 'w-[340px]',
      )}
    >
      <header className="flex h-12 items-center justify-between border-b px-2">
        <Button
          aria-label={isCollapsed ? '展开 AI 面板' : '折叠 AI 面板'}
          size="icon"
          variant="ghost"
          onClick={() => onCollapsedChange(!isCollapsed)}
        >
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </Button>
        {isCollapsed ? null : <span className="truncate text-sm font-medium">AI 助手</span>}
      </header>

      {isCollapsed ? (
        <div className="flex flex-1 justify-center pt-4">
          <Bot size={18} className="text-muted-foreground" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{currentDocument?.title || currentDocument?.name || '未选择文档'}</p>
            <p className="mt-1 text-xs text-muted-foreground">AI 能力尚未接入。</p>
          </div>

          <div className="grid gap-2">
            <Button className="justify-start" variant="outline">
              <Sparkles size={15} />
              总结此页面
            </Button>
            <Button className="justify-start" variant="outline">
              <Bot size={15} />
              解释选中内容
            </Button>
            <Button className="justify-start" variant="outline">
              <ListTree size={15} />
              生成大纲
            </Button>
          </div>

          <textarea
            className="mt-auto min-h-24 resize-none rounded-md border bg-background p-3 text-sm outline-none"
            placeholder="使用 AI 处理各种任务..."
            disabled
          />
        </div>
      )}
    </aside>
  );
}
```

- [ ] 运行：

```bash
npm run test:run -- components/workspace
```

预期：

```text
workspace-tree.test.ts ... passed
workspace-layout.test.tsx ... passed
```

提交点：

```bash
git add components/workspace
git commit -m "feat: 添加工作区三列布局组件"
```

---

## Phase 5：接入现有编辑器页面

### 13. 让 PlateEditor 支持工作区尺寸

- [ ] 修改 `components/editor/plate-editor.tsx`，增加可选 variant，默认保持现状。

```tsx
interface PlateEditorProps {
  variant?: 'demo' | 'workspace';
}

export function PlateEditor({ variant = 'demo' }: PlateEditorProps) {
  const editor = usePlateEditor({
    plugins: EditorKit,
    value,
  });

  return (
    <Plate editor={editor}>
      <EditorContainer>
        <Editor variant={variant === 'workspace' ? 'default' : 'demo'} />
      </EditorContainer>

      <SettingsDialog />
    </Plate>
  );
}
```

验收点：

- 默认 `<PlateEditor />` 行为不变。
- 工作区内 `<PlateEditor variant="workspace" />` 使用自适应高度，不再固定 `650px`。

### 14. 替换 `/editor` 页面装配

- [ ] 修改 `app/editor/page.tsx`。

```tsx
import { Toaster } from 'sonner';

import { WorkspaceLayout } from '@/components/workspace/workspace-layout';

export default function Page() {
  return (
    <>
      <WorkspaceLayout />
      <Toaster />
    </>
  );
}
```

- [ ] 运行 focused lint：

```bash
npx eslint app/editor/page.tsx components/workspace/**/*.ts components/workspace/**/*.tsx components/editor/plate-editor.tsx
```

预期：

```text
# 无输出，退出码 0
```

提交点：

```bash
git add app/editor/page.tsx components/editor/plate-editor.tsx
git commit -m "feat: 接入工作区主界面"
```

---

## Phase 6：桌面验证和设计验收

### 15. 静态和构建验证

- [ ] 类型检查和 Next 构建：

```bash
npm run build
```

预期：

```text
Compiled successfully
```

- [ ] Tauri web 产物验证：

```bash
npm run build:desktop:web
```

预期：

```text
Tauri static export ready
```

- [ ] Tauri Rust 测试：

```bash
cd src-tauri
CARGO_HTTP_PROXY=http://127.0.0.1:7897 cargo test
```

预期：

```text
test result: ok
```

### 16. 桌面手动验收

- [ ] 启动桌面开发模式：

```bash
npm run desktop:dev
```

- [ ] 在 Tauri 窗口验证：
  - 首次进入显示选择文件夹入口。
  - 选择包含 `.md` / `.mdx` 的文件夹后，左侧展示目录树。
  - 非 Markdown 文件不出现。
  - 文件夹可以展开和折叠。
  - 点击文档后，中间路径栏显示相对路径，编辑器区域出现。
  - 搜索文件名命中。
  - 搜索相对路径命中。
  - 搜索一级标题命中。
  - 空搜索结果显示“没有匹配的文档”。
  - 右侧 AI 面板默认折叠，点击后展开，占位动作不触发网络请求。
  - 刷新或重新进入页面后恢复最近工作区。
  - 最近路径不可访问时显示恢复失败并允许重新选择。

### 17. 浏览器降级验收

- [ ] 启动 Web 开发模式：

```bash
npm run dev
```

- [ ] 打开 `/editor`，验证：
  - 页面不因缺少 Tauri runtime 崩溃。
  - “选择文件夹”不会触发未捕获异常。
  - AI 面板折叠/展开可用。

### 18. 最终质量扫描

- [ ] 搜索未完成占位和调试输出：

```bash
rg -n "TODO|FIXME|console\\.log|debugger" app components src-tauri/src
```

预期：

```text
# 无本次新增未处理项
```

- [ ] 确认未误接入 AI API：

```bash
rg -n "/api/ai|useChat|streamText|generateText" components/workspace app/editor
```

预期：

```text
# 无输出
```

- [ ] 确认 updater 未重新注册：

```bash
rg -n "tauri_plugin_updater::init|plugins\\.updater|updater:default" src-tauri
```

预期：

```text
# 无输出
```

最终提交点：

```bash
git status --short
git log --oneline -5
```

如果前面分段提交已完成，最终不需要 squash；保留可回滚的阶段提交。

---

## 风险和处理

- **Tauri runtime 检测不稳定：** `__TAURI_INTERNALS__` 只作为第一版降级判断。若测试发现不稳定，改为懒加载 Tauri API 并捕获 import/invoke 异常。
- **目录过大导致 UI 卡顿：** 第一版后端跳过 `node_modules`、`.next`、`target`、`dist`、`build`、隐藏目录；如仍卡顿，再加最大文件数保护。
- **Plate demo value 每次切换文档重置：** 第一版不读写真实文档内容，属于已确认范围；后续 Markdown 读写再单独设计。
- **完整 `npm run lint` 可能暴露既有债务：** 本计划要求 focused lint 覆盖新增和改动文件；如全量 lint 失败，记录既有文件，不混入本次修复。
- **测试依赖版本和 React 19 兼容：** 计划中的测试依赖版本已通过 `npm view` 核对；如果安装时 peer dependency 规则变化，使用 npm 解析到的最新版并记录 lockfile。

## 自检清单

- [ ] 规格覆盖：三列布局、左侧折叠、右侧 AI 默认折叠、目录树、搜索、最近工作区恢复、Web 降级均有任务。
- [ ] 非目标未越界：未实现全文搜索、真实 AI、文件管理、Plate 插件重构。
- [ ] 文件清单明确：所有新增和修改文件已列出。
- [ ] 测试先行：纯工具、布局行为、Rust 目录快照都有测试入口。
- [ ] 验证命令明确：前端测试、focused lint、Next build、Tauri web build、Cargo test、桌面手动验收均列出。
- [ ] 提交点明确：测试基础设施、树搜索、Tauri 命令、三列布局、页面接入分段提交。

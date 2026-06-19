---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Markdown Document Edit And Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a real `.md` / `.mdx` document loads it into the workspace editor, lets the user edit it, and saves changes automatically or via `Cmd/Ctrl + S`.

**Architecture:** Keep filesystem authority in Tauri commands and keep editor concerns in the existing Plate editor. `useWorkspace` becomes the document orchestration layer: it loads document content, tracks dirty/saving/error state, schedules debounce saves, and exposes explicit callbacks to `WorkspaceLayout`.

**Tech Stack:** Tauri v2 commands in Rust, Next.js 16 / React 19, Plate v53 with `@platejs/markdown`, Vitest, Testing Library, Cargo tests.

---

## File Structure

- Modify `src-tauri/src/workspace.rs`: add secure document read/write commands and Rust tests.
- Modify `src-tauri/src/lib.rs`: register `read_document` and `save_document` commands.
- Modify `components/workspace/workspace-types.ts`: add document content, load state, and save state types.
- Modify `components/workspace/workspace-api.ts`: add typed `readDocument` and `saveDocument` wrappers around Tauri `invoke`.
- Modify `components/workspace/use-workspace.ts`: replace direct document selection with document loading, dirty tracking, debounce save, and immediate save.
- Modify `components/workspace/workspace-sidebar.tsx`: call `workspace.openDocument` when a document is selected.
- Modify `components/workspace/editor-pane.tsx`: render loading, document read error, and save status surfaces.
- Modify `components/workspace/workspace-layout.tsx`: pass loaded Markdown content and save callbacks into `PlateEditor`.
- Modify `components/editor/plate-editor.tsx`: accept workspace Markdown props, deserialize Markdown on document switch, serialize on editor changes, and catch `Cmd/Ctrl + S`.
- Modify `components/workspace/__tests__/workspace-api.test.ts`: cover read/save wrappers.
- Create `components/workspace/__tests__/workspace-document-flow.test.tsx`: cover document load and save UI flow with mocked APIs and mocked `PlateEditor`.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`: update existing document-click expectations to account for loading.

## Task 1: Tauri Document Read/Write Commands

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing Rust tests for document read/write and path validation**

Append these tests inside the existing `#[cfg(test)] mod tests` block in `src-tauri/src/workspace.rs`:

```rust
#[test]
fn reads_markdown_document_inside_workspace() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let doc_path = temp_dir.path().join("guide.md");
    fs::write(&doc_path, "# 指南\n正文").expect("写入测试文档失败");

    let document = read_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
    )
    .expect("读取 Markdown 文档失败");

    assert_eq!(document.path, doc_path.canonicalize().unwrap().to_string_lossy());
    assert_eq!(document.content, "# 指南\n正文");
    assert!(document.modified_at > 0);
}

#[test]
fn saves_markdown_document_inside_workspace() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let doc_path = temp_dir.path().join("guide.md");
    fs::write(&doc_path, "# 旧内容").expect("写入测试文档失败");

    let meta = save_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
        "# 新内容\n正文".to_string(),
    )
    .expect("保存 Markdown 文档失败");

    assert_eq!(fs::read_to_string(&doc_path).unwrap(), "# 新内容\n正文");
    assert_eq!(meta.path, doc_path.canonicalize().unwrap().to_string_lossy());
    assert!(meta.modified_at > 0);
}

#[test]
fn rejects_non_markdown_document() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let doc_path = temp_dir.path().join("notes.txt");
    fs::write(&doc_path, "文本").expect("写入测试文档失败");

    let error = read_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
    )
    .expect_err("非 Markdown 文档不应读取成功");

    assert_eq!(error, "仅支持 Markdown 文档");
}

#[test]
fn rejects_document_outside_workspace() {
    let workspace_dir = tempfile::tempdir().expect("创建工作区失败");
    let outside_dir = tempfile::tempdir().expect("创建外部目录失败");
    let outside_doc = outside_dir.path().join("outside.md");
    fs::write(&outside_doc, "# 外部文档").expect("写入外部文档失败");

    let error = read_document(
        workspace_dir.path().to_string_lossy().to_string(),
        outside_doc.to_string_lossy().to_string(),
    )
    .expect_err("工作区外文档不应读取成功");

    assert_eq!(error, "无法打开工作区外的文档");
}
```

- [ ] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests::reads_markdown_document_inside_workspace workspace::tests::saves_markdown_document_inside_workspace workspace::tests::rejects_non_markdown_document workspace::tests::rejects_document_outside_workspace
```

Expected: FAIL because `read_document`, `save_document`, and response structs do not exist.

- [ ] **Step 3: Implement document structs and secure path validation**

Add these definitions and helpers in `src-tauri/src/workspace.rs` below `WorkspaceNodeKind`:

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    pub path: String,
    pub content: String,
    pub modified_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentMeta {
    pub path: String,
    pub modified_at: u128,
}

#[tauri::command]
pub fn read_document(root_path: String, document_path: String) -> Result<DocumentContent, String> {
    let document = validate_markdown_document(&root_path, &document_path)?;
    let content = fs::read_to_string(&document).map_err(|_| "无法读取文档内容".to_string())?;
    let modified_at = read_modified_at(&document)?;

    Ok(DocumentContent {
        path: document.to_string_lossy().to_string(),
        content,
        modified_at,
    })
}

#[tauri::command]
pub fn save_document(
    root_path: String,
    document_path: String,
    content: String,
) -> Result<DocumentContentMeta, String> {
    let document = validate_markdown_document(&root_path, &document_path)?;

    fs::write(&document, content).map_err(|_| "无法保存文档内容".to_string())?;

    Ok(DocumentContentMeta {
        path: document.to_string_lossy().to_string(),
        modified_at: read_modified_at(&document)?,
    })
}

fn validate_markdown_document(root_path: &str, document_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;
    let document = PathBuf::from(document_path)
        .canonicalize()
        .map_err(|_| "文档路径不存在".to_string())?;

    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }

    if !document.starts_with(&root) {
        return Err("无法打开工作区外的文档".to_string());
    }

    if !document.is_file() {
        return Err("文档路径不是文件".to_string());
    }

    if !is_markdown_file(&document) {
        return Err("仅支持 Markdown 文档".to_string());
    }

    Ok(document)
}

fn read_modified_at(path: &Path) -> Result<u128, String> {
    let metadata = fs::metadata(path).map_err(|_| "无法读取文档信息".to_string())?;
    let modified = metadata
        .modified()
        .map_err(|_| "无法读取文档修改时间".to_string())?;
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "文档修改时间无效".to_string())?;

    Ok(duration.as_millis())
}
```

- [ ] **Step 4: Register the new commands**

Change `src-tauri/src/lib.rs` invoke handler from:

```rust
.invoke_handler(tauri::generate_handler![workspace::load_workspace_tree])
```

to:

```rust
.invoke_handler(tauri::generate_handler![
    workspace::load_workspace_tree,
    workspace::read_document,
    workspace::save_document,
])
```

- [ ] **Step 5: Run Rust tests and verify they pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests
```

Expected: PASS for all workspace Rust tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs
git commit -m "feat：添加 Markdown 文档读写命令"
```

## Task 2: Frontend Document API Types And Wrappers

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Add failing API wrapper tests**

Extend imports in `components/workspace/__tests__/workspace-api.test.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRecentWorkspacePath,
  getWorkspaceHistory,
  readDocument,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  saveDocument,
} from '../workspace-api';
```

Add the mock above the first `describe`:

```ts
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
```

Add these tests after the history tests:

```ts
describe('workspace-api document IO', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('reads a markdown document through Tauri', async () => {
    invokeMock.mockResolvedValueOnce({
      path: '/repo/README.md',
      content: '# 项目说明',
      modifiedAt: 1,
    });

    await expect(readDocument('/repo', '/repo/README.md')).resolves.toEqual({
      path: '/repo/README.md',
      content: '# 项目说明',
      modifiedAt: 1,
    });

    expect(invokeMock).toHaveBeenCalledWith('read_document', {
      rootPath: '/repo',
      documentPath: '/repo/README.md',
    });
  });

  it('saves a markdown document through Tauri', async () => {
    invokeMock.mockResolvedValueOnce({
      path: '/repo/README.md',
      modifiedAt: 2,
    });

    await expect(
      saveDocument('/repo', '/repo/README.md', '# 更新'),
    ).resolves.toEqual({
      path: '/repo/README.md',
      modifiedAt: 2,
    });

    expect(invokeMock).toHaveBeenCalledWith('save_document', {
      rootPath: '/repo',
      documentPath: '/repo/README.md',
      content: '# 更新',
    });
  });
});
```

- [ ] **Step 2: Run API tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because `readDocument` and `saveDocument` are not exported.

- [ ] **Step 3: Add document types**

Append to `components/workspace/workspace-types.ts`:

```ts
export interface DocumentContent {
  path: string;
  content: string;
  modifiedAt: number;
}

export interface DocumentContentMeta {
  path: string;
  modifiedAt: number;
}

export type DocumentLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type DocumentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
```

- [ ] **Step 4: Add typed document wrappers**

Change the import in `components/workspace/workspace-api.ts` to:

```ts
import type {
  DocumentContent,
  DocumentContentMeta,
  WorkspaceHistoryItem,
  WorkspaceSnapshot,
} from './workspace-types';
```

Append:

```ts
export async function readDocument(rootPath: string, documentPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentContent>('read_document', { rootPath, documentPath });
}

export async function saveDocument(
  rootPath: string,
  documentPath: string,
  content: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentContentMeta>('save_document', {
    rootPath,
    documentPath,
    content,
  });
}
```

- [ ] **Step 5: Run API tests and verify they pass**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat：添加前端 Markdown 文档读写接口"
```

## Task 3: Workspace Document Loading State

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/workspace-sidebar.tsx`
- Modify: `components/workspace/editor-pane.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Create: `components/workspace/__tests__/workspace-document-flow.test.tsx`

- [ ] **Step 1: Add failing document load flow tests**

Create `components/workspace/__tests__/workspace-document-flow.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readDocument, saveDocument } from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    documentKey,
    markdown,
  }: {
    documentKey?: string;
    markdown?: string;
  }) => (
    <div data-document-key={documentKey} data-testid="plate-editor">
      {markdown}
    </div>
  ),
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    readDocument: vi.fn(),
    saveDocument: vi.fn(),
    setAppWindowTitle: vi.fn(),
  };
});

const readDocumentMock = vi.mocked(readDocument);
const saveDocumentMock = vi.mocked(saveDocument);

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'guide',
      name: 'guide.md',
      kind: 'document',
      relativePath: 'guide.md',
      absolutePath: '/repo/guide.md',
      title: '指南',
    },
  ],
};

describe('Workspace document flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readDocumentMock.mockReset();
    saveDocumentMock.mockReset();
  });

  it('loads the selected markdown document into the editor', async () => {
    const user = userEvent.setup();
    readDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: '# 指南\n正文',
      modifiedAt: 1,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));

    expect(screen.getByText('正在打开文档...')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('plate-editor')).toHaveTextContent('# 指南');
    });

    expect(readDocumentMock).toHaveBeenCalledWith('/repo', '/repo/guide.md');
    expect(screen.getByTestId('plate-editor')).toHaveAttribute(
      'data-document-key',
      '/repo/guide.md:1',
    );
  });

  it('shows a document read error without clearing the sidebar', async () => {
    const user = userEvent.setup();
    readDocumentMock.mockRejectedValueOnce(new Error('无法读取文档内容'));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));

    await waitFor(() => {
      expect(screen.getByText('无法读取文档内容')).toBeTruthy();
    });

    expect(screen.getByText('指南')).toBeTruthy();
    expect(screen.queryByTestId('plate-editor')).toBeNull();
  });
});
```

- [ ] **Step 2: Run document flow tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: FAIL because clicking a document still only sets `currentDocument` and never calls `readDocument`.

- [ ] **Step 3: Extend `useWorkspace` with document load state**

In `components/workspace/use-workspace.ts`, extend imports:

```ts
import {
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  readDocument,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  saveRecentWorkspacePath,
  selectWorkspaceRoot,
} from './workspace-api';
import type {
  DocumentContent,
  DocumentLoadState,
  DocumentSaveState,
  WorkspaceLoadError,
  WorkspaceHistoryItem,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';
```

Add state after `currentDocument`:

```ts
const [documentContent, setDocumentContent] =
  React.useState<DocumentContent | null>(null);
const [documentLoadState, setDocumentLoadState] =
  React.useState<DocumentLoadState>('idle');
const [documentLoadError, setDocumentLoadError] = React.useState<string | null>(
  null,
);
const [documentVersion, setDocumentVersion] = React.useState(0);
const [draftMarkdown, setDraftMarkdown] = React.useState('');
const [saveState, setSaveState] = React.useState<DocumentSaveState>('idle');
const [saveError, setSaveError] = React.useState<string | null>(null);
const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
```

Add refs after state:

```ts
const lastSavedMarkdownRef = React.useRef('');
const pendingSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
  null,
);
```

Add helper:

```ts
const clearPendingSave = React.useCallback(() => {
  if (pendingSaveTimerRef.current) {
    clearTimeout(pendingSaveTimerRef.current);
    pendingSaveTimerRef.current = null;
  }
}, []);
```

Add `openDocument`:

```ts
const openDocument = React.useCallback(
  async (node: WorkspaceNode) => {
    if (!snapshot || node.kind !== 'document') {
      return;
    }

    clearPendingSave();
    setCurrentDocument(node);
    setDocumentContent(null);
    setDocumentLoadState('loading');
    setDocumentLoadError(null);
    setSaveState('idle');
    setSaveError(null);

    try {
      const content = await readDocument(snapshot.rootPath, node.absolutePath);

      setDocumentContent(content);
      setDraftMarkdown(content.content);
      lastSavedMarkdownRef.current = content.content;
      setDocumentVersion((version) => version + 1);
      setDocumentLoadState('loaded');
      setSaveState('saved');
      setLastSavedAt(content.modifiedAt);
    } catch (error) {
      setDocumentContent(null);
      setDraftMarkdown('');
      lastSavedMarkdownRef.current = '';
      setDocumentLoadState('error');
      setDocumentLoadError(
        error instanceof Error ? error.message : '无法读取文档内容',
      );
    }
  },
  [clearPendingSave, snapshot],
);
```

When clearing or switching workspaces, also reset document state by adding this helper inside `useWorkspace`:

```ts
const resetDocumentState = React.useCallback(() => {
  clearPendingSave();
  setCurrentDocument(null);
  setDocumentContent(null);
  setDocumentLoadState('idle');
  setDocumentLoadError(null);
  setDocumentVersion(0);
  setDraftMarkdown('');
  lastSavedMarkdownRef.current = '';
  setSaveState('idle');
  setSaveError(null);
  setLastSavedAt(null);
}, [clearPendingSave]);
```

Use `resetDocumentState()` in `loadWorkspace` after `setSnapshot(nextSnapshot)` and in `removeWorkspace` when removing the active workspace.

Return the new API:

```ts
documentContent,
documentLoadError,
documentLoadState,
documentVersion,
draftMarkdown,
lastSavedAt,
openDocument,
saveError,
saveState,
```

- [ ] **Step 4: Route document selection through `openDocument`**

In `components/workspace/workspace-sidebar.tsx`, change:

```tsx
onSelectDocument={workspace.setCurrentDocument}
```

to:

```tsx
onSelectDocument={workspace.openDocument}
```

- [ ] **Step 5: Render loading and error states in `EditorPane`**

Extend `EditorPaneProps` in `components/workspace/editor-pane.tsx`:

```ts
import type { DocumentLoadState, DocumentSaveState, WorkspaceNode } from './workspace-types';

interface EditorPaneProps {
  children: ReactNode;
  currentDocument: WorkspaceNode | null;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  hasWorkspace: boolean;
  onOpenWorkspace: () => void;
  onRetryDocument: () => void;
  saveError: string | null;
  saveState: DocumentSaveState;
}
```

Add a status block before the scrollable body:

```tsx
{currentDocument && documentLoadState === 'loaded' ? (
  <div className="flex h-9 items-center justify-end border-b px-3 text-xs text-muted-foreground">
    {saveState === 'dirty' ? '有未保存更改' : null}
    {saveState === 'saving' ? '保存中...' : null}
    {saveState === 'saved' ? '已保存' : null}
    {saveState === 'error' ? (
      <span className="text-destructive">{saveError ?? '保存失败'}</span>
    ) : null}
  </div>
) : null}
```

Inside the body, render loading and error before `children`:

```tsx
{currentDocument && documentLoadState === 'loading' ? (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    正在打开文档...
  </div>
) : currentDocument && documentLoadState === 'error' ? (
  <div className="flex h-full items-center justify-center px-6 text-center">
    <div className="max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">无法打开文档</h1>
      <p className="text-sm text-muted-foreground">
        {documentLoadError ?? '无法读取文档内容'}
      </p>
      <Button type="button" onClick={onRetryDocument}>
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  </div>
) : currentDocument ? (
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
      <Button type="button" onClick={onOpenWorkspace}>
        <FolderOpen size={16} />
        选择文件夹
      </Button>
    </div>
  </div>
)}
```

Add `RefreshCw` to the lucide import.

- [ ] **Step 6: Pass state through `WorkspaceLayout`**

In `components/workspace/workspace-layout.tsx`, update `EditorPane` props:

```tsx
<EditorPane
  currentDocument={workspace.currentDocument}
  documentLoadError={workspace.documentLoadError}
  documentLoadState={workspace.documentLoadState}
  hasWorkspace={workspace.snapshot !== null}
  saveError={workspace.saveError}
  saveState={workspace.saveState}
  onOpenWorkspace={workspace.openWorkspace}
  onRetryDocument={workspace.retryCurrentDocument}
>
  {workspace.currentDocument &&
  workspace.documentContent &&
  workspace.documentLoadState === 'loaded' ? (
    <PlateEditor
      documentKey={`${workspace.documentContent.path}:${workspace.documentVersion}`}
      markdown={workspace.documentContent.content}
      variant="workspace"
    />
  ) : null}
</EditorPane>
```

Add `retryCurrentDocument` in `useWorkspace`:

```ts
const retryCurrentDocument = React.useCallback(() => {
  if (currentDocument) {
    void openDocument(currentDocument);
  }
}, [currentDocument, openDocument]);
```

Return it from `useWorkspace`.

- [ ] **Step 7: Update the existing layout test expectation**

In `components/workspace/__tests__/workspace-layout.test.tsx`, replace the final two assertions in `keeps the active document title out of the editor body chrome` with this single assertion. The new successful editor render path is covered by `workspace-document-flow.test.tsx`.

```tsx
await user.click(screen.getByText('项目说明'));

expect(screen.queryByTestId('editor-document-path')).toBeNull();
```

- [ ] **Step 8: Run document flow tests and verify they pass**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add components/workspace/use-workspace.ts components/workspace/workspace-sidebar.tsx components/workspace/editor-pane.tsx components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-document-flow.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat：加载选中的 Markdown 文档"
```

## Task 4: Plate Markdown Adapter

**Files:**
- Modify: `components/editor/plate-editor.tsx`
- Modify: `components/workspace/workspace-layout.tsx`

- [ ] **Step 1: Add workspace Markdown props to `PlateEditor`**

Change `PlateEditorProps`:

```ts
interface PlateEditorProps {
  documentKey?: string;
  markdown?: string;
  onMarkdownChange?: (markdown: string) => void;
  onSaveRequested?: () => void;
  variant?: 'demo' | 'workspace';
}
```

- [ ] **Step 2: Import MarkdownPlugin**

Add:

```ts
import { MarkdownPlugin } from '@platejs/markdown';
```

- [ ] **Step 3: Initialize editor from Markdown in workspace mode**

Replace the current editor initialization with:

```tsx
export function PlateEditor({
  documentKey,
  markdown,
  onMarkdownChange,
  onSaveRequested,
  variant = 'demo',
}: PlateEditorProps) {
  const editor = usePlateEditor(
    {
      plugins: EditorKit,
      value: (editorInstance) => {
        if (variant === 'workspace') {
          const source = markdown ?? '';
          const nodes =
            editorInstance.getApi(MarkdownPlugin).markdown.deserialize(source);

          return nodes.length > 0
            ? nodes
            : [{ children: [{ text: '' }], type: 'p' }];
        }

        return value;
      },
    },
    [documentKey, variant],
  );
```

- [ ] **Step 4: Serialize editor changes back to Markdown**

Change `<Plate editor={editor}>` to:

```tsx
<Plate
  editor={editor}
  onChange={({ value }) => {
    if (variant !== 'workspace' || !onMarkdownChange) {
      return;
    }

    const nextMarkdown = editor
      .getApi(MarkdownPlugin)
      .markdown.serialize({ value });

    onMarkdownChange(nextMarkdown);
  }}
>
```

- [ ] **Step 5: Add save keyboard shortcut**

Change the `Editor` usage to:

```tsx
<Editor
  variant={variant === 'workspace' ? 'default' : 'demo'}
  onKeyDown={(event) => {
    if (
      variant === 'workspace' &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 's'
    ) {
      event.preventDefault();
      onSaveRequested?.();
    }
  }}
/>
```

- [ ] **Step 6: Pass callbacks from `WorkspaceLayout`**

Update the `PlateEditor` in `components/workspace/workspace-layout.tsx`:

```tsx
<PlateEditor
  documentKey={`${workspace.documentContent.path}:${workspace.documentVersion}`}
  markdown={workspace.documentContent.content}
  variant="workspace"
  onMarkdownChange={workspace.updateDocumentMarkdown}
  onSaveRequested={workspace.saveCurrentDocumentNow}
/>
```

- [ ] **Step 7: Run TypeScript-oriented checks**

Run:

```bash
npx eslint components/editor/plate-editor.tsx components/workspace/workspace-layout.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add components/editor/plate-editor.tsx components/workspace/workspace-layout.tsx
git commit -m "feat：接入 Plate Markdown 文档内容"
```

## Task 5: Auto Save And Immediate Save

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/__tests__/workspace-document-flow.test.tsx`

- [ ] **Step 1: Add failing save tests**

Extend the mocked `PlateEditor` in `components/workspace/__tests__/workspace-document-flow.test.tsx`:

```tsx
PlateEditor: ({
  documentKey,
  markdown,
  onMarkdownChange,
  onSaveRequested,
}: {
  documentKey?: string;
  markdown?: string;
  onMarkdownChange?: (markdown: string) => void;
  onSaveRequested?: () => void;
}) => (
  <div>
    <div data-document-key={documentKey} data-testid="plate-editor">
      {markdown}
    </div>
    <button
      type="button"
      onClick={() => onMarkdownChange?.('# 指南\n更新正文')}
    >
      模拟编辑
    </button>
    <button type="button" onClick={() => onSaveRequested?.()}>
      模拟快捷保存
    </button>
  </div>
),
```

Add tests:

```tsx
it('auto saves edited markdown after debounce', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  readDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    content: '# 指南\n正文',
    modifiedAt: 1,
  });
  saveDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    modifiedAt: 2,
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('指南'));
  await screen.findByTestId('plate-editor');
  await user.click(screen.getByText('模拟编辑'));

  expect(screen.getByText('有未保存更改')).toBeTruthy();

  vi.advanceTimersByTime(800);

  await waitFor(() => {
    expect(saveDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/guide.md',
      '# 指南\n更新正文',
    );
  });
  await waitFor(() => {
    expect(screen.getByText('已保存')).toBeTruthy();
  });

  vi.useRealTimers();
});

it('saves immediately when save is requested', async () => {
  const user = userEvent.setup();
  readDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    content: '# 指南\n正文',
    modifiedAt: 1,
  });
  saveDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    modifiedAt: 3,
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('指南'));
  await screen.findByTestId('plate-editor');
  await user.click(screen.getByText('模拟编辑'));
  await user.click(screen.getByText('模拟快捷保存'));

  await waitFor(() => {
    expect(saveDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/guide.md',
      '# 指南\n更新正文',
    );
  });
});

it('keeps edited content visible when save fails', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  readDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    content: '# 指南\n正文',
    modifiedAt: 1,
  });
  saveDocumentMock.mockRejectedValueOnce(new Error('无法保存文档内容'));

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('指南'));
  await screen.findByTestId('plate-editor');
  await user.click(screen.getByText('模拟编辑'));

  vi.advanceTimersByTime(800);

  await waitFor(() => {
    expect(screen.getByText('无法保存文档内容')).toBeTruthy();
  });

  expect(screen.getByTestId('plate-editor')).toBeTruthy();

  vi.useRealTimers();
});
```

- [ ] **Step 2: Run save tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: FAIL because save callbacks are not implemented in `useWorkspace`.

- [ ] **Step 3: Implement `saveCurrentDocumentNow`**

Add to `components/workspace/use-workspace.ts` after `openDocument`:

```ts
const saveCurrentDocumentNow = React.useCallback(
  async (contentOverride?: string) => {
    if (!snapshot || !currentDocument || currentDocument.kind !== 'document') {
      return;
    }

    const content = contentOverride ?? draftMarkdown;

    clearPendingSave();

    if (content === lastSavedMarkdownRef.current) {
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    setSaveError(null);

    try {
      const meta = await saveDocument(
        snapshot.rootPath,
        currentDocument.absolutePath,
        content,
      );

      lastSavedMarkdownRef.current = content;
      setDocumentContent((previous) =>
        previous
          ? {
              ...previous,
              content,
              modifiedAt: meta.modifiedAt,
            }
          : previous,
      );
      setLastSavedAt(meta.modifiedAt);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setSaveError(
        error instanceof Error ? error.message : '无法保存文档内容',
      );
    }
  },
  [clearPendingSave, currentDocument, draftMarkdown, snapshot],
);
```

- [ ] **Step 4: Implement debounced document markdown updates**

Add:

```ts
const updateDocumentMarkdown = React.useCallback(
  (nextMarkdown: string) => {
    setDraftMarkdown(nextMarkdown);

    if (nextMarkdown === lastSavedMarkdownRef.current) {
      clearPendingSave();
      setSaveState('saved');
      setSaveError(null);
      return;
    }

    setSaveState('dirty');
    setSaveError(null);
    clearPendingSave();

    pendingSaveTimerRef.current = setTimeout(() => {
      void saveCurrentDocumentNow(nextMarkdown);
    }, 800);
  },
  [clearPendingSave, saveCurrentDocumentNow],
);
```

Return `updateDocumentMarkdown` and `saveCurrentDocumentNow` from `useWorkspace`.

- [ ] **Step 5: Clean up pending saves on unmount**

Add:

```ts
React.useEffect(() => {
  return () => {
    clearPendingSave();
  };
}, [clearPendingSave]);
```

- [ ] **Step 6: Run save tests and verify they pass**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add components/workspace/use-workspace.ts components/workspace/__tests__/workspace-document-flow.test.tsx
git commit -m "feat：支持 Markdown 文档自动保存"
```

## Task 6: Save Before Document Switch

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/__tests__/workspace-document-flow.test.tsx`

- [ ] **Step 1: Add a failing test for saving dirty content before switching documents**

Extend the `snapshot.nodes` in `workspace-document-flow.test.tsx` with a second document:

```ts
{
  id: 'notes',
  name: 'notes.md',
  kind: 'document',
  relativePath: 'notes.md',
  absolutePath: '/repo/notes.md',
  title: '笔记',
}
```

Add:

```tsx
it('saves dirty content before opening another document', async () => {
  const user = userEvent.setup();
  readDocumentMock
    .mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: '# 指南\n正文',
      modifiedAt: 1,
    })
    .mockResolvedValueOnce({
      path: '/repo/notes.md',
      content: '# 笔记',
      modifiedAt: 4,
    });
  saveDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    modifiedAt: 3,
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('指南'));
  await screen.findByTestId('plate-editor');
  await user.click(screen.getByText('模拟编辑'));
  await user.click(screen.getByText('笔记'));

  await waitFor(() => {
    expect(saveDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/guide.md',
      '# 指南\n更新正文',
    );
  });
  await waitFor(() => {
    expect(screen.getByTestId('plate-editor')).toHaveTextContent('# 笔记');
  });
});
```

- [ ] **Step 2: Run the switch test and verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx -t "saves dirty content before opening another document"
```

Expected: FAIL because `openDocument` clears pending saves before saving dirty content.

- [ ] **Step 3: Save dirty content before opening a new document**

Change the top of `openDocument` in `components/workspace/use-workspace.ts` to:

```ts
if (saveState === 'dirty' || saveState === 'saving') {
  await saveCurrentDocumentNow(draftMarkdown);
}

clearPendingSave();
setCurrentDocument(node);
```

To avoid callback declaration order issues, define `saveCurrentDocumentNow` before `openDocument`, and make both callbacks depend on the exact state they use.

- [ ] **Step 4: Run document flow tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add components/workspace/use-workspace.ts components/workspace/__tests__/workspace-document-flow.test.tsx
git commit -m "feat：切换文档前保存未保存内容"
```

## Task 7: Full Verification And Browser Check

**Files:**
- No source edits expected in this task.

- [ ] **Step 1: Run all focused workspace tests**

Run:

```bash
npm run test:run -- components/workspace
```

Expected: PASS.

- [ ] **Step 2: Run Rust workspace tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests
```

Expected: PASS.

- [ ] **Step 3: Run focused ESLint**

Run:

```bash
npx eslint app/page.tsx app/editor/page.tsx components/workspace/**/*.ts components/workspace/**/*.tsx components/editor/plate-editor.tsx vitest.config.ts
```

Expected: PASS with no output.

- [ ] **Step 4: Run Next production build**

Run:

```bash
npm run build
```

Expected: exit 0 and route summary printed.

- [ ] **Step 5: Run Tauri no-bundle build**

Run:

```bash
npm run desktop:build -- --no-bundle
```

Expected: exit 0 and `Built application at: .../src-tauri/target/release/refinex_wiki`.

- [ ] **Step 6: Manually validate in the running app**

Use the current desktop app or `npm run desktop:dev` and verify:

```text
1. Open an existing Markdown workspace.
2. Click a `.md` file in the left tree.
3. Confirm the editor no longer shows "Welcome to the Plate Playground!".
4. Confirm the file Markdown content appears in the editor.
5. Type a small change.
6. Confirm status changes to "有未保存更改", then "保存中...", then "已保存".
7. Press Cmd/Ctrl + S after another edit and confirm it saves immediately.
8. Reopen the file from disk and confirm the Markdown content was written.
```

- [ ] **Step 7: Final commit if verification required small fixes**

If Step 1-6 required fixes, commit only those focused fixes:

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs components/workspace components/editor/plate-editor.tsx
git commit -m "fix：完善 Markdown 文档编辑保存验证"
```

If no fixes were required, do not create an empty commit.

## Self-Review

- Spec coverage: document load, Plate rendering, auto save, immediate save, path validation, save status, failure retention, and verification are each mapped to tasks.
- Placeholder scan: no unresolved placeholders or deferred requirements are present.
- Type consistency: `DocumentContent`, `DocumentContentMeta`, `DocumentLoadState`, `DocumentSaveState`, `readDocument`, `saveDocument`, `openDocument`, `updateDocumentMarkdown`, and `saveCurrentDocumentNow` are named consistently across tasks.

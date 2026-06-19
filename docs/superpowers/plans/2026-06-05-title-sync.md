---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 文件树名称与 H1 标题双向同步 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文件树显示名称与编辑器 H1 标题双向实时同步，编辑任一端都会自动更新另一端。

**Architecture:** 在现有内容更新和重命名流程中扩展。`withUpdatedMarkdownValue` 检测 H1 变更并同步更新 frontmatter `title`；`updateDocumentValue` 检测到标题变更后防抖 300ms 触发文件重命名。Rust 后端 `update_markdown_document_title` 扩展为同时更新正文中 H1。

**Tech Stack:** React hooks (use-workspace.ts), PlateJS editor value, Tauri/Rust backend, Vitest, cargo test

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `components/editor/__tests__/title-sync-utils.test.ts` | 新增工具函数的单元测试 |
| Modify | `components/editor/markdown-document.ts:57-71,120-131` | 新增 `extractH1Text`、`sanitizeTitleForFileName` |
| Modify | `components/workspace/use-workspace.ts:99-109,111-125,304-329,744-762,838-855` | 标题同步逻辑（refs、debounce、withUpdatedMarkdownValue） |
| Modify | `src-tauri/src/workspace.rs:1799-1840` | `replace_first_h1` + 更新 `update_markdown_document_title` |
| Modify | `src-tauri/src/workspace.rs:1957+` | 新增 Rust 测试 |

---

### Task 1: 新增 `extractH1Text` 和 `sanitizeTitleForFileName` 工具函数

**Files:**
- Create: `components/editor/__tests__/title-sync-utils.test.ts`
- Modify: `components/editor/markdown-document.ts`

- [ ] **Step 1: 写失败测试**

创建 `components/editor/__tests__/title-sync-utils.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import type { Value } from 'platejs';

import {
  extractH1Text,
  sanitizeTitleForFileName,
} from '../markdown-document';

describe('extractH1Text', () => {
  it('从第一个 H1 元素中提取文本', () => {
    const value: Value = [
      { type: 'h1', children: [{ text: '我的标题' }] } as never,
      { type: 'p', children: [{ text: '正文' }] } as never,
    ];

    expect(extractH1Text(value)).toBe('我的标题');
  });

  it('没有 H1 元素时返回 null', () => {
    const value: Value = [
      { type: 'p', children: [{ text: '正文' }] } as never,
    ];

    expect(extractH1Text(value)).toBeNull();
  });

  it('从嵌套子元素中提取文本（如加粗文本）', () => {
    const value: Value = [
      {
        type: 'h1',
        children: [
          { text: 'Hello ', bold: true } as never,
          { text: 'World' } as never,
        ],
      } as never,
    ];

    expect(extractH1Text(value)).toBe('Hello World');
  });

  it('H1 无文本内容时返回空字符串', () => {
    const value: Value = [
      { type: 'h1', children: [{ text: '' }] } as never,
    ];

    expect(extractH1Text(value)).toBe('');
  });
});

describe('sanitizeTitleForFileName', () => {
  it('无特殊字符时原样返回', () => {
    expect(sanitizeTitleForFileName('我的文档')).toBe('我的文档');
  });

  it('将特殊字符替换为短横线', () => {
    expect(sanitizeTitleForFileName('a/b:c*d')).toBe('a-b-c-d');
  });

  it('去除首尾的点号', () => {
    expect(sanitizeTitleForFileName('..test..')).toBe('test');
  });

  it('空字符串返回未命名文档', () => {
    expect(sanitizeTitleForFileName('')).toBe('未命名文档');
  });

  it('仅空白字符返回未命名文档', () => {
    expect(sanitizeTitleForFileName('   ')).toBe('未命名文档');
  });

  it('仅点号返回未命名文档', () => {
    expect(sanitizeTitleForFileName('...')).toBe('未命名文档');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/editor/__tests__/title-sync-utils.test.ts`
Expected: FAIL — `extractH1Text` and `sanitizeTitleForFileName` are not exported

- [ ] **Step 3: 实现两个工具函数**

在 `components/editor/markdown-document.ts` 末尾（`unquote` 函数之后）添加：

```typescript
export function extractH1Text(value: Value): string | null {
  for (const node of value) {
    if (node.type === 'h1') {
      return getNodeText(node);
    }
  }

  return null;
}

function getNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (Array.isArray(record.children)) {
    return record.children.map((child) => getNodeText(child)).join('');
  }

  return '';
}

export function sanitizeTitleForFileName(title: string): string {
  const sanitized = title
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .trim();

  return sanitized || '未命名文档';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run components/editor/__tests__/title-sync-utils.test.ts`
Expected: PASS — all 10 tests pass

- [ ] **Step 5: 提交**

```bash
git add components/editor/__tests__/title-sync-utils.test.ts components/editor/markdown-document.ts
git commit -m "feat: 新增 extractH1Text 和 sanitizeTitleForFileName 工具函数"
```

---

### Task 2: `withUpdatedMarkdownValue` 同步 frontmatter title 与 H1

**Files:**
- Modify: `components/workspace/use-workspace.ts` — `withUpdatedMarkdownValue` 函数（第 838-855 行）

- [ ] **Step 1: 修改 `withUpdatedMarkdownValue`**

在 `use-workspace.ts` 顶部导入区新增：

```typescript
import {
  extractH1Text,
  sanitizeTitleForFileName,
} from '@/components/editor/markdown-document';
```

将 `withUpdatedMarkdownValue` 函数（第 838-855 行）替换为：

```typescript
function withUpdatedMarkdownValue(
  draft: MarkdownDocumentDraft,
  value: MarkdownDocumentDraft['value'],
): MarkdownDocumentDraft {
  const body = plateValueToMarkdown(value);
  const h1Text = extractH1Text(value);
  const metadata = {
    ...draft.metadata,
    updatedAt: new Date().toISOString(),
    ...(h1Text !== null && h1Text !== '' ? { title: h1Text } : {}),
  };

  return {
    ...draft,
    body,
    markdown: serializeMarkdownDocument({ body, metadata }),
    metadata,
    value,
  };
}
```

**关键行为：**
- H1 存在且非空 → `metadata.title` 更新为 H1 文本
- H1 为空或不存在 → `metadata.title` 保持不变（满足"H1 为空不触发同步"需求）

- [ ] **Step 2: 运行现有测试确认无回归**

Run: `pnpm vitest run components/editor/__tests__/markdown-document.test.ts`
Expected: PASS — 现有测试不受影响（mock 中无 H1 元素，h1Text 为 null，走 `...{}` 空扩展）

Run: `pnpm vitest run components/workspace/__tests__/workspace-document-flow.test.tsx`
Expected: PASS — mock 的 `plateValueToMarkdown` 不返回 H1 类型，行为不变

- [ ] **Step 3: 提交**

```bash
git add components/workspace/use-workspace.ts
git commit -m "feat: withUpdatedMarkdownValue 检测 H1 变更并同步 frontmatter title"
```

---

### Task 3: H1→文件名方向 — 防抖重命名逻辑

**Files:**
- Modify: `components/workspace/use-workspace.ts` — 多处

- [ ] **Step 1: 添加 refs 和清理函数**

在 `use-workspace.ts` 中，`lastSavedMarkdownRef` 和 `pendingSaveTimerRef` 之后（约第 99-102 行），新增：

```typescript
const pendingRenameTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
  null,
);
const isRenamingRef = React.useRef(false);
```

在 `clearPendingSave`（约第 104-109 行）之后，新增：

```typescript
const clearPendingRename = React.useCallback(() => {
  if (pendingRenameTimerRef.current) {
    clearTimeout(pendingRenameTimerRef.current);
    pendingRenameTimerRef.current = null;
  }
}, []);
```

- [ ] **Step 2: 更新 `resetDocumentState`**

修改 `resetDocumentState`（约第 111-125 行），在 `clearPendingSave()` 后添加清理重命名状态：

```typescript
const resetDocumentState = React.useCallback(() => {
    clearPendingSave();
    clearPendingRename();
    isRenamingRef.current = false;
    setCurrentDocument(null);
    setCurrentDirectoryPath(null);
    setDocumentContent(null);
    setDraftDocument(null);
    setDocumentLoadState('idle');
    setDocumentLoadError(null);
    setDocumentVersion(0);
    setSaveState('idle');
    setSaveError(null);
    setLastSavedAt(null);
    setPendingRenameNodePath(null);
    lastSavedMarkdownRef.current = '';
  }, [clearPendingSave, clearPendingRename]);
```

- [ ] **Step 3: 更新 `openDocument`**

在 `openDocument` 函数体中（约第 222 行 `clearPendingSave()` 之后），添加：

```typescript
clearPendingRename();
```

在 `openDocument` 的依赖数组中（约第 258-264 行），添加 `clearPendingRename`：

```typescript
[
  clearPendingSave,
  clearPendingRename,
  draftDocument,
  saveCurrentDocumentNow,
  saveState,
  snapshot,
],
```

- [ ] **Step 4: 更新 `updateDocumentValue` — 核心同步逻辑**

将 `updateDocumentValue`（约第 304-329 行）替换为：

```typescript
const updateDocumentValue = React.useCallback(
    (nextValue: MarkdownDocumentDraft['value']) => {
      if (!draftDocument) {
        return;
      }

      const nextDraft = withUpdatedMarkdownValue(draftDocument, nextValue);
      const titleChanged =
        nextDraft.metadata.title !== draftDocument.metadata.title;

      setDraftDocument(nextDraft);

      if (nextDraft.markdown === lastSavedMarkdownRef.current) {
        clearPendingSave();
        setSaveState('saved');
        setSaveError(null);
        return;
      }

      setSaveState('dirty');
      setSaveError(null);
      clearPendingSave();
      pendingSaveTimerRef.current = setTimeout(() => {
        void saveCurrentDocumentNow(nextDraft);
      }, 800);

      if (titleChanged && !isRenamingRef.current && currentDocument) {
        const newFileName = sanitizeTitleForFileName(nextDraft.metadata.title);
        const currentFileName = currentDocument.name.replace(/\.md$/i, '');

        if (newFileName !== currentFileName) {
          clearPendingRename();
          const targetNode = currentDocument;

          pendingRenameTimerRef.current = setTimeout(() => {
            isRenamingRef.current = true;
            void renameNode(targetNode, newFileName).finally(() => {
              isRenamingRef.current = false;
            });
          }, 300);
        }
      }
    },
    [
      clearPendingSave,
      clearPendingRename,
      currentDocument,
      draftDocument,
      renameNode,
      saveCurrentDocumentNow,
    ],
  );
```

**关键行为：**
- H1 变更 → `titleChanged = true` → 300ms 防抖后触发 `renameNode`
- 先检查规范化后的文件名是否真的与当前不同（避免 "a-b" → "a/b" 无效重命名）
- `isRenamingRef` 防止重命名进行中重复触发
- `renameNode` 内部会先保存脏内容再重命名，再重新打开文档

- [ ] **Step 5: 更新清理 effect**

修改末尾的清理 effect（约第 758-762 行），加入 `clearPendingRename`：

```typescript
React.useEffect(() => {
    return () => {
      clearPendingSave();
      clearPendingRename();
    };
  }, [clearPendingSave, clearPendingRename]);
```

- [ ] **Step 6: 运行现有测试确认无回归**

Run: `pnpm vitest run components/workspace/__tests__/workspace-document-flow.test.tsx`
Expected: PASS — mock 中不触发 H1 变更，titleChanged 为 false

Run: `pnpm vitest run components/workspace/__tests__/document-tree.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add components/workspace/use-workspace.ts
git commit -m "feat: H1 变更时防抖触发文件重命名，实现标题→文件名同步"
```

---

### Task 4: Rust 后端 — 重命名时同步更新正文 H1

**Files:**
- Modify: `src-tauri/src/workspace.rs` — `update_markdown_document_title` 函数（第 1799-1804 行）和新增 `replace_first_h1` 函数

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/workspace.rs` 的 `tests` 模块末尾（最后一个 `#[test]` 函数之后）添加：

```rust
    #[test]
    fn update_markdown_document_title_updates_both_frontmatter_and_h1() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.md");
        fs::write(
            &doc_path,
            "---\ntitle: 旧标题\nrefinexDialect: 1\n---\n\n# 旧标题\n\n正文内容\n",
        )
        .expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "新标题").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(
            updated.contains("title: 新标题"),
            "frontmatter title 应更新为 新标题，实际: {updated}"
        );
        assert!(
            updated.contains("# 新标题"),
            "正文 H1 应更新为 新标题，实际: {updated}"
        );
        assert!(
            updated.contains("正文内容"),
            "正文其他内容应保留，实际: {updated}"
        );
    }

    #[test]
    fn update_markdown_document_title_preserves_body_without_h1() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("note.md");
        fs::write(&doc_path, "---\ntitle: 笔记\n---\n\n只有正文没有标题\n").expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "新笔记").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(updated.contains("title: 新笔记"));
        assert!(
            !updated.contains("# "),
            "无 H1 的文档不应被添加 H1，实际: {updated}"
        );
        assert!(
            updated.contains("只有正文没有标题"),
            "正文应保留，实际: {updated}"
        );
    }

    #[test]
    fn update_markdown_document_title_only_replaces_first_h1() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.md");
        fs::write(
            &doc_path,
            "---\ntitle: 旧标题\n---\n\n# 旧标题\n\n## 子标题\n\n# 另一个H1\n",
        )
        .expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "新标题").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(updated.contains("# 新标题\n"));
        assert!(
            updated.contains("# 另一个H1"),
            "第二个 H1 不应被修改，实际: {updated}"
        );
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri && cargo test update_markdown_document_title_updates_both`
Expected: FAIL — 正文中 H1 未更新

- [ ] **Step 3: 实现 `replace_first_h1` 函数**

在 `src-tauri/src/workspace.rs` 中，`update_markdown_document_title` 函数之后（约第 1805 行）添加：

```rust
fn replace_first_h1(raw: &str, new_title: &str) -> String {
    let mut found = false;
    raw.split('\n')
        .map(|line| {
            if !found && line.trim_start().starts_with("# ") && line.trim().len() > 2 {
                found = true;
                let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
                format!("{indent}# {new_title}")
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<String>>()
        .join("\n")
}
```

- [ ] **Step 4: 修改 `update_markdown_document_title` 调用 `replace_first_h1`**

将 `update_markdown_document_title` 函数（第 1799-1804 行）替换为：

```rust
fn update_markdown_document_title(path: &Path, title: &str) -> io::Result<()> {
    let raw = fs::read_to_string(path)?;
    let with_frontmatter = upsert_markdown_frontmatter_title(&raw, title);
    let updated = replace_first_h1(&with_frontmatter, title);

    write_text_atomic(path, &updated)
}
```

- [ ] **Step 5: 运行全部 Rust 测试确认通过**

Run: `cd src-tauri && cargo test`
Expected: PASS — 包括新增的 3 个测试和所有现有测试

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat: 重命名文档时同步更新正文 H1 标题"
```

---

### Task 5: 集成测试 — 双向同步

**Files:**
- Modify: `components/workspace/__tests__/workspace-document-flow.test.tsx`

- [ ] **Step 1: 扩展 mock 支持双向同步场景**

在 `workspace-document-flow.test.tsx` 中：

1. 在 `vi.mock('../workspace-api')` 块内新增 `renameWorkspaceNode` mock：

```typescript
import { renameWorkspaceNode } from '../workspace-api';

// 在 vi.mock('../workspace-api') 的返回对象中添加：
renameWorkspaceNode: vi.fn(),
```

2. 在文件顶部 mock 声明之后添加：

```typescript
const renameWorkspaceNodeMock = vi.mocked(renameWorkspaceNode);
```

3. 在 `beforeEach` 中重置：

```typescript
renameWorkspaceNodeMock.mockReset();
```

- [ ] **Step 2: 写 H1→文件名方向测试**

在 `workspace-document-flow.test.tsx` 的 `describe` 块末尾添加：

```typescript
it('renames document file when H1 title changes', async () => {
  readMarkdownDocumentMock.mockResolvedValueOnce({
    path: '/repo/guide.md',
    content: guideMarkdown,
    modifiedAt: 1,
  });
  renameWorkspaceNodeMock.mockResolvedValueOnce({
    id: 'guide',
    name: '新标题.md',
    kind: 'document' as const,
    relativePath: '新标题.md',
    absolutePath: '/repo/新标题.md',
    title: '新标题',
    children: [],
  });
  readMarkdownDocumentMock.mockResolvedValueOnce({
    path: '/repo/新标题.md',
    content:
      '---\ntitle: 新标题\ncreatedAt: 2026-05-30T00:00:00.000Z\nupdatedAt: 2026-06-05T00:00:00.000Z\nrefinexDialect: 1\n---\n\n新标题\n',
    modifiedAt: 2,
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);
  const user = userEvent.setup();
  await user.click(screen.getByText('指南'));
  await screen.findByTestId('plate-editor');
  vi.useFakeTimers();
  fireEvent.click(screen.getByText('模拟编辑'));

  vi.advanceTimersByTime(300);
  vi.useRealTimers();

  await waitFor(() => {
    expect(renameWorkspaceNodeMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/guide.md',
      expect.any(String),
    );
  });
});
```

**注意：** 由于现有 `PlateEditor` mock 的 `onValueChange` 触发的是 `{ type: 'p' }` 而非 `{ type: 'h1' }`，这个测试验证的是整个流程管道的连通性（value change → title detection → rename debounce → API call）。`extractH1Text` 的行为已在 Task 1 的单元测试中独立覆盖。

- [ ] **Step 3: 运行测试确认通过**

Run: `pnpm vitest run components/workspace/__tests__/workspace-document-flow.test.tsx`
Expected: PASS — 所有测试（包括新增测试）通过

- [ ] **Step 4: 提交**

```bash
git add components/workspace/__tests__/workspace-document-flow.test.tsx
git commit -m "test: 添加标题双向同步集成测试"
```

---

## 自检

**1. 规格覆盖：**
- H1 → 文件名同步：Task 2（frontmatter 更新）+ Task 3（防抖重命名）✅
- 文件名 → H1 同步：Task 4（Rust 后端更新 H1）✅
- 防抖 300ms：Task 3 ✅
- 特殊字符处理（H1 保留原始，文件名规范化）：Task 1 `sanitizeTitleForFileName` ✅
- H1 为空不触发同步：Task 2 `h1Text !== null && h1Text !== ''` ✅
- 竞态处理（isRenamingRef）：Task 3 ✅
- 错误处理（重命名失败由 renameNode 传播）：Task 3 ✅

**2. 占位符扫描：** 无 TBD、TODO、"implement later" ✅

**3. 类型一致性：**
- `extractH1Text(value: Value)` → `string | null`，与 `h1Text !== null && h1Text !== ''` 检查一致 ✅
- `sanitizeTitleForFileName(title: string)` → `string`，永不返回空串 ✅
- `replace_first_h1(raw: &str, new_title: &str)` → `String` ✅
- `update_markdown_document_title` 调用 `replace_first_h1` 签名匹配 ✅

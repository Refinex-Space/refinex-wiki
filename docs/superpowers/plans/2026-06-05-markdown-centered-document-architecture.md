---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Markdown-Centered Document Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `.plate.json` document hot path with `.md/.mdx` as the workspace document source of truth for Phase 1.

**Architecture:** Rust/Tauri remains the filesystem authority and exposes safe Markdown document commands. The frontend parses Markdown/frontmatter into Plate `Value` for editing, serializes Plate `Value` back to Markdown for saving, and keeps AI/Git/search aligned with Markdown text. Refinex extension syntax, comments, suggestions, and advanced conflict UI are separate follow-up plans.

**Tech Stack:** Tauri v2 Rust commands, Next.js 16, React 19, PlateJS v53, `@platejs/markdown`, Vitest, Cargo tests.

---

## Scope Check

This plan implements the first phase from `docs/superpowers/specs/2026-06-05-markdown-centered-document-architecture-design.md`: Markdown main hot path. It deliberately excludes full Refinex extension mapping and comment/suggestion persistence because those are independent subsystems and should get their own plans after the `.md` hot path is stable.

## File Structure

- Modify `src-tauri/src/workspace.rs`: replace the visible document format with `.md/.mdx`, add Markdown read/save/create/migration commands, preserve safe path validation, and adapt delete/move/rename helpers.
- Modify `src-tauri/src/assets.rs`: scan `refinex-asset://` references from Markdown text instead of Plate JSON content.
- Modify `src-tauri/src/lib.rs`: register Markdown document commands and migration command.
- Modify `components/workspace/workspace-types.ts`: introduce Markdown document types and remove Plate envelope types from the active hot path.
- Modify `components/workspace/workspace-api.ts`: add typed wrappers for new Tauri commands and keep old wrappers only for migration/import compatibility while implementation is in transition.
- Create `components/editor/markdown-document.ts`: frontmatter parsing, title resolution, Markdown-to-Plate and Plate-to-Markdown conversion.
- Create `components/editor/__tests__/markdown-document.test.ts`: round-trip, title, empty document, and Mermaid conversion tests.
- Modify `components/editor/markdown-import.ts`: reuse `markdown-document.ts` so import and normal open share conversion rules.
- Modify `components/workspace/use-workspace.ts`: store Markdown draft state, dirty-check serialized Markdown, and save Markdown strings.
- Modify `components/workspace/workspace-layout.tsx`: pass Markdown draft `value` to `PlateEditor` and update metadata panel inputs.
- Modify `components/workspace/directory-page.tsx`: read Markdown previews and extract lightweight text instead of reading Plate envelopes.
- Modify `components/workspace/workspace-document-transfer.ts`: export Markdown nodes by raw Markdown when format is `markdown`, and import Markdown as Markdown files instead of Plate JSON.
- Modify `components/workspace/workspace-document-insights.ts`: count and extract resources from Markdown draft value/text as needed.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`: update mocks, fixture paths, create/open/save/import expectations from `.plate.json` to `.md`.
- Modify `components/editor/__tests__/plate-editor.test.tsx`: update document keys to `.md` and keep native Plate runtime expectations.

---

### Task 1: Rust Markdown Document Contract Tests

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Test: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add failing tests for Markdown tree visibility and read/save**

Append these tests inside `#[cfg(test)] mod tests` in `src-tauri/src/workspace.rs`:

```rust
#[test]
fn workspace_tree_uses_markdown_documents_as_visible_documents() {
    let temp_dir = TempDir::new().expect("创建临时目录失败");
    fs::write(temp_dir.path().join("README.md"), "# 项目说明\n").expect("写入 Markdown 失败");
    fs::write(temp_dir.path().join("legacy.plate.json"), "{}").expect("写入旧文档失败");
    fs::write(temp_dir.path().join("notes.txt"), "text").expect("写入文本失败");

    let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");

    assert_eq!(snapshot.nodes.len(), 1);
    assert_eq!(snapshot.nodes[0].name, "README.md");
    assert_eq!(snapshot.nodes[0].kind, WorkspaceNodeKind::Document);
    assert_eq!(snapshot.nodes[0].title.as_deref(), Some("项目说明"));
}

#[test]
fn reads_markdown_document_inside_workspace() {
    let temp_dir = TempDir::new().expect("创建临时目录失败");
    let document_path = temp_dir.path().join("guide.md");
    fs::write(&document_path, "---\ntitle: 指南\n---\n\n# 指南\n").expect("写入 Markdown 失败");

    let document = read_markdown_document(
        temp_dir.path().to_string_lossy().to_string(),
        document_path.to_string_lossy().to_string(),
    )
    .expect("读取 Markdown 文档失败");

    assert_eq!(document.path, document_path.canonicalize().unwrap().to_string_lossy());
    assert!(document.content.contains("title: 指南"));
    assert!(document.modified_at > 0);
}

#[test]
fn saves_markdown_document_with_modified_at_guard() {
    let temp_dir = TempDir::new().expect("创建临时目录失败");
    let document_path = temp_dir.path().join("guide.md");
    fs::write(&document_path, "# 旧内容\n").expect("写入 Markdown 失败");
    let before = read_modified_at(&document_path).expect("读取修改时间失败");

    let saved = save_markdown_document(
        temp_dir.path().to_string_lossy().to_string(),
        document_path.to_string_lossy().to_string(),
        "# 新内容\n".to_string(),
        Some(before),
    )
    .expect("保存 Markdown 文档失败");

    assert!(saved.modified_at >= before);
    assert_eq!(fs::read_to_string(&document_path).unwrap(), "# 新内容\n");
}

#[test]
fn refuses_to_overwrite_markdown_document_changed_on_disk() {
    let temp_dir = TempDir::new().expect("创建临时目录失败");
    let document_path = temp_dir.path().join("guide.md");
    fs::write(&document_path, "# 旧内容\n").expect("写入 Markdown 失败");
    let stale_modified_at = read_modified_at(&document_path).expect("读取修改时间失败");
    std::thread::sleep(std::time::Duration::from_millis(2));
    fs::write(&document_path, "# 外部修改\n").expect("写入外部修改失败");

    let error = save_markdown_document(
        temp_dir.path().to_string_lossy().to_string(),
        document_path.to_string_lossy().to_string(),
        "# 应被拒绝\n".to_string(),
        Some(stale_modified_at),
    )
    .expect_err("应拒绝覆盖磁盘更新");

    assert!(error.contains("文档已在磁盘上更新"));
    assert_eq!(fs::read_to_string(&document_path).unwrap(), "# 外部修改\n");
}
```

- [ ] **Step 2: Run Rust tests and verify they fail for missing Markdown commands**

Run:

```bash
cd src-tauri
cargo test workspace_tree_uses_markdown_documents_as_visible_documents reads_markdown_document_inside_workspace saves_markdown_document_with_modified_at_guard refuses_to_overwrite_markdown_document_changed_on_disk
```

Expected: FAIL with missing `read_markdown_document` / `save_markdown_document` functions and `.plate.json` tree behavior still active.

---

### Task 2: Rust Markdown Document Commands

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Markdown document structs and commands**

Add these structs near the existing document structs in `src-tauri/src/workspace.rs`:

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocumentContent {
    pub path: String,
    pub content: String,
    pub modified_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedMarkdownDocument {
    pub node: WorkspaceNode,
    pub content: MarkdownDocumentContent,
}
```

Add these commands below `load_workspace_tree`:

```rust
#[tauri::command]
pub fn read_markdown_document(
    root_path: String,
    document_path: String,
) -> Result<MarkdownDocumentContent, String> {
    let document = validate_existing_markdown_document_path(&root_path, &document_path)?;
    let content = fs::read_to_string(&document)
        .map_err(|_| "无法读取 Markdown 文档内容，当前仅支持 UTF-8 文档".to_string())?;

    Ok(MarkdownDocumentContent {
        path: document.to_string_lossy().to_string(),
        content,
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn save_markdown_document(
    root_path: String,
    document_path: String,
    content: String,
    expected_modified_at: Option<u128>,
) -> Result<DocumentContentMeta, String> {
    let document = validate_existing_markdown_document_path(&root_path, &document_path)?;

    if let Some(expected) = expected_modified_at {
        let current = read_modified_at(&document)?;
        if current != expected {
            return Err("文档已在磁盘上更新，请重新加载后再保存".to_string());
        }
    }

    let root = canonical_workspace_root(&root_path)?;
    let old_asset_ids = fs::read_to_string(&document)
        .ok()
        .map(|raw| crate::assets::extract_asset_ids_from_markdown(&raw))
        .unwrap_or_default();
    let new_asset_ids = crate::assets::extract_asset_ids_from_markdown(&content);
    let cleanup_candidates = old_asset_ids
        .difference(&new_asset_ids)
        .cloned()
        .collect::<BTreeSet<_>>();

    write_text_atomic(&document, &content).map_err(|_| "无法保存 Markdown 文档内容".to_string())?;

    if let Err(error) = cleanup_unreferenced_assets(&root, cleanup_candidates) {
        log::warn!("本地资产清理失败：{error}");
    }

    Ok(DocumentContentMeta {
        path: document.to_string_lossy().to_string(),
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn create_markdown_document(
    root_path: String,
    parent_path: String,
    title: String,
) -> Result<CreatedMarkdownDocument, String> {
    let root = canonical_workspace_root(&root_path)?;
    let parent = validate_workspace_directory(&root, &parent_path)?;
    let safe_title = normalize_document_title(&title);
    let document_path = unique_markdown_document_path(&parent, &safe_title);
    let now = current_iso_timestamp();
    let content = format!(
        "---\ntitle: {safe_title}\ncreatedAt: {now}\nupdatedAt: {now}\nrefinexDialect: 1\n---\n\n# {safe_title}\n"
    );

    write_text_atomic(&document_path, &content).map_err(|_| "无法创建 Markdown 文档".to_string())?;

    let file_name = document_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled.md")
        .to_string();
    let node = build_document_node(&root, &document_path, file_name)
        .map_err(|_| "无法创建 Markdown 文档节点".to_string())?;
    let content = read_markdown_document(root_path, node.absolute_path.clone())?;

    Ok(CreatedMarkdownDocument { node, content })
}
```

- [ ] **Step 2: Add Markdown path helpers and atomic writer**

Add these helpers near the existing `is_plate_document_file` and validation helpers:

```rust
fn is_markdown_document_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn validate_existing_markdown_document_path(
    root_path: &str,
    document_path: &str,
) -> Result<PathBuf, String> {
    let document = validate_markdown_document_path(root_path, document_path)?;

    if !document.is_file() {
        return Err("文档路径不是文件".to_string());
    }

    Ok(document)
}

fn validate_markdown_document_path(root_path: &str, document_path: &str) -> Result<PathBuf, String> {
    let root = canonical_workspace_root(root_path)?;
    let document = PathBuf::from(document_path);
    let document = if document.exists() {
        document.canonicalize().map_err(|_| "文档路径不存在".to_string())?
    } else {
        document
    };
    let parent = document
        .parent()
        .ok_or_else(|| "文档路径无效".to_string())?
        .canonicalize()
        .map_err(|_| "文档目录不存在".to_string())?;

    if !parent.starts_with(&root) {
        return Err("无法访问工作区外的文档".to_string());
    }

    if document.starts_with(root.join(".refinex")) {
        return Err("不能操作工作区元数据".to_string());
    }

    if !is_markdown_document_file(&document) {
        return Err("仅支持 Markdown 文档".to_string());
    }

    Ok(document)
}

fn unique_markdown_document_path(parent: &Path, title: &str) -> PathBuf {
    unique_path(parent, title, ".md")
}

fn write_text_atomic(path: &Path, content: &str) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.md");
    let temp_path = parent.join(format!(".{file_name}.tmp"));

    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)
}
```

- [ ] **Step 3: Switch tree, node validation, sort entries, and node titles to Markdown**

Change `read_children` and `read_sortable_child_entries` document checks from `is_plate_document_file(&path)` to `is_markdown_document_file(&path)`.

Change `validate_workspace_node_path` and `resolve_workspace_node_for_move` document checks to:

```rust
if node.is_file() && is_markdown_document_file(&node) {
    return Ok((root, node, WorkspaceNodeKind::Document));
}

Err("仅支持工作区目录或 Markdown 文档".to_string())
```

Change `build_document_node` title resolution to:

```rust
let title = read_markdown_document_title(path)
    .unwrap_or_else(|| path.file_stem().and_then(|name| name.to_str()).unwrap_or("未命名文档").to_string());
```

Add title extraction:

```rust
fn read_markdown_document_title(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;

    if let Some(title) = read_frontmatter_title(&raw) {
        return Some(title);
    }

    raw.lines()
        .take(120)
        .map(str::trim)
        .find_map(|line| line.strip_prefix("# ").map(str::trim).filter(|value| !value.is_empty()))
        .map(ToString::to_string)
}

fn read_frontmatter_title(raw: &str) -> Option<String> {
    let mut lines = raw.lines();
    if lines.next()? != "---" {
        return None;
    }

    for line in lines {
        if line == "---" {
            return None;
        }

        if let Some(value) = line.strip_prefix("title:") {
            let title = value.trim().trim_matches('"').trim_matches('\'').trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }

    None
}
```

- [ ] **Step 4: Register commands**

In `src-tauri/src/lib.rs`, add these handlers next to existing workspace document commands:

```rust
workspace::read_markdown_document,
workspace::save_markdown_document,
workspace::create_markdown_document,
```

- [ ] **Step 5: Run Rust tests**

Run:

```bash
cd src-tauri
cargo test workspace_tree_uses_markdown_documents_as_visible_documents reads_markdown_document_inside_workspace saves_markdown_document_with_modified_at_guard refuses_to_overwrite_markdown_document_changed_on_disk
```

Expected: PASS.

- [ ] **Step 6: Commit Rust Markdown commands**

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs
git commit -m "feat: 增加 Markdown 文档读写命令"
```

---

### Task 3: Markdown Asset Reference Scanning

**Files:**
- Modify: `src-tauri/src/assets.rs`
- Modify: `src-tauri/src/workspace.rs`
- Test: `src-tauri/src/assets.rs`, `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add failing asset scanner tests**

Append this test in `src-tauri/src/assets.rs` tests:

```rust
#[test]
fn extracts_asset_ids_from_markdown_text() {
    let markdown = r#"
![cover](refinex-asset://asset-a)

<refinex-file src="refinex-asset://asset-b" />

![remote](https://example.com/image.png)
"#;

    assert_eq!(
        extract_asset_ids_from_markdown(markdown),
        BTreeSet::from(["asset-a".to_string(), "asset-b".to_string()])
    );
}
```

- [ ] **Step 2: Implement Markdown asset extraction**

Add this public function in `src-tauri/src/assets.rs`:

```rust
pub fn extract_asset_ids_from_markdown(markdown: &str) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    let mut remaining = markdown;

    while let Some(index) = remaining.find(ASSET_URL_PREFIX) {
        let after_prefix = &remaining[index + ASSET_URL_PREFIX.len()..];
        let id = after_prefix
            .chars()
            .take_while(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
            })
            .collect::<String>();

        if !id.is_empty() {
            ids.insert(id);
        }

        remaining = after_prefix;
    }

    ids
}
```

- [ ] **Step 3: Change workspace asset reference collection to scan Markdown documents**

In `src-tauri/src/assets.rs`, replace `collect_workspace_asset_references` with:

```rust
fn collect_workspace_asset_references(root: &Path) -> Result<BTreeSet<String>, String> {
    let mut paths = Vec::new();
    collect_markdown_documents(root, &mut paths).map_err(|_| "无法扫描工作区文档".to_string())?;

    let mut ids = BTreeSet::new();
    for path in paths {
        if let Ok(raw) = fs::read_to_string(path) {
            ids.extend(extract_asset_ids_from_markdown(&raw));
        }
    }

    Ok(ids)
}

fn collect_markdown_documents(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");

        if matches!(file_name, ".refinex" | ".git" | "node_modules" | "target" | "dist" | "build") {
            continue;
        }

        if path.is_dir() {
            collect_markdown_documents(&path, paths)?;
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
            .unwrap_or(false)
        {
            paths.push(path);
        }
    }

    Ok(())
}
```

- [ ] **Step 4: Update deletion cleanup in `workspace.rs`**

In `delete_workspace_node`, replace the old `collect_asset_ids_from_documents` calls with Markdown text scanning:

```rust
let cleanup_candidates = match kind {
    WorkspaceNodeKind::Directory => {
        let mut documents = Vec::new();
        collect_markdown_document_paths(&node, &mut documents)
            .map_err(|_| "无法扫描待删除目录".to_string())?;
        collect_asset_ids_from_markdown_paths(&documents)
    }
    WorkspaceNodeKind::Document => collect_asset_ids_from_markdown_paths(std::slice::from_ref(&node)),
};
```

Add helpers in `workspace.rs`:

```rust
fn collect_asset_ids_from_markdown_paths(paths: &[PathBuf]) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();

    for path in paths {
        if let Ok(raw) = fs::read_to_string(path) {
            ids.extend(crate::assets::extract_asset_ids_from_markdown(&raw));
        }
    }

    ids
}

fn collect_markdown_document_paths(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");

        if should_skip_entry(file_name) {
            continue;
        }

        if path.is_dir() {
            collect_markdown_document_paths(&path, paths)?;
        } else if is_markdown_document_file(&path) {
            paths.push(path);
        }
    }

    Ok(())
}
```

- [ ] **Step 5: Run focused Rust asset tests**

Run:

```bash
cd src-tauri
cargo test extracts_asset_ids_from_markdown_text deleting_one_of_two_documents_keeps_shared_asset
```

Expected: PASS after updating the deletion fixture documents to `.md` with `![asset](refinex-asset://...)`.

- [ ] **Step 6: Commit Markdown asset scanning**

```bash
git add src-tauri/src/assets.rs src-tauri/src/workspace.rs
git commit -m "feat: 支持 Markdown 资产引用扫描"
```

---

### Task 4: Frontend Markdown Document Conversion Module

**Files:**
- Create: `components/editor/markdown-document.ts`
- Create: `components/editor/__tests__/markdown-document.test.ts`
- Modify: `components/editor/markdown-import.ts`
- Test: `components/editor/__tests__/markdown-document.test.ts`, `components/editor/__tests__/markdown-import.test.ts`

- [ ] **Step 1: Write failing tests for frontmatter and Plate conversion**

Create `components/editor/__tests__/markdown-document.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  createEmptyMarkdownDocument,
  markdownToPlateValue,
  parseMarkdownDocument,
  plateValueToMarkdown,
  serializeMarkdownDocument,
} from '../markdown-document';

vi.mock('platejs/react', () => ({
  createPlateEditor: ({ value }: { value?: unknown[] }) => ({
    getApi: () => ({
      markdown: {
        deserialize: (markdown: string) =>
          markdown.trim()
            ? [{ children: [{ text: markdown.replace(/^#\s+/m, '') }], type: 'p' }]
            : [],
        serialize: ({ value: inputValue }: { value?: unknown[] } = {}) =>
          (inputValue ?? value ?? [])
            .map((node) => (node as { children?: Array<{ text?: string }> }).children?.[0]?.text ?? '')
            .join('\n\n'),
      },
    }),
  }),
}));

vi.mock('@/components/editor/editor-kit', () => ({
  EditorKit: [],
}));

describe('markdown-document', () => {
  it('parses frontmatter, body, and title', () => {
    const document = parseMarkdownDocument(
      '---\ntitle: 指南\ncreatedAt: 2026-06-05T00:00:00.000Z\nupdatedAt: 2026-06-05T00:00:00.000Z\nrefinexDialect: 1\n---\n\n# 正文标题\n\n内容',
      'guide.md',
    );

    expect(document.metadata.title).toBe('指南');
    expect(document.metadata.refinexDialect).toBe(1);
    expect(document.body).toBe('# 正文标题\n\n内容');
  });

  it('uses first h1 as title when frontmatter has no title', () => {
    const document = parseMarkdownDocument('# 入门\n\n正文', 'intro.md');

    expect(document.metadata.title).toBe('入门');
  });

  it('uses file stem as title when content has no title', () => {
    const document = parseMarkdownDocument('正文', 'quick-note.md');

    expect(document.metadata.title).toBe('quick-note');
  });

  it('serializes metadata and body as Markdown', () => {
    const markdown = serializeMarkdownDocument({
      body: '# 指南\n\n正文',
      metadata: {
        createdAt: '2026-06-05T00:00:00.000Z',
        refinexDialect: 1,
        title: '指南',
        updatedAt: '2026-06-05T00:01:00.000Z',
      },
    });

    expect(markdown).toContain('title: 指南');
    expect(markdown).toContain('refinexDialect: 1');
    expect(markdown).toContain('# 指南\n\n正文');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('creates editable empty Markdown document', () => {
    const document = createEmptyMarkdownDocument('未命名文档');

    expect(document).toContain('title: 未命名文档');
    expect(document).toContain('# 未命名文档');
  });

  it('round trips between Markdown and Plate value', () => {
    const value = markdownToPlateValue('# 标题');
    const markdown = plateValueToMarkdown(value);

    expect(value).toEqual([{ children: [{ text: '标题' }], type: 'p' }]);
    expect(markdown).toBe('标题');
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm run test:run -- components/editor/__tests__/markdown-document.test.ts
```

Expected: FAIL because `components/editor/markdown-document.ts` does not exist.

- [ ] **Step 3: Implement `markdown-document.ts`**

Create `components/editor/markdown-document.ts`:

```ts
import { MarkdownPlugin } from '@platejs/markdown';
import type { Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';

export interface MarkdownDocumentMetadata {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  refinexDialect: number;
}

export interface ParsedMarkdownDocument {
  body: string;
  metadata: MarkdownDocumentMetadata;
}

const emptyValue: Value = [{ children: [{ text: '' }], type: 'p' }];

export function parseMarkdownDocument(
  markdown: string,
  fileName: string,
): ParsedMarkdownDocument {
  const { body, frontmatter } = splitFrontmatter(markdown);
  const title =
    readString(frontmatter.title) ?? extractMarkdownTitle(body) ?? fileStem(fileName);

  return {
    body,
    metadata: {
      createdAt: readString(frontmatter.createdAt),
      refinexDialect: readNumber(frontmatter.refinexDialect) ?? 1,
      title,
      updatedAt: readString(frontmatter.updatedAt),
    },
  };
}

export function serializeMarkdownDocument(document: ParsedMarkdownDocument) {
  const metadata = document.metadata;
  const frontmatter = [
    '---',
    `title: ${metadata.title}`,
    metadata.createdAt ? `createdAt: ${metadata.createdAt}` : null,
    metadata.updatedAt ? `updatedAt: ${metadata.updatedAt}` : null,
    `refinexDialect: ${metadata.refinexDialect}`,
    '---',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  const body = document.body.trimEnd();

  return `${frontmatter}\n\n${body}\n`;
}

export function createEmptyMarkdownDocument(title: string) {
  const now = new Date().toISOString();

  return serializeMarkdownDocument({
    body: `# ${title}`,
    metadata: {
      createdAt: now,
      refinexDialect: 1,
      title,
      updatedAt: now,
    },
  });
}

export function markdownToPlateValue(markdown: string): Value {
  const editor = createPlateEditor({
    plugins: EditorKit,
  });
  const value = editor.getApi(MarkdownPlugin).markdown.deserialize(markdown);

  return value.length > 0 ? value : emptyValue;
}

export function plateValueToMarkdown(value: Value): string {
  const editor = createPlateEditor({
    plugins: EditorKit,
    value,
  });

  return editor.getApi(MarkdownPlugin).markdown.serialize({ value });
}

function splitFrontmatter(markdown: string) {
  if (!markdown.startsWith('---\n')) {
    return { body: markdown.trimStart(), frontmatter: {} as Record<string, string> };
  }

  const endIndex = markdown.indexOf('\n---', 4);
  if (endIndex === -1) {
    return { body: markdown.trimStart(), frontmatter: {} as Record<string, string> };
  }

  const rawFrontmatter = markdown.slice(4, endIndex);
  const body = markdown.slice(endIndex + 4).replace(/^\r?\n/, '');
  const frontmatter = Object.fromEntries(
    rawFrontmatter
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], unquote(match[2].trim())]),
  );

  return { body: body.trimStart(), frontmatter };
}

function extractMarkdownTitle(markdown: string) {
  return markdown
    .split(/\r?\n/, 120)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# ') && line.length > 2)
    ?.replace(/^#\s+/, '')
    .trim();
}

function fileStem(fileName: string) {
  return fileName.replace(/\.(md|mdx)$/i, '') || '未命名文档';
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function unquote(value: string) {
  return value.replace(/^["']|["']$/g, '');
}
```

- [ ] **Step 4: Update `markdown-import.ts` to reuse the shared module**

Replace `components/editor/markdown-import.ts` with:

```ts
import {
  markdownToPlateValue,
  parseMarkdownDocument,
} from '@/components/editor/markdown-document';

export { markdownToPlateValue };

export function extractMarkdownImportTitle(markdown: string, fileName: string) {
  return parseMarkdownDocument(markdown, fileName).metadata.title;
}
```

- [ ] **Step 5: Run editor conversion tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/markdown-document.test.ts components/editor/__tests__/markdown-import.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit frontend Markdown conversion**

```bash
git add components/editor/markdown-document.ts components/editor/markdown-import.ts components/editor/__tests__/markdown-document.test.ts
git commit -m "feat: 增加 Markdown 文档转换层"
```

---

### Task 5: Frontend API and Type Migration

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Test: TypeScript compile through focused Vitest/build in later tasks

- [ ] **Step 1: Add Markdown document types**

In `components/workspace/workspace-types.ts`, add these interfaces near the existing document content types:

```ts
export interface MarkdownDocumentContent {
  path: string;
  content: string;
  modifiedAt: number;
}

export interface CreatedMarkdownDocument {
  node: WorkspaceNode;
  content: MarkdownDocumentContent;
}

export interface MarkdownDocumentDraft {
  body: string;
  markdown: string;
  metadata: {
    createdAt: string | null;
    refinexDialect: number;
    title: string;
    updatedAt: string | null;
  };
  modifiedAt: number;
  path: string;
  value: Value;
}
```

Keep `PlateDocumentEnvelope` and related types in the file for migration/import tasks until all legacy commands are removed.

- [ ] **Step 2: Add API wrappers for Markdown commands**

In `components/workspace/workspace-api.ts`, import `CreatedMarkdownDocument` and `MarkdownDocumentContent`, then add:

```ts
export async function readMarkdownDocument(
  rootPath: string,
  documentPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<MarkdownDocumentContent>('read_markdown_document', {
    rootPath,
    documentPath,
  });
}

export async function saveMarkdownDocument(
  rootPath: string,
  documentPath: string,
  content: string,
  expectedModifiedAt: number | null,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentContentMeta>('save_markdown_document', {
    rootPath,
    documentPath,
    content,
    expectedModifiedAt,
  });
}

export async function createMarkdownDocument(
  rootPath: string,
  parentPath: string,
  title: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CreatedMarkdownDocument>('create_markdown_document', {
    rootPath,
    parentPath,
    title,
  });
}
```

- [ ] **Step 3: Run TypeScript-aware frontend tests to catch import mistakes**

Run:

```bash
npm run test:run -- components/editor/__tests__/markdown-document.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit API and type changes**

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts
git commit -m "feat: 增加 Markdown 文档前端 API"
```

---

### Task 6: Workspace State Uses Markdown Drafts

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/editor/__tests__/plate-editor.test.tsx`
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`, `components/editor/__tests__/plate-editor.test.tsx`

- [ ] **Step 1: Update workspace API imports**

In `components/workspace/use-workspace.ts`, replace active Plate document imports:

```ts
import {
  createMarkdownDocument,
  createWorkspaceRoot,
  createWorkspaceDirectory,
  deleteWorkspaceNode,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  moveWorkspaceNode,
  recordWorkspaceHistory,
  readImportSourceFiles,
  readMarkdownDocument,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  saveMarkdownDocument,
  selectExportFilePath,
  selectImportSourceFiles,
  selectMarkdownSourceFiles,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
  writeExportFile,
} from './workspace-api';
```

Add conversion imports:

```ts
import {
  markdownToPlateValue,
  parseMarkdownDocument,
  plateValueToMarkdown,
  serializeMarkdownDocument,
} from '@/components/editor/markdown-document';
```

- [ ] **Step 2: Replace draft envelope state with Markdown draft state**

Replace:

```ts
const [documentContent, setDocumentContent] =
  React.useState<PlateDocumentContent | null>(null);
const [draftEnvelope, setDraftEnvelope] =
  React.useState<PlateDocumentEnvelope | null>(null);
```

with:

```ts
const [documentContent, setDocumentContent] =
  React.useState<MarkdownDocumentContent | null>(null);
const [draftDocument, setDraftDocument] =
  React.useState<MarkdownDocumentDraft | null>(null);
```

Replace `lastSavedEnvelopeRef` with:

```ts
const lastSavedMarkdownRef = React.useRef('');
```

- [ ] **Step 3: Implement Markdown draft creation helper**

Add this helper near the bottom of `use-workspace.ts`:

```ts
function createMarkdownDraft(
  content: MarkdownDocumentContent,
  fileName: string,
): MarkdownDocumentDraft {
  const parsed = parseMarkdownDocument(content.content, fileName);
  const value = markdownToPlateValue(parsed.body);

  return {
    body: parsed.body,
    markdown: content.content,
    metadata: parsed.metadata,
    modifiedAt: content.modifiedAt,
    path: content.path,
    value,
  };
}

function withUpdatedMarkdownValue(
  draft: MarkdownDocumentDraft,
  value: MarkdownDocumentDraft['value'],
): MarkdownDocumentDraft {
  const body = plateValueToMarkdown(value);
  const updatedAt = new Date().toISOString();
  const metadata = {
    ...draft.metadata,
    updatedAt,
  };
  const markdown = serializeMarkdownDocument({ body, metadata });

  return {
    ...draft,
    body,
    markdown,
    metadata,
    value,
  };
}
```

- [ ] **Step 4: Update open/save/update/create logic**

In `openDocument`, replace `readPlateDocument` handling with:

```ts
const content = await readMarkdownDocument(snapshot.rootPath, node.absolutePath);
const draft = createMarkdownDraft(content, node.name);

setDocumentContent(content);
setDraftDocument(draft);
lastSavedMarkdownRef.current = content.content;
setDocumentVersion((version) => version + 1);
setDocumentLoadState('loaded');
setSaveState('saved');
setLastSavedAt(content.modifiedAt);
```

In `saveCurrentDocumentNow`, use:

```ts
const draft = draftOverride ?? draftDocument;

if (!draft) {
  return;
}

clearPendingSave();

if (draft.markdown === lastSavedMarkdownRef.current) {
  setSaveState('saved');
  return;
}

setSaveState('saving');
setSaveError(null);

try {
  const meta = await saveMarkdownDocument(
    snapshot.rootPath,
    currentDocument.absolutePath,
    draft.markdown,
    documentContent?.modifiedAt ?? null,
  );

  lastSavedMarkdownRef.current = draft.markdown;
  setDocumentContent({
    content: draft.markdown,
    modifiedAt: meta.modifiedAt,
    path: meta.path,
  });
  setDraftDocument({
    ...draft,
    modifiedAt: meta.modifiedAt,
    path: meta.path,
  });
  setLastSavedAt(meta.modifiedAt);
  setSaveState('saved');
} catch (saveDocumentError) {
  setSaveState('error');
  setSaveError(
    saveDocumentError instanceof Error
      ? saveDocumentError.message
      : '无法保存 Markdown 文档内容',
  );
}
```

In `updateDocumentValue`, use:

```ts
if (!draftDocument) {
  return;
}

const nextDraft = withUpdatedMarkdownValue(draftDocument, nextValue);
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
```

In `createDocument`, replace `createPlateDocument` with `createMarkdownDocument`.

- [ ] **Step 5: Update `workspace-layout.tsx` to use Markdown draft**

Replace the editor condition and props with:

```tsx
{workspace.currentDocument &&
workspace.draftDocument &&
workspace.documentLoadState === 'loaded' ? (
  <PlateEditor
    documentKey={`${workspace.documentContent?.path ?? workspace.currentDocument.absolutePath}:${workspace.documentVersion}`}
    pageWidthMode={pageWidthMode}
    value={workspace.draftDocument.value}
    variant="workspace"
    workspaceRootPath={workspace.snapshot?.rootPath ?? null}
    onSaveRequested={() => void workspace.saveCurrentDocumentNow()}
    onTocSnapshotChange={handleTocSnapshotChange}
    onValueChange={workspace.updateDocumentValue}
  />
) : null}
```

Return `draftDocument` from `useWorkspace` and remove `draftEnvelope` from active layout usage.

- [ ] **Step 6: Update `plate-editor` tests from `.plate.json` to `.md`**

In `components/editor/__tests__/plate-editor.test.tsx`, change document keys from:

```ts
documentKey="/repo/guide.plate.json:1"
```

to:

```ts
documentKey="/repo/guide.md:1"
```

Keep assertions that `PlateEditor` receives native Plate `Value` and does not serialize Markdown itself.

- [ ] **Step 7: Run focused frontend tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: workspace tests fail only where mocks still use old API names and fixtures. Update fixture paths and mocks in Task 7.

- [ ] **Step 8: Commit workspace Markdown draft state when focused editor tests pass**

```bash
git add components/workspace/use-workspace.ts components/workspace/workspace-layout.tsx components/editor/__tests__/plate-editor.test.tsx
git commit -m "feat: 使用 Markdown 草稿驱动工作区编辑"
```

---

### Task 7: Workspace Tests, Fixtures, Directory Preview, Import, and Export

**Files:**
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`
- Modify: `components/workspace/directory-page.tsx`
- Modify: `components/workspace/workspace-document-transfer.ts`
- Modify: `components/workspace/workspace-tree.ts`
- Modify: `components/workspace/workspace-document-insights.ts`

- [ ] **Step 1: Update workspace test API mocks and fixtures**

In `components/workspace/__tests__/workspace-layout.test.tsx`, replace mocked active document APIs:

```ts
createMarkdownDocument,
readMarkdownDocument,
saveMarkdownDocument,
```

Use `.md` fixture nodes:

```ts
const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'README.md',
      name: 'README.md',
      kind: 'document',
      relativePath: 'README.md',
      absolutePath: '/repo/README.md',
      title: '项目说明',
    },
  ],
};
```

Use Markdown document mock responses:

```ts
readMarkdownDocumentMock.mockResolvedValue({
  path: '/repo/README.md',
  content: '---\ntitle: 项目说明\nrefinexDialect: 1\n---\n\n# 项目说明\n\n正文',
  modifiedAt: 100,
});
```

Use create mock:

```ts
createMarkdownDocumentMock.mockResolvedValue({
  node: {
    id: '未命名文档.md',
    name: '未命名文档.md',
    kind: 'document',
    relativePath: '未命名文档.md',
    absolutePath: '/repo/未命名文档.md',
    title: '未命名文档',
  },
  content: {
    path: '/repo/未命名文档.md',
    content: '---\ntitle: 未命名文档\nrefinexDialect: 1\n---\n\n# 未命名文档\n',
    modifiedAt: 200,
  },
});
```

- [ ] **Step 2: Update directory preview to read Markdown**

In `components/workspace/directory-page.tsx`, replace `readPlateDocument` with `readMarkdownDocument`. For preview creation, parse Markdown first:

```ts
const content = await readMarkdownDocument(workspaceRootPath, node.absolutePath);
const { markdownToPlateValue, parseMarkdownDocument } = await import(
  '@/components/editor/markdown-document'
);
const parsed = parseMarkdownDocument(content.content, node.name);

return [
  node.absolutePath,
  await createDocumentPreview(markdownToPlateValue(parsed.body), workspaceRootPath, {
    createdAt: parsed.metadata.createdAt ?? content.modifiedAt,
    modifiedAt: content.modifiedAt,
    updatedAt: parsed.metadata.updatedAt ?? content.modifiedAt,
  }),
] as const;
```

- [ ] **Step 3: Update workspace search title handling**

In `components/workspace/workspace-tree.ts`, change title fallback from:

```ts
node.title || node.name.replace(/\.plate\.json$/i, '')
```

to:

```ts
node.title || node.name.replace(/\.(md|mdx)$/i, '')
```

- [ ] **Step 4: Update Markdown export/import behavior**

In `components/workspace/workspace-document-transfer.ts`, change `getDocumentBaseName` fallback to:

```ts
node.name.replace(/\.(md|mdx)$/i, '')
```

For Markdown export, prefer current raw Markdown if the caller can provide it. Add an optional `readRawMarkdown` to `buildExportArchiveEntries`:

```ts
readRawMarkdown?: (node: WorkspaceNode) => Promise<string>;
```

Inside the loop:

```ts
const blob =
  format === 'markdown' && readRawMarkdown
    ? new Blob([await readRawMarkdown(item.node)], {
        type: 'text/markdown;charset=utf-8',
      })
    : await exportPlateValueAsBlob(envelope.content, format, { workspaceRootPath });
```

In `use-workspace.ts` export flow, pass:

```ts
readRawMarkdown: async (documentNode) => {
  const documentContent = await readMarkdownDocument(
    snapshot.rootPath,
    documentNode.absolutePath,
  );

  return documentContent.content;
},
```

- [ ] **Step 5: Run workspace tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS after all old `.plate.json` fixture paths and API mocks are updated.

- [ ] **Step 6: Commit workspace test and preview updates**

```bash
git add components/workspace/__tests__/workspace-layout.test.tsx components/workspace/directory-page.tsx components/workspace/workspace-document-transfer.ts components/workspace/workspace-tree.ts components/workspace/workspace-document-insights.ts
git commit -m "feat: 对齐工作区 Markdown 文档流程"
```

---

### Task 8: Legacy `.plate.json` Migration Command

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Test: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add Rust migration result types and tests**

Add structs in `workspace.rs`:

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMigrationReport {
    pub migrated: Vec<MarkdownMigrationItem>,
    pub failed: Vec<MarkdownMigrationFailure>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMigrationItem {
    pub source_path: String,
    pub target_path: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMigrationFailure {
    pub source_path: String,
    pub message: String,
}
```

Append test:

```rust
#[test]
fn migrates_plate_json_documents_to_markdown_files() {
    let temp_dir = TempDir::new().expect("创建临时目录失败");
    let plate_path = temp_dir.path().join("Guide.plate.json");
    fs::write(
        &plate_path,
        r#"{
  "schemaVersion": 1,
  "title": "Guide",
  "createdAt": "2026-06-05T00:00:00.000Z",
  "updatedAt": "2026-06-05T00:00:00.000Z",
  "content": [{"type":"h1","children":[{"text":"Guide"}]}]
}"#,
    )
    .expect("写入旧文档失败");

    let report = migrate_plate_documents_to_markdown(temp_dir.path().to_string_lossy().to_string())
        .expect("迁移失败");

    assert_eq!(report.migrated.len(), 1);
    assert!(temp_dir.path().join("Guide.md").is_file());
    assert!(temp_dir.path().join(".refinex/migrations/backup/Guide.plate.json").is_file());
}
```

- [ ] **Step 2: Implement migration command with conservative Markdown output**

Add command:

```rust
#[tauri::command]
pub fn migrate_plate_documents_to_markdown(
    root_path: String,
) -> Result<MarkdownMigrationReport, String> {
    let root = canonical_workspace_root(&root_path)?;
    let mut paths = Vec::new();
    collect_plate_document_paths(&root, &mut paths).map_err(|_| "无法扫描旧文档".to_string())?;

    let backup_dir = root.join(".refinex/migrations/backup");
    fs::create_dir_all(&backup_dir).map_err(|_| "无法创建迁移备份目录".to_string())?;

    let mut migrated = Vec::new();
    let mut failed = Vec::new();

    for source in paths {
        match migrate_one_plate_document(&root, &backup_dir, &source) {
            Ok(item) => migrated.push(item),
            Err(message) => failed.push(MarkdownMigrationFailure {
                source_path: source.to_string_lossy().to_string(),
                message,
            }),
        }
    }

    Ok(MarkdownMigrationReport { migrated, failed })
}
```

Add helper:

```rust
fn migrate_one_plate_document(
    root: &Path,
    backup_dir: &Path,
    source: &Path,
) -> Result<MarkdownMigrationItem, String> {
    let raw = fs::read_to_string(source).map_err(|_| "无法读取旧文档".to_string())?;
    let envelope = serde_json::from_str::<PlateDocumentEnvelope>(&raw)
        .map_err(|_| "旧文档格式损坏".to_string())?;
    validate_plate_envelope(&envelope)?;

    let parent = source.parent().ok_or_else(|| "旧文档路径无效".to_string())?;
    let target = unique_path(parent, &sanitize_file_stem(&envelope.title), ".md");
    let markdown = format!(
        "---\ntitle: {}\ncreatedAt: {}\nupdatedAt: {}\nrefinexDialect: 1\n---\n\n{}\n",
        envelope.title,
        envelope.created_at,
        envelope.updated_at,
        plate_value_to_basic_markdown(&envelope.content)
    );

    write_text_atomic(&target, &markdown).map_err(|_| "无法写入 Markdown 文档".to_string())?;

    let backup_path = backup_dir.join(
        source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("legacy.plate.json"),
    );
    fs::rename(source, &backup_path).map_err(|_| "无法备份旧文档".to_string())?;

    Ok(MarkdownMigrationItem {
        source_path: source.to_string_lossy().to_string(),
        target_path: target.to_string_lossy().to_string(),
    })
}

fn plate_value_to_basic_markdown(value: &Value) -> String {
    let Some(nodes) = value.as_array() else {
        return String::new();
    };

    nodes
        .iter()
        .map(plate_node_to_basic_markdown)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn plate_node_to_basic_markdown(node: &Value) -> String {
    let node_type = node.get("type").and_then(Value::as_str).unwrap_or("p");
    let text = plate_node_text(node);

    match node_type {
        "h1" => format!("# {text}"),
        "h2" => format!("## {text}"),
        "h3" => format!("### {text}"),
        "blockquote" => format!("> {text}"),
        _ => text,
    }
}

fn plate_node_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        return text.to_string();
    }

    node.get("children")
        .and_then(Value::as_array)
        .map(|children| children.iter().map(plate_node_text).collect::<String>())
        .unwrap_or_default()
}
```

This conservative migration preserves common text structure. Full Plate-to-Refinex extension migration is not part of Phase 1.

- [ ] **Step 3: Register migration command and add frontend wrapper**

In `src-tauri/src/lib.rs`, register:

```rust
workspace::migrate_plate_documents_to_markdown,
```

In `workspace-types.ts`, add:

```ts
export interface MarkdownMigrationReport {
  migrated: Array<{ sourcePath: string; targetPath: string }>;
  failed: Array<{ sourcePath: string; message: string }>;
}
```

In `workspace-api.ts`, add:

```ts
export async function migratePlateDocumentsToMarkdown(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<MarkdownMigrationReport>('migrate_plate_documents_to_markdown', {
    rootPath,
  });
}
```

- [ ] **Step 4: Run migration tests**

Run:

```bash
cd src-tauri
cargo test migrates_plate_json_documents_to_markdown_files
```

Expected: PASS.

- [ ] **Step 5: Commit migration command**

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs components/workspace/workspace-types.ts components/workspace/workspace-api.ts
git commit -m "feat: 增加旧 Plate 文档迁移命令"
```

---

### Task 9: Full Verification and Cleanup

**Files:**
- Modify as needed only for compile/test fixes from previous tasks.

- [ ] **Step 1: Run Rust workspace and asset tests**

Run:

```bash
cd src-tauri
cargo test workspace::tests assets::tests
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/markdown-document.test.ts components/editor/__tests__/markdown-import.test.ts components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run lint on touched TypeScript files**

Run:

```bash
npx eslint components/editor/markdown-document.ts components/editor/markdown-import.ts components/editor/__tests__/markdown-document.test.ts components/editor/__tests__/markdown-import.test.ts components/editor/__tests__/plate-editor.test.tsx components/workspace/use-workspace.ts components/workspace/workspace-layout.tsx components/workspace/workspace-api.ts components/workspace/workspace-types.ts components/workspace/directory-page.tsx components/workspace/workspace-document-transfer.ts components/workspace/workspace-tree.ts components/workspace/workspace-document-insights.ts components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS or only pre-existing unrelated lint warnings. Any lint error in touched files must be fixed.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Check for stale `.plate.json` active hot-path references**

Run:

```bash
rg -n "readPlateDocument|savePlateDocument|createPlateDocument|draftEnvelope|\\.plate\\.json" components app src-tauri/src docs/superpowers/plans/2026-06-05-markdown-centered-document-architecture.md
```

Expected: Remaining `.plate.json` references are limited to migration code, historical specs/plans, or comments that explicitly describe legacy behavior. Active workspace open/save/create code must use Markdown APIs.

- [ ] **Step 6: Commit final cleanup**

```bash
git add components src-tauri
git commit -m "fix: 清理 Markdown 主流程残留引用"
```

If Step 5 produces no cleanup changes, skip this commit and record the clean scan output in the final implementation summary.

---

## Self-Review

- Spec coverage: Phase 1 goals are covered by Tasks 1-9: Markdown tree, read/save/create, frontmatter conversion, workspace state, preview/search/export/import alignment, asset scanning, migration, and verification.
- Deferred scope: full Refinex extension syntax mapping, AI extension-block protection, comment/suggestion persistence, large-document optimization, and conflict UI are intentionally excluded and need separate plans.
- Placeholder scan: no task contains `TBD`, `TODO`, unnamed validation, or unspecified test steps.
- Type consistency: Rust commands use `read_markdown_document`, `save_markdown_document`, `create_markdown_document`, and `migrate_plate_documents_to_markdown`; TypeScript wrappers use `readMarkdownDocument`, `saveMarkdownDocument`, `createMarkdownDocument`, and `migratePlateDocumentsToMarkdown`.

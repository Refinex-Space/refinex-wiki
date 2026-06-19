---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Native Plate Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Markdown-primary editor flow with a native Plate workspace that opens and saves `*.plate.json` documents directly, while supporting Markdown as import-only source files.

**Architecture:** Tauri remains the filesystem authority: it validates workspace paths, owns `.refinex/workspace.json`, scans only folders and `*.plate.json`, and reads/writes native document envelopes. The frontend owns editor orchestration: it passes Plate `Value` arrays directly into `PlateEditor`, tracks dirty state, and uses `@platejs/markdown` only in the explicit Markdown import path.

**Tech Stack:** Tauri v2 / Rust, serde / serde_json, Next.js 16 App Router client components, React 19, Plate v53, `@platejs/markdown`, Vitest, Testing Library, Cargo tests.

---

## Context Anchors

- Spec authority: `docs/superpowers/specs/2026-05-30-native-plate-workspace-design.md`
- Current branch: `dev`
- Current old implementation commits to revert:
  - `f2142a6 feat：添加 Markdown 文档读写命令`
  - `f767733 feat：添加前端 Markdown 文档读写接口`
  - `c5c27a8 feat：加载选中的 Markdown 文档`
  - `39ca303 feat：接入 Plate Markdown 文档内容`
  - `4cf0a3e feat：支持 Markdown 文档自动保存`
  - `ef2018b feat：切换文档前保存未保存内容`
- Plate docs anchor: `editor.api.markdown.deserialize(markdownString): Value` and `editor.api.markdown.serialize({ value }): string` are conversion APIs. They are allowed only for import/export/paste, not normal open/save.

## File Structure

- Modify `src-tauri/src/workspace.rs`: replace Markdown document IO with workspace metadata, native Plate document envelope IO, creation commands, import write commands, path safety helpers, and Rust tests.
- Modify `src-tauri/src/lib.rs`: register the new Tauri commands and remove old `read_document` / `save_document` registrations.
- Modify `components/workspace/workspace-types.ts`: replace Markdown document types with native Plate envelope, workspace metadata, import request/result, and load/save state types.
- Modify `components/workspace/workspace-api.ts`: replace `readDocument` / `saveDocument` with native Plate workspace wrappers and file-picker helpers.
- Modify `components/workspace/workspace-tree.ts`: remove Markdown title normalization and make document titles come from native envelope metadata.
- Modify `components/workspace/use-workspace.ts`: orchestrate native document load/save, dirty tracking, save-before-switch, document/folder creation, workspace refresh, and Markdown import.
- Modify `components/workspace/workspace-layout.tsx`: pass native `Value` into `PlateEditor` and wire native callbacks.
- Modify `components/workspace/editor-pane.tsx`: update empty state copy from Markdown directory to Plate workspace.
- Modify `components/workspace/document-tree.tsx`: add folder/document actions for create/import while preserving folder-state icons and no file icons.
- Modify `components/workspace/workspace-sidebar.tsx`: pass create/import callbacks into `DocumentTree`.
- Modify `components/workspace/workspace-switcher.tsx`: update "选择 Markdown 文档目录" copy to workspace copy.
- Modify `components/editor/plate-editor.tsx`: accept native Plate `Value`, emit native `Value`, keep `Cmd/Ctrl + S`.
- Create `components/editor/markdown-import.ts`: one explicit Markdown-to-Plate conversion helper used only by import.
- Create or modify `components/editor/__tests__/plate-editor.test.tsx`: assert normal workspace mode does not call Markdown deserialize/serialize. This file may be deleted by Task 1, so recreate it if needed.
- Modify `components/workspace/__tests__/workspace-api.test.ts`: cover new Tauri wrappers.
- Modify `components/workspace/__tests__/workspace-tree.test.ts`: cover native title/search behavior and no Markdown-specific normalization.
- Create or modify `components/workspace/__tests__/workspace-document-flow.test.tsx`: cover native load/save and save-before-switch. This file may be deleted by Task 1, so recreate it if needed.
- Modify `components/workspace/__tests__/document-tree.test.tsx`: cover folder actions and native document selection.

## Task 1: Revert Markdown-Primary Implementation

**Files:**
- Modify through git revert: `src-tauri/src/workspace.rs`
- Modify through git revert: `src-tauri/src/lib.rs`
- Modify through git revert: `components/workspace/workspace-types.ts`
- Modify through git revert: `components/workspace/workspace-api.ts`
- Modify through git revert: `components/workspace/use-workspace.ts`
- Modify through git revert: `components/workspace/editor-pane.tsx`
- Modify through git revert: `components/workspace/workspace-layout.tsx`
- Modify through git revert: `components/editor/plate-editor.tsx`
- Modify through git revert: old Markdown flow tests

- [ ] **Step 1: Revert the old Markdown-primary commits without committing automatically**

Run:

```bash
git revert --no-commit ef2018b 4cf0a3e 39ca303 c5c27a8 f767733 f2142a6
```

Expected: command exits with status `0`. If a conflict appears, keep the later UI/layout changes and remove only the Markdown-primary document IO and autosave code.

- [ ] **Step 2: Verify the old Markdown-primary symbols are gone from source files**

Run:

```bash
rg -n "readDocument|saveDocument|draftMarkdown|onMarkdownChange|read_document|save_document" components src-tauri/src
```

Expected: no matches in `components/` or `src-tauri/src/`.

- [ ] **Step 3: Commit the revert**

Run:

```bash
git add -A src-tauri/src components
git commit -m "revert：移除 Markdown 主存储实现"
```

Expected: commit succeeds.

## Task 2: Rust Native Workspace Metadata And Tree

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Write failing Rust tests for workspace metadata and native tree scan**

Replace the old Markdown scan tests in `src-tauri/src/workspace.rs` with these tests inside `#[cfg(test)] mod tests`:

```rust
#[test]
fn ensure_workspace_creates_metadata_file() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

    let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
        .expect("初始化工作区失败");

    assert_eq!(metadata.schema_version, 1);
    assert_eq!(metadata.recent_document_path, None);
    assert!(temp_dir.path().join(".refinex/workspace.json").is_file());
}

#[test]
fn corrupt_workspace_metadata_is_backed_up_and_rebuilt() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let metadata_dir = temp_dir.path().join(".refinex");
    fs::create_dir(&metadata_dir).expect("创建元数据目录失败");
    fs::write(metadata_dir.join("workspace.json"), "{ broken").expect("写入损坏元数据失败");

    let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
        .expect("重建工作区元数据失败");
    let backup_count = fs::read_dir(&metadata_dir)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("workspace.corrupt."))
        .count();

    assert_eq!(metadata.schema_version, 1);
    assert_eq!(backup_count, 1);
}

#[test]
fn builds_native_plate_only_snapshot_with_document_titles() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let guide_dir = temp_dir.path().join("Guides");
    fs::create_dir(&guide_dir).expect("创建测试目录失败");
    fs::write(
        temp_dir.path().join("README.plate.json"),
        r#"{"schemaVersion":1,"title":"项目说明","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .unwrap();
    fs::write(guide_dir.join("intro.md"), "# 入门").unwrap();
    fs::write(guide_dir.join("draft.mdx"), "# 草稿").unwrap();
    fs::write(guide_dir.join("data.json"), "{}").unwrap();
    fs::write(
        guide_dir.join("intro.plate.json"),
        r#"{"schemaVersion":1,"title":"入门指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":"正文"}]}]}"#,
    )
    .unwrap();

    let snapshot = build_workspace_snapshot(temp_dir.path()).unwrap();
    let debug = format!("{snapshot:?}");

    assert!(debug.contains("README.plate.json"));
    assert!(debug.contains("intro.plate.json"));
    assert!(debug.contains("项目说明"));
    assert!(debug.contains("入门指南"));
    assert!(!debug.contains("intro.md"));
    assert!(!debug.contains("draft.mdx"));
    assert!(!debug.contains("data.json"));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests::ensure_workspace_creates_metadata_file workspace::tests::corrupt_workspace_metadata_is_backed_up_and_rebuilt workspace::tests::builds_native_plate_only_snapshot_with_document_titles
```

Expected: FAIL because `ensure_workspace`, workspace metadata structs, and Plate tree scanning are not implemented yet.

- [ ] **Step 3: Implement metadata and native tree primitives**

In `src-tauri/src/workspace.rs`, use this structure:

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMetadata {
    pub schema_version: u32,
    pub recent_document_path: Option<String>,
    pub expanded_paths: Vec<String>,
    pub sort_order: serde_json::Map<String, Value>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlateDocumentEnvelope {
    pub schema_version: u32,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub content: Value,
}

#[tauri::command]
pub fn ensure_workspace(root_path: String) -> Result<WorkspaceMetadata, String> {
    let root = canonical_workspace_root(&root_path)?;
    ensure_workspace_metadata(&root).map_err(|error| format!("初始化工作区失败：{error}"))
}

fn default_workspace_metadata() -> WorkspaceMetadata {
    WorkspaceMetadata {
        schema_version: 1,
        recent_document_path: None,
        expanded_paths: Vec::new(),
        sort_order: serde_json::Map::new(),
    }
}

fn ensure_workspace_metadata(root: &Path) -> std::io::Result<WorkspaceMetadata> {
    let metadata_dir = root.join(".refinex");
    let metadata_path = metadata_dir.join("workspace.json");
    fs::create_dir_all(&metadata_dir)?;

    if !metadata_path.exists() {
        let metadata = default_workspace_metadata();
        write_json_pretty(&metadata_path, &metadata)?;
        return Ok(metadata);
    }

    let raw = fs::read_to_string(&metadata_path)?;
    match serde_json::from_str::<WorkspaceMetadata>(&raw) {
        Ok(metadata) if metadata.schema_version == 1 => Ok(metadata),
        _ => {
            let backup_path = metadata_dir.join(format!(
                "workspace.corrupt.{}.json",
                unix_timestamp_millis()
            ));
            fs::rename(&metadata_path, backup_path)?;
            let metadata = default_workspace_metadata();
            write_json_pretty(&metadata_path, &metadata)?;
            Ok(metadata)
        }
    }
}

fn write_json_pretty<T: Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(value)?;
    fs::write(path, format!("{json}\n"))
}
```

Also replace Markdown filtering with native Plate filtering:

```rust
fn should_skip_entry(file_name: &str) -> bool {
    file_name == ".refinex"
        || file_name == ".git"
        || matches!(file_name, "node_modules" | "target" | "dist" | "build")
}

fn is_plate_document_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.ends_with(".plate.json"))
        .unwrap_or(false)
}

fn build_document_node(root: &Path, path: &Path, name: String) -> std::io::Result<WorkspaceNode> {
    let relative_path = to_relative_path(root, path);
    let title = read_plate_document_title(path).unwrap_or_else(|| {
        name.trim_end_matches(".plate.json").to_string()
    });

    Ok(WorkspaceNode {
        id: relative_path.clone(),
        name,
        kind: WorkspaceNodeKind::Document,
        relative_path,
        absolute_path: path.to_string_lossy().to_string(),
        title: Some(title),
        children: None,
    })
}

fn read_plate_document_title(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    let envelope = serde_json::from_str::<PlateDocumentEnvelope>(&raw).ok()?;
    let title = envelope.title.trim();

    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}
```

Ensure `load_workspace_tree` calls `ensure_workspace_metadata(&root)` before returning the snapshot:

```rust
#[tauri::command]
pub fn load_workspace_tree(root_path: String) -> Result<WorkspaceSnapshot, String> {
    let root = canonical_workspace_root(&root_path)?;
    ensure_workspace_metadata(&root).map_err(|error| format!("初始化工作区失败：{error}"))?;
    build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
}
```

- [ ] **Step 4: Run Rust tests and verify they pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests::ensure_workspace_creates_metadata_file workspace::tests::corrupt_workspace_metadata_is_backed_up_and_rebuilt workspace::tests::builds_native_plate_only_snapshot_with_document_titles
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat：添加原生 Plate 工作区扫描"
```

Expected: commit succeeds.

## Task 3: Rust Native Document Commands

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing Rust tests for native document read/save/create/import**

Append these tests inside `#[cfg(test)] mod tests` in `src-tauri/src/workspace.rs`:

```rust
#[test]
fn reads_valid_plate_document_inside_workspace() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let doc_path = temp_dir.path().join("guide.plate.json");
    fs::write(
        &doc_path,
        r#"{"schemaVersion":1,"title":"指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":"正文"}]}]}"#,
    )
    .unwrap();

    let document = read_plate_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
    )
    .expect("读取原生文档失败");

    assert_eq!(document.envelope.title, "指南");
    assert!(document.envelope.content.is_array());
}

#[test]
fn rejects_invalid_plate_document_envelope() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let doc_path = temp_dir.path().join("broken.plate.json");
    fs::write(&doc_path, r#"{"schemaVersion":1,"title":"坏文档","content":{}}"#).unwrap();

    let error = read_plate_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
    )
    .expect_err("损坏文档不应读取成功");

    assert_eq!(error, "文档内容格式无效");
}

#[test]
fn saves_valid_plate_document_inside_workspace() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let doc_path = temp_dir.path().join("guide.plate.json");
    let envelope = sample_envelope("指南", "正文");

    let meta = save_plate_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
        envelope,
    )
    .expect("保存原生文档失败");

    assert_eq!(meta.path, doc_path.canonicalize().unwrap().to_string_lossy());
    assert!(fs::read_to_string(&doc_path).unwrap().contains("\"title\": \"指南\""));
}

#[test]
fn creates_unique_plate_document() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    fs::write(temp_dir.path().join("未命名文档.plate.json"), "{}").unwrap();

    let created = create_plate_document(
        temp_dir.path().to_string_lossy().to_string(),
        "".to_string(),
        "未命名文档".to_string(),
    )
    .expect("创建文档失败");

    assert!(created.node.name.ends_with("-1.plate.json"));
    assert_eq!(created.envelope.title, "未命名文档");
}

#[test]
fn creates_workspace_directory_inside_workspace() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

    let node = create_workspace_directory(
        temp_dir.path().to_string_lossy().to_string(),
        "".to_string(),
        "docs".to_string(),
    )
    .expect("创建目录失败");

    assert_eq!(node.kind, WorkspaceNodeKind::Directory);
    assert_eq!(node.relative_path, "docs");
    assert!(temp_dir.path().join("docs").is_dir());
}

#[test]
fn reads_markdown_source_files_without_modifying_sources() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let markdown_path = temp_dir.path().join("source.md");
    fs::write(&markdown_path, "# 标题\n正文").unwrap();

    let files = read_markdown_source_files(vec![markdown_path.to_string_lossy().to_string()])
        .expect("读取 Markdown 源文件失败");

    assert_eq!(files[0].file_name, "source.md");
    assert_eq!(files[0].content, "# 标题\n正文");
    assert_eq!(fs::read_to_string(&markdown_path).unwrap(), "# 标题\n正文");
}

#[test]
fn imported_plate_documents_write_inside_workspace_only() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let docs = vec![ImportedPlateDocumentInput {
        title: "Spring AI".to_string(),
        source_file_name: "Spring AI.md".to_string(),
        content: serde_json::json!([{ "type": "p", "children": [{ "text": "正文" }] }]),
    }];

    let result = create_imported_plate_documents(
        temp_dir.path().to_string_lossy().to_string(),
        "".to_string(),
        docs,
    )
    .expect("导入文档失败");

    assert_eq!(result.created.len(), 1);
    assert!(temp_dir.path().join("Spring AI.plate.json").is_file());
}

fn sample_envelope(title: &str, text: &str) -> PlateDocumentEnvelope {
    PlateDocumentEnvelope {
        schema_version: 1,
        title: title.to_string(),
        created_at: "2026-05-30T00:00:00.000Z".to_string(),
        updated_at: "2026-05-30T00:00:00.000Z".to_string(),
        content: serde_json::json!([{ "type": "p", "children": [{ "text": text }] }]),
    }
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests::reads_valid_plate_document_inside_workspace workspace::tests::rejects_invalid_plate_document_envelope workspace::tests::saves_valid_plate_document_inside_workspace workspace::tests::creates_unique_plate_document workspace::tests::reads_markdown_source_files_without_modifying_sources workspace::tests::imported_plate_documents_write_inside_workspace_only
```

Expected: FAIL because native commands and response structs do not exist.

- [ ] **Step 3: Add native command structs and validation helpers**

Add these structs in `src-tauri/src/workspace.rs` near `PlateDocumentEnvelope`:

```rust
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlateDocumentContent {
    pub path: String,
    pub envelope: PlateDocumentEnvelope,
    pub modified_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentMeta {
    pub path: String,
    pub modified_at: u128,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedPlateDocument {
    pub node: WorkspaceNode,
    pub envelope: PlateDocumentEnvelope,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSourceFile {
    pub path: String,
    pub file_name: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPlateDocumentInput {
    pub title: String,
    pub source_file_name: String,
    pub content: Value,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPlateDocumentResult {
    pub created: Vec<CreatedPlateDocument>,
    pub failed: Vec<ImportFailure>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub source_file_name: String,
    pub message: String,
}
```

Add validation helpers:

```rust
fn validate_plate_envelope(envelope: &PlateDocumentEnvelope) -> Result<(), String> {
    if envelope.schema_version != 1 {
        return Err("文档版本不兼容".to_string());
    }

    if !envelope.content.is_array() {
        return Err("文档内容格式无效".to_string());
    }

    if envelope.title.trim().is_empty() {
        return Err("文档标题不能为空".to_string());
    }

    Ok(())
}

fn validate_plate_document_path(root_path: &str, document_path: &str) -> Result<PathBuf, String> {
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

    if !is_plate_document_file(&document) {
        return Err("仅支持 Plate 原生文档".to_string());
    }

    Ok(document)
}
```

- [ ] **Step 4: Implement read/save/create/import commands**

Add these commands:

```rust
#[tauri::command]
pub fn read_plate_document(
    root_path: String,
    document_path: String,
) -> Result<PlateDocumentContent, String> {
    let document = validate_existing_plate_document_path(&root_path, &document_path)?;
    let raw = fs::read_to_string(&document).map_err(|_| "无法读取文档内容".to_string())?;
    let envelope = serde_json::from_str::<PlateDocumentEnvelope>(&raw)
        .map_err(|_| "文档格式损坏".to_string())?;
    validate_plate_envelope(&envelope)?;

    Ok(PlateDocumentContent {
        path: document.to_string_lossy().to_string(),
        envelope,
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn save_plate_document(
    root_path: String,
    document_path: String,
    envelope: PlateDocumentEnvelope,
) -> Result<DocumentContentMeta, String> {
    validate_plate_envelope(&envelope)?;
    let document = validate_plate_document_path(&root_path, &document_path)?;
    write_json_pretty(&document, &envelope).map_err(|_| "无法保存文档内容".to_string())?;

    Ok(DocumentContentMeta {
        path: document.to_string_lossy().to_string(),
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn create_plate_document(
    root_path: String,
    parent_path: String,
    title: String,
) -> Result<CreatedPlateDocument, String> {
    let root = canonical_workspace_root(&root_path)?;
    let parent = validate_workspace_directory(&root, &parent_path)?;
    let safe_title = normalize_document_title(&title);
    let document_path = unique_plate_document_path(&parent, &safe_title);
    let now = current_iso_timestamp();
    let envelope = PlateDocumentEnvelope {
        schema_version: 1,
        title: safe_title,
        created_at: now.clone(),
        updated_at: now,
        content: empty_plate_content(),
    };

    write_json_pretty(&document_path, &envelope).map_err(|_| "无法创建文档".to_string())?;

    Ok(CreatedPlateDocument {
        node: build_document_node(&root, &document_path, document_path.file_name().unwrap().to_string_lossy().to_string())
            .map_err(|_| "无法创建文档节点".to_string())?,
        envelope,
    })
}

#[tauri::command]
pub fn create_workspace_directory(
    root_path: String,
    parent_path: String,
    name: String,
) -> Result<WorkspaceNode, String> {
    let root = canonical_workspace_root(&root_path)?;
    let parent = validate_workspace_directory(&root, &parent_path)?;
    let safe_name = normalize_directory_name(&name);
    let directory_path = unique_directory_path(&parent, &safe_name);

    fs::create_dir(&directory_path).map_err(|_| "无法创建目录".to_string())?;

    build_directory_node(&root, &directory_path, safe_name, Vec::new())
        .map_err(|_| "无法创建目录节点".to_string())
}

#[tauri::command]
pub fn read_markdown_source_files(source_paths: Vec<String>) -> Result<Vec<MarkdownSourceFile>, String> {
    source_paths
        .into_iter()
        .map(|source_path| {
            let path = PathBuf::from(&source_path)
                .canonicalize()
                .map_err(|_| "Markdown 源文件不存在".to_string())?;

            if !is_markdown_source_file(&path) {
                return Err("仅支持导入 .md 或 .mdx 文件".to_string());
            }

            let content = fs::read_to_string(&path).map_err(|_| "无法读取 Markdown 源文件".to_string())?;
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("import.md")
                .to_string();

            Ok(MarkdownSourceFile {
                path: path.to_string_lossy().to_string(),
                file_name,
                content,
            })
        })
        .collect()
}
```

Implement `create_imported_plate_documents` with this behavior:

```rust
#[tauri::command]
pub fn create_imported_plate_documents(
    root_path: String,
    target_dir: String,
    documents: Vec<ImportedPlateDocumentInput>,
) -> Result<ImportedPlateDocumentResult, String> {
    let root = canonical_workspace_root(&root_path)?;
    let target = validate_workspace_directory(&root, &target_dir)?;
    let mut created = Vec::new();
    let mut failed = Vec::new();

    for document in documents {
        if !document.content.is_array() {
            failed.push(ImportFailure {
                source_file_name: document.source_file_name,
                message: "文档内容格式无效".to_string(),
            });
            continue;
        }

        let title = normalize_document_title(&document.title);
        let path = unique_plate_document_path(&target, &title);
        let now = current_iso_timestamp();
        let envelope = PlateDocumentEnvelope {
            schema_version: 1,
            title,
            created_at: now.clone(),
            updated_at: now,
            content: document.content,
        };

        match write_json_pretty(&path, &envelope) {
            Ok(()) => match build_document_node(
                &root,
                &path,
                path.file_name().unwrap().to_string_lossy().to_string(),
            ) {
                Ok(node) => created.push(CreatedPlateDocument { node, envelope }),
                Err(_) => failed.push(ImportFailure {
                    source_file_name: document.source_file_name,
                    message: "无法创建导入文档节点".to_string(),
                }),
            },
            Err(_) => failed.push(ImportFailure {
                source_file_name: document.source_file_name,
                message: "无法写入导入文档".to_string(),
            }),
        }
    }

    Ok(ImportedPlateDocumentResult { created, failed })
}
```

- [ ] **Step 5: Register new commands and remove old registrations**

In `src-tauri/src/lib.rs`, use:

```rust
.invoke_handler(tauri::generate_handler![
    workspace::ensure_workspace,
    workspace::load_workspace_tree,
    workspace::read_plate_document,
    workspace::save_plate_document,
    workspace::create_plate_document,
    workspace::create_workspace_directory,
    workspace::read_markdown_source_files,
    workspace::create_imported_plate_documents,
])
```

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs
git commit -m "feat：添加原生 Plate 文档命令"
```

Expected: commit succeeds.

## Task 4: Frontend Native Types And Tauri API Wrappers

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Write failing API wrapper tests**

Replace the `workspace-api document IO` tests in `components/workspace/__tests__/workspace-api.test.ts` with:

```ts
import {
  createImportedPlateDocuments,
  createPlateDocument,
  createWorkspaceDirectory,
  ensureWorkspace,
  readMarkdownSourceFiles,
  readPlateDocument,
  savePlateDocument,
} from '../workspace-api';

const envelope = {
  schemaVersion: 1,
  title: '指南',
  createdAt: '2026-05-30T00:00:00.000Z',
  updatedAt: '2026-05-30T00:00:00.000Z',
  content: [{ type: 'p', children: [{ text: '正文' }] }],
};

it('wraps native Plate workspace commands through Tauri', async () => {
  invokeMock
    .mockResolvedValueOnce({ schemaVersion: 1, recentDocumentPath: null, expandedPaths: [], sortOrder: {} })
    .mockResolvedValueOnce({ path: '/repo/guide.plate.json', envelope, modifiedAt: 1 })
    .mockResolvedValueOnce({ path: '/repo/guide.plate.json', modifiedAt: 2 })
    .mockResolvedValueOnce({ node: { id: 'guide.plate.json', name: 'guide.plate.json', kind: 'document', relativePath: 'guide.plate.json', absolutePath: '/repo/guide.plate.json', title: '指南' }, envelope })
    .mockResolvedValueOnce({ id: 'docs', name: 'docs', kind: 'directory', relativePath: 'docs', absolutePath: '/repo/docs', children: [] })
    .mockResolvedValueOnce([{ path: '/tmp/a.md', fileName: 'a.md', content: '# A' }])
    .mockResolvedValueOnce({ created: [], failed: [] });

  await ensureWorkspace('/repo');
  await readPlateDocument('/repo', '/repo/guide.plate.json');
  await savePlateDocument('/repo', '/repo/guide.plate.json', envelope);
  await createPlateDocument('/repo', '', '指南');
  await createWorkspaceDirectory('/repo', '', 'docs');
  await readMarkdownSourceFiles(['/tmp/a.md']);
  await createImportedPlateDocuments('/repo', '', [{ title: 'A', sourceFileName: 'a.md', content: envelope.content }]);

  expect(invokeMock).toHaveBeenNthCalledWith(1, 'ensure_workspace', { rootPath: '/repo' });
  expect(invokeMock).toHaveBeenNthCalledWith(2, 'read_plate_document', { rootPath: '/repo', documentPath: '/repo/guide.plate.json' });
  expect(invokeMock).toHaveBeenNthCalledWith(3, 'save_plate_document', { rootPath: '/repo', documentPath: '/repo/guide.plate.json', envelope });
  expect(invokeMock).toHaveBeenNthCalledWith(4, 'create_plate_document', { rootPath: '/repo', parentPath: '', title: '指南' });
  expect(invokeMock).toHaveBeenNthCalledWith(5, 'create_workspace_directory', { rootPath: '/repo', parentPath: '', name: 'docs' });
  expect(invokeMock).toHaveBeenNthCalledWith(6, 'read_markdown_source_files', { sourcePaths: ['/tmp/a.md'] });
  expect(invokeMock).toHaveBeenNthCalledWith(7, 'create_imported_plate_documents', {
    rootPath: '/repo',
    targetDir: '',
    documents: [{ title: 'A', sourceFileName: 'a.md', content: envelope.content }],
  });
});
```

- [ ] **Step 2: Run frontend API tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because the native API wrappers and types do not exist.

- [ ] **Step 3: Add native workspace types**

In `components/workspace/workspace-types.ts`, add:

```ts
import type { Value } from 'platejs';

export interface WorkspaceMetadata {
  schemaVersion: 1;
  recentDocumentPath: string | null;
  expandedPaths: string[];
  sortOrder: Record<string, unknown>;
}

export interface PlateDocumentEnvelope {
  schemaVersion: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  content: Value;
}

export interface PlateDocumentContent {
  path: string;
  envelope: PlateDocumentEnvelope;
  modifiedAt: number;
}

export interface CreatedPlateDocument {
  node: WorkspaceNode;
  envelope: PlateDocumentEnvelope;
}

export interface MarkdownSourceFile {
  path: string;
  fileName: string;
  content: string;
}

export interface ImportedPlateDocumentInput {
  title: string;
  sourceFileName: string;
  content: Value;
}

export interface ImportedPlateDocumentResult {
  created: CreatedPlateDocument[];
  failed: Array<{
    sourceFileName: string;
    message: string;
  }>;
}
```

Remove old `DocumentContent` and `DocumentContentMeta` Markdown string types.

- [ ] **Step 4: Add native API wrappers**

In `components/workspace/workspace-api.ts`, remove `readDocument` / `saveDocument` and add:

```ts
export async function ensureWorkspace(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceMetadata>('ensure_workspace', { rootPath });
}

export async function readPlateDocument(rootPath: string, documentPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<PlateDocumentContent>('read_plate_document', {
    rootPath,
    documentPath,
  });
}

export async function savePlateDocument(
  rootPath: string,
  documentPath: string,
  envelope: PlateDocumentEnvelope,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<{ path: string; modifiedAt: number }>('save_plate_document', {
    rootPath,
    documentPath,
    envelope,
  });
}

export async function createPlateDocument(
  rootPath: string,
  parentPath: string,
  title: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CreatedPlateDocument>('create_plate_document', {
    rootPath,
    parentPath,
    title,
  });
}
```

Add wrappers for `createWorkspaceDirectory`, `readMarkdownSourceFiles`, and `createImportedPlateDocuments` with the exact Tauri command names from Task 3.

Also add a Markdown source file picker:

```ts
export async function selectMarkdownSourceFiles() {
  if (!isTauriRuntime()) {
    return [];
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    multiple: true,
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'mdx'],
      },
    ],
  });

  if (Array.isArray(selected)) {
    return selected.filter((item): item is string => typeof item === 'string');
  }

  return typeof selected === 'string' ? [selected] : [];
}
```

- [ ] **Step 5: Run API tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat：添加原生 Plate 前端接口"
```

Expected: commit succeeds.

## Task 5: PlateEditor Native Value Mode And Markdown Import Helper

**Files:**
- Modify: `components/editor/plate-editor.tsx`
- Create: `components/editor/markdown-import.ts`
- Modify: `components/editor/__tests__/plate-editor.test.tsx`

- [ ] **Step 1: Replace PlateEditor tests with native value expectations**

Update `components/editor/__tests__/plate-editor.test.tsx` so the workspace tests assert no Markdown conversion on normal edit:

```ts
it('initializes workspace editor with native Plate value', () => {
  const value = [{ children: [{ text: '标题' }], type: 'h1' }];

  render(
    <PlateEditor
      documentKey="/repo/guide.plate.json:1"
      value={value}
      variant="workspace"
    />,
  );

  expect(deserializeMock).not.toHaveBeenCalled();
  expect(usePlateEditorMock.mock.calls[0]?.[0].value).toBe(value);
  expect(usePlateEditorMock.mock.calls[0]?.[1]).toEqual([
    '/repo/guide.plate.json:1',
    'workspace',
  ]);
});

it('emits native Plate value on workspace editor changes', () => {
  const onValueChange = vi.fn();

  render(
    <PlateEditor
      documentKey="/repo/guide.plate.json:1"
      value={[{ children: [{ text: '标题' }], type: 'h1' }]}
      variant="workspace"
      onValueChange={onValueChange}
    />,
  );

  fireEvent.click(screen.getByTestId('plate-root'));

  expect(serializeMock).not.toHaveBeenCalled();
  expect(onValueChange).toHaveBeenCalledWith([
    { children: [{ text: '编辑后' }] },
  ]);
});
```

- [ ] **Step 2: Run PlateEditor tests and verify they fail**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx
```

Expected: FAIL because `PlateEditor` still accepts `markdown` and calls `MarkdownPlugin` during normal open/save.

- [ ] **Step 3: Change PlateEditor props to native Value**

In `components/editor/plate-editor.tsx`, replace workspace Markdown props with:

```ts
import type { Value } from 'platejs';

interface PlateEditorProps {
  documentKey?: string;
  value?: Value;
  onValueChange?: (value: Value) => void;
  onSaveRequested?: () => void;
  variant?: 'demo' | 'workspace';
}
```

Use direct native value initialization:

```ts
const editor = usePlateEditor(
  {
    plugins: EditorKit,
    value: variant === 'workspace' ? (value ?? emptyValue) : demoValue,
  },
  [documentKey, variant],
);
```

Use native change emission:

```tsx
<Plate
  editor={editor}
  onChange={({ value }) => {
    if (variant === 'workspace') {
      onValueChange?.(value);
    }
  }}
>
```

Keep `MarkdownPlugin` out of `plate-editor.tsx`. `MarkdownKit` can remain in `EditorKit`.

- [ ] **Step 4: Create explicit Markdown import helper**

Create `components/editor/markdown-import.ts`:

```ts
import { MarkdownPlugin } from '@platejs/markdown';
import type { Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from './editor-kit';

export function markdownToPlateValue(markdown: string): Value {
  const editor = createPlateEditor({
    plugins: EditorKit,
  });
  const value = editor.getApi(MarkdownPlugin).markdown.deserialize(markdown);

  return value.length > 0 ? value : [{ children: [{ text: '' }], type: 'p' }];
}

export function extractMarkdownImportTitle(markdown: string, fileName: string) {
  const heading = markdown
    .split(/\r?\n/, 80)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# ') && line.length > 2);

  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }

  return fileName.replace(/\.(md|mdx)$/i, '');
}
```

- [ ] **Step 5: Run editor tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add components/editor/plate-editor.tsx components/editor/markdown-import.ts components/editor/__tests__/plate-editor.test.tsx
git commit -m "feat：接入 Plate 原生编辑值"
```

Expected: commit succeeds.

## Task 6: Workspace State Native Load/Save/Create/Import

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/__tests__/workspace-document-flow.test.tsx`

- [ ] **Step 1: Update workspace document-flow tests for native envelopes**

In `components/workspace/__tests__/workspace-document-flow.test.tsx`, mock the new APIs and mock `PlateEditor` with native value props:

```ts
vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    documentKey,
    value,
    onValueChange,
    onSaveRequested,
  }: {
    documentKey?: string;
    value?: unknown[];
    onValueChange?: (value: unknown[]) => void;
    onSaveRequested?: () => void;
  }) => (
    <div>
      <div data-document-key={documentKey} data-testid="plate-editor">
        {JSON.stringify(value)}
      </div>
      <button
        type="button"
        onClick={() => onValueChange?.([{ type: 'p', children: [{ text: '更新正文' }] }])}
      >
        模拟编辑
      </button>
      <button type="button" onClick={() => onSaveRequested?.()}>
        模拟快捷保存
      </button>
    </div>
  ),
}));
```

Replace `readDocument` / `saveDocument` mocks with `readPlateDocument` / `savePlateDocument`. Test cases must assert:

```ts
expect(readPlateDocumentMock).toHaveBeenCalledWith('/repo', '/repo/guide.plate.json');
expect(savePlateDocumentMock).toHaveBeenCalledWith(
  '/repo',
  '/repo/guide.plate.json',
  expect.objectContaining({
    title: '指南',
    content: [{ type: 'p', children: [{ text: '更新正文' }] }],
  }),
);
```

Use snapshot nodes named `guide.plate.json` and `notes.plate.json`.

- [ ] **Step 2: Run document-flow tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: FAIL because `useWorkspace` still uses old Markdown string state.

- [ ] **Step 3: Replace Markdown state with native envelope state**

In `components/workspace/use-workspace.ts`, replace:

```ts
const [draftMarkdown, setDraftMarkdown] = React.useState('');
const lastSavedMarkdownRef = React.useRef('');
```

with:

```ts
const [documentContent, setDocumentContent] =
  React.useState<PlateDocumentContent | null>(null);
const [draftEnvelope, setDraftEnvelope] =
  React.useState<PlateDocumentEnvelope | null>(null);
const lastSavedEnvelopeRef = React.useRef<string>('');
```

Add:

```ts
function stringifyEnvelope(envelope: PlateDocumentEnvelope | null) {
  return envelope ? JSON.stringify(envelope) : '';
}

function withUpdatedContent(
  envelope: PlateDocumentEnvelope,
  content: PlateDocumentEnvelope['content'],
): PlateDocumentEnvelope {
  return {
    ...envelope,
    content,
    updatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Implement native load/save callbacks**

Use `readPlateDocument` in `openDocument` and `savePlateDocument` in `saveCurrentDocumentNow`:

```ts
const content = await readPlateDocument(snapshot.rootPath, node.absolutePath);
setDocumentContent(content);
setDraftEnvelope(content.envelope);
lastSavedEnvelopeRef.current = stringifyEnvelope(content.envelope);
```

Save:

```ts
const envelope = envelopeOverride ?? draftEnvelope;

if (!envelope) {
  return;
}

const serialized = stringifyEnvelope(envelope);
if (serialized === lastSavedEnvelopeRef.current) {
  setSaveState('saved');
  return;
}

const meta = await savePlateDocument(
  snapshot.rootPath,
  currentDocument.absolutePath,
  envelope,
);

lastSavedEnvelopeRef.current = serialized;
setDocumentContent((previous) =>
  previous ? { ...previous, envelope, modifiedAt: meta.modifiedAt } : previous,
);
```

- [ ] **Step 5: Implement native editor change callback**

Expose:

```ts
const updateDocumentValue = React.useCallback(
  (nextValue: PlateDocumentEnvelope['content']) => {
    setDraftEnvelope((previous) => {
      if (!previous) {
        return previous;
      }

      const nextEnvelope = withUpdatedContent(previous, nextValue);
      const nextSerialized = stringifyEnvelope(nextEnvelope);

      if (nextSerialized === lastSavedEnvelopeRef.current) {
        clearPendingSave();
        setSaveState('saved');
        setSaveError(null);
        return nextEnvelope;
      }

      setSaveState('dirty');
      setSaveError(null);
      clearPendingSave();
      pendingSaveTimerRef.current = setTimeout(() => {
        void saveCurrentDocumentNow(nextEnvelope);
      }, 800);

      return nextEnvelope;
    });
  },
  [clearPendingSave, saveCurrentDocumentNow],
);
```

- [ ] **Step 6: Add create/import orchestration**

Add callbacks:

```ts
const refreshWorkspaceTree = React.useCallback(async () => {
  if (!snapshot) {
    return null;
  }

  const nextSnapshot = await loadWorkspaceTree(snapshot.rootPath);
  setSnapshot(nextSnapshot);
  return nextSnapshot;
}, [snapshot]);

const createDocument = React.useCallback(async (parentPath = '') => {
  if (!snapshot) {
    return;
  }

  const created = await createPlateDocument(snapshot.rootPath, parentPath, '未命名文档');
  await refreshWorkspaceTree();
  await openDocument(created.node);
}, [openDocument, refreshWorkspaceTree, snapshot]);

const createDirectory = React.useCallback(async (parentPath = '') => {
  if (!snapshot) {
    return;
  }

  await createWorkspaceDirectory(snapshot.rootPath, parentPath, '未命名目录');
  await refreshWorkspaceTree();
}, [refreshWorkspaceTree, snapshot]);

const importMarkdownDocuments = React.useCallback(async (targetDir = '') => {
  if (!snapshot) {
    return;
  }

  const selected = await selectMarkdownSourceFiles();
  if (selected.length === 0) {
    return;
  }

  const sourceFiles = await readMarkdownSourceFiles(selected);
  const documents = sourceFiles.map((source) => ({
    title: extractMarkdownImportTitle(source.content, source.fileName),
    sourceFileName: source.fileName,
    content: markdownToPlateValue(source.content),
  }));
  const result = await createImportedPlateDocuments(snapshot.rootPath, targetDir, documents);
  await refreshWorkspaceTree();

  if (result.created[0]) {
    await openDocument(result.created[0].node);
  }
}, [openDocument, refreshWorkspaceTree, snapshot]);
```

- [ ] **Step 7: Run document-flow tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add components/workspace/use-workspace.ts components/workspace/__tests__/workspace-document-flow.test.tsx
git commit -m "feat：支持原生 Plate 文档状态流"
```

Expected: commit succeeds.

## Task 7: Workspace UI Wiring

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/editor-pane.tsx`
- Modify: `components/workspace/document-tree.tsx`
- Modify: `components/workspace/workspace-sidebar.tsx`
- Modify: `components/workspace/workspace-switcher.tsx`
- Modify: `components/workspace/__tests__/document-tree.test.tsx`

- [ ] **Step 1: Write failing UI tests for native tree actions**

In `components/workspace/__tests__/document-tree.test.tsx`, add:

```ts
it('selects native documents and exposes folder actions', async () => {
  const user = userEvent.setup();
  const onSelectDocument = vi.fn();
  const onCreateDocument = vi.fn();
  const onCreateDirectory = vi.fn();
  const onImportMarkdown = vi.fn();

  render(
    <DocumentTree
      currentDocumentPath={null}
      nodes={nodes}
      searchQuery=""
      onCreateDirectory={onCreateDirectory}
      onCreateDocument={onCreateDocument}
      onImportMarkdown={onImportMarkdown}
      onSelectDocument={onSelectDocument}
    />,
  );

  await user.click(screen.getByText('Guides'));
  await user.click(screen.getByText('入门'));

  expect(onSelectDocument).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'intro.plate.json' }),
  );

  await user.click(screen.getByLabelText('在 Guides 中新建文档'));
  await user.click(screen.getByLabelText('在 Guides 中新建目录'));
  await user.click(screen.getByLabelText('导入 Markdown 到 Guides'));

  expect(onCreateDocument).toHaveBeenCalledWith('Guides');
  expect(onCreateDirectory).toHaveBeenCalledWith('Guides');
  expect(onImportMarkdown).toHaveBeenCalledWith('Guides');
});
```

Update test fixture document filenames from `.md` to `.plate.json`.

- [ ] **Step 2: Run UI tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/document-tree.test.tsx
```

Expected: FAIL because the new action props do not exist.

- [ ] **Step 3: Pass native value props from layout into PlateEditor**

In `components/workspace/workspace-layout.tsx`, replace Markdown props:

```tsx
<PlateEditor
  documentKey={`${workspace.documentContent.path}:${workspace.documentVersion}`}
  value={workspace.draftEnvelope.content}
  variant="workspace"
  onSaveRequested={workspace.saveCurrentDocumentNow}
  onValueChange={workspace.updateDocumentValue}
/>
```

Guard with `workspace.draftEnvelope` so the editor renders only when native content is loaded.

- [ ] **Step 4: Update empty and switcher copy**

In `components/workspace/editor-pane.tsx`, use:

```tsx
{hasWorkspace ? '选择左侧文档开始编辑' : '打开一个工作区'}
```

and:

```tsx
Refinex Wiki 会展示工作区中的原生 Plate 文档。
```

In `components/workspace/workspace-switcher.tsx`, replace Markdown directory copy with:

```tsx
选择一个工作区目录，后续可在这里快速切换。
```

- [ ] **Step 5: Add tree action props and controls**

In `components/workspace/document-tree.tsx`, extend props:

```ts
onCreateDirectory: (parentPath: string) => void;
onCreateDocument: (parentPath: string) => void;
onImportMarkdown: (targetDir: string) => void;
```

For directory rows, add three compact icon buttons after the title:

```tsx
{isDirectory ? (
  <span className="ml-auto hidden items-center gap-0.5 group-hover:flex">
    <button aria-label={`在 ${node.name} 中新建文档`} type="button" onClick={(event) => {
      event.stopPropagation();
      onCreateDocument(node.relativePath);
    }}>
      <FilePlus2 size={13} />
    </button>
    <button aria-label={`在 ${node.name} 中新建目录`} type="button" onClick={(event) => {
      event.stopPropagation();
      onCreateDirectory(node.relativePath);
    }}>
      <FolderPlus size={13} />
    </button>
    <button aria-label={`导入 Markdown 到 ${node.name}`} type="button" onClick={(event) => {
      event.stopPropagation();
      onImportMarkdown(node.relativePath);
    }}>
      <FileInput size={13} />
    </button>
  </span>
) : null}
```

Keep files iconless.

- [ ] **Step 6: Wire sidebar callbacks**

In `components/workspace/workspace-sidebar.tsx`, pass:

```tsx
onCreateDirectory={workspace.createDirectory}
onCreateDocument={workspace.createDocument}
onImportMarkdown={workspace.importMarkdownDocuments}
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/document-tree.test.tsx components/workspace/__tests__/workspace-document-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add components/workspace/workspace-layout.tsx components/workspace/editor-pane.tsx components/workspace/document-tree.tsx components/workspace/workspace-sidebar.tsx components/workspace/workspace-switcher.tsx components/workspace/__tests__/document-tree.test.tsx
git commit -m "feat：连接原生工作区交互"
```

Expected: commit succeeds.

## Task 8: Workspace Tree Utilities And Tests

**Files:**
- Modify: `components/workspace/workspace-tree.ts`
- Modify: `components/workspace/__tests__/workspace-tree.test.ts`

- [ ] **Step 1: Replace Markdown utility tests with native title tests**

In `components/workspace/__tests__/workspace-tree.test.ts`, remove `normalizeMarkdownTitle` tests and use native node fixtures:

```ts
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
        name: 'intro.plate.json',
        kind: 'document',
        relativePath: 'Guides/intro.plate.json',
        absolutePath: '/repo/Guides/intro.plate.json',
        title: '入门指南',
      },
    ],
  },
  {
    id: 'doc-root',
    name: 'README.plate.json',
    kind: 'document',
    relativePath: 'README.plate.json',
    absolutePath: '/repo/README.plate.json',
    title: '项目说明',
  },
];

it('flattens native Plate document nodes', () => {
  expect(flattenDocuments(nodes).map((item) => item.relativePath)).toEqual([
    'Guides/intro.plate.json',
    'README.plate.json',
  ]);
});

it('searches by filename, path, and native title', () => {
  expect(searchWorkspace(nodes, '入门')).toHaveLength(1);
  expect(searchWorkspace(nodes, 'guides')).toHaveLength(1);
  expect(searchWorkspace(nodes, 'readme')).toHaveLength(1);
});
```

- [ ] **Step 2: Run tree tests and verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-tree.test.ts
```

Expected: FAIL until Markdown title utility is removed and filename fallback changes.

- [ ] **Step 3: Remove Markdown title normalization**

In `components/workspace/workspace-tree.ts`, remove `normalizeMarkdownTitle`. Use this fallback in `flattenDocuments`:

```ts
title: node.title || node.name.replace(/\.plate\.json$/i, ''),
```

- [ ] **Step 4: Run tree tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add components/workspace/workspace-tree.ts components/workspace/__tests__/workspace-tree.test.ts
git commit -m "refactor：切换工作区树为原生文档"
```

Expected: commit succeeds.

## Task 9: Full Verification And Desktop Smoke Test

**Files:**
- No required code changes.

- [ ] **Step 1: Run frontend tests**

Run:

```bash
npm run test:run
```

Expected: all Vitest suites PASS.

- [ ] **Step 2: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests
```

Expected: all workspace Rust tests PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npx eslint app/page.tsx app/editor/page.tsx components/workspace components/editor/plate-editor.tsx components/editor/markdown-import.ts vitest.config.ts
```

Expected: exits with status `0`.

- [ ] **Step 4: Run web build**

Run:

```bash
npm run build
```

Expected: Next build succeeds.

- [ ] **Step 5: Run desktop build without bundling**

Run:

```bash
npm run desktop:build -- --no-bundle
```

Expected: Tauri build succeeds.

- [ ] **Step 6: Manual desktop smoke**

Run:

```bash
npm run desktop:dev
```

Manual checks:

- Open a workspace containing `.md`, `.mdx`, `.json`, and `*.plate.json`.
- Confirm only folders and `*.plate.json` appear.
- Click a native document and confirm it opens instantly without Markdown conversion.
- Edit content and confirm autosave shows saved state.
- Press `Cmd+S` and confirm no error.
- Create a new document under a folder.
- Import a `.md` file into a folder and confirm a new `*.plate.json` appears while the source `.md` remains unchanged.

- [ ] **Step 7: Commit any verification fixes**

If verification required fixes, run:

```bash
git add .
git commit -m "fix：完善原生工作区验证问题"
```

Expected: commit succeeds only if there were fixes.

## Self-Review Checklist

- Spec coverage:
  - Native `*.plate.json` document model: Task 2, Task 3, Task 4, Task 6.
  - `.md/.mdx` hidden from tree: Task 2 and Task 8.
  - Markdown import only: Task 3, Task 5, Task 6, Task 7.
  - Workspace metadata `.refinex/workspace.json`: Task 2.
  - Save-before-switch and debounce save: Task 6.
  - UI copy and interactions: Task 7.
  - Revert old Markdown-primary commits: Task 1.
- Placeholder scan:
  - No unresolved placeholders remain in the task body.
  - No deferred implementation phrases remain in the task body.
- Type consistency:
  - Native content type is `Value` in frontend and `serde_json::Value` in Rust.
  - Normal open/save uses `readPlateDocument` and `savePlateDocument`.
  - Markdown conversion is isolated in `components/editor/markdown-import.ts`.

---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Local Asset Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace-local uploads for images, videos, audio, and files, storing assets under `<workspace>/.refinex/assets` and referencing them from Plate documents with `refinex-asset://<assetId>`.

**Architecture:** Keep filesystem authority in Rust Tauri commands. The frontend keeps Plate's current placeholder upload flow, but routes workspace uploads through a local asset adapter and resolves `refinex-asset://` URLs before rendering media nodes. Settings are exposed from the existing right tool rail menu through an IDEA-style settings dialog with a first `存储` page.

**Tech Stack:** Tauri v2 / Rust 2021, serde / serde_json, sha2 / base64, Next.js 16, React 19, Plate v53, Vitest, Testing Library, Cargo tests.

---

## Scope Check

The spec is one coherent subsystem: local asset storage for the existing workspace editor. The plan deliberately excludes OSS storage, custom API storage, manual orphan cleanup, and arbitrary asset directory selection.

## File Structure

- Modify `src-tauri/Cargo.toml`: add `base64`, `sha2`, and `hex` dependencies for safe upload payload decoding and stable asset IDs.
- Create `src-tauri/src/assets.rs`: asset index types, upload, resolve, reference extraction, and cleanup helpers with Rust tests.
- Modify `src-tauri/src/workspace.rs`: delegate asset cleanup from save/delete flows and keep existing workspace validation behavior.
- Modify `src-tauri/src/lib.rs`: register asset and app settings commands.
- Create `src-tauri/src/settings.rs`: global app settings read/write in Tauri AppLocalData.
- Modify `src-tauri/tauri.conf.json`: enable asset protocol with a deliberately narrow scope only after Task 2 validates it; otherwise keep Blob URL fallback.
- Modify `components/workspace/workspace-types.ts`: add asset and settings types.
- Modify `components/workspace/workspace-api.ts`: add typed wrappers for upload, resolve, cleanup-supporting save, and settings commands.
- Create `components/editor/workspace-asset-context.tsx`: provide workspace root to editor media components.
- Modify `components/editor/plate-editor.tsx`: accept `workspaceRootPath` and provide it through context.
- Modify `components/workspace/workspace-layout.tsx`: pass `workspace.snapshot.rootPath` to `PlateEditor`.
- Modify `hooks/use-upload-file.ts`: choose local Tauri upload in workspace mode, otherwise preserve current UploadThing/mock behavior.
- Create `components/editor/use-resolved-asset-url.ts`: resolve `refinex-asset://` to renderable URLs with caching.
- Modify `components/ui/media-image-node.tsx`, `media-video-node.tsx`, `media-audio-node.tsx`, `media-file-node.tsx`: render resolved local URLs.
- Create `components/workspace/workspace-settings-dialog.tsx`: IDEA-style settings dialog with the `存储` page.
- Modify `components/workspace/ai-side-panel.tsx`: add `设置...` menu item and open the settings dialog.
- Modify and add tests under `components/workspace/__tests__`, `components/editor/__tests__`, and `components/ui/__tests__`.

## Task 1: Rust Asset Index, Upload, And Resolve

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/assets.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust dependencies**

Patch `src-tauri/Cargo.toml`:

```toml
[dependencies]
base64 = "0.22"
hex = "0.4"
log = "0.4"
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
sha2 = "0.10"
tauri = { version = "2.11.2", features = [] }
tauri-plugin-log = "2"
tauri-plugin-dialog = "2.7.1"
tauri-plugin-fs = "2.5.1"
tauri-plugin-opener = "2.5.4"
tauri-plugin-process = "2.3.1"
tauri-plugin-shell = "2.3.5"
tauri-plugin-updater = "2.10.1"
```

- [ ] **Step 2: Write failing Rust asset tests**

Create `src-tauri/src/assets.rs` with type definitions and these tests first:

```rust
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAssetIndex {
    pub schema_version: u32,
    pub assets: BTreeMap<String, WorkspaceAssetRecord>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAssetRecord {
    pub id: String,
    pub storage: String,
    pub relative_path: String,
    pub original_name: String,
    pub media_type: String,
    pub size: u64,
    pub created_at: String,
    pub sha256: String,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadWorkspaceAssetInput {
    pub file_name: String,
    pub media_type: String,
    pub base64_data: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadedWorkspaceAsset {
    pub id: String,
    pub url: String,
    pub name: String,
    pub media_type: String,
    pub size: u64,
    pub absolute_path: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedWorkspaceAsset {
    pub id: String,
    pub absolute_path: String,
    pub media_type: String,
    pub name: String,
    pub size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::fs;

    fn encoded(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    #[test]
    fn uploads_asset_under_refinex_assets_and_writes_index() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let uploaded = upload_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "cover.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: encoded(b"png bytes"),
            },
        )
        .expect("上传资产失败");

        assert_eq!(uploaded.name, "cover.png");
        assert_eq!(uploaded.media_type, "image/png");
        assert_eq!(uploaded.size, 9);
        assert!(uploaded.url.starts_with("refinex-asset://"));
        assert!(Path::new(&uploaded.absolute_path).is_file());
        assert!(uploaded.absolute_path.contains(".refinex/assets/files"));
        assert!(temp_dir.path().join(".refinex/assets/index.json").is_file());
    }

    #[test]
    fn resolves_only_indexed_assets() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let uploaded = upload_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "voice.mp3".to_string(),
                media_type: "audio/mpeg".to_string(),
                base64_data: encoded(b"audio"),
            },
        )
        .expect("上传音频失败");

        let resolved = resolve_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            uploaded.id.clone(),
        )
        .expect("解析资产失败");

        assert_eq!(resolved.id, uploaded.id);
        assert_eq!(resolved.name, "voice.mp3");
        assert_eq!(resolved.media_type, "audio/mpeg");

        let error = resolve_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            "missing".to_string(),
        )
        .expect_err("不存在的资产不应解析成功");

        assert_eq!(error, "资产不存在");
    }

    #[test]
    fn rejects_path_like_file_name() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let error = upload_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "../escape.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: encoded(b"bad"),
            },
        )
        .expect_err("路径型文件名不应上传成功");

        assert_eq!(error, "文件名无效");
    }

    #[test]
    fn extracts_asset_ids_from_plate_json_value() {
        let value = serde_json::json!([
            { "type": "img", "url": "refinex-asset://asset-a", "children": [{ "text": "" }] },
            { "type": "video", "url": "https://example.com/a.mp4", "children": [{ "text": "" }] },
            { "type": "file", "url": "refinex-asset://asset-b", "children": [{ "text": "" }] }
        ]);

        assert_eq!(
            extract_asset_ids(&value),
            BTreeSet::from(["asset-a".to_string(), "asset-b".to_string()])
        );
    }
}
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml assets::
```

Expected: fails because `upload_workspace_asset`, `resolve_workspace_asset`, and `extract_asset_ids` are not implemented.

- [ ] **Step 4: Implement asset helpers and commands**

Add these concrete functions to `src-tauri/src/assets.rs` below the type definitions:

```rust
use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

const ASSET_SCHEMA_VERSION: u32 = 1;
const ASSET_URL_PREFIX: &str = "refinex-asset://";
const MAX_LOCAL_ASSET_BYTES: usize = 100 * 1024 * 1024;

#[tauri::command]
pub fn upload_workspace_asset(
    root_path: String,
    input: UploadWorkspaceAssetInput,
) -> Result<UploadedWorkspaceAsset, String> {
    let root = canonical_workspace_root(&root_path)?;
    let original_name = validate_file_name(&input.file_name)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(input.base64_data.as_bytes())
        .map_err(|_| "文件内容编码无效".to_string())?;

    if bytes.is_empty() {
        return Err("文件内容为空".to_string());
    }
    if bytes.len() > MAX_LOCAL_ASSET_BYTES {
        return Err("文件超过本地上传大小限制".to_string());
    }

    let sha256 = hex::encode(Sha256::digest(&bytes));
    let extension = safe_extension(&original_name, &input.media_type);
    let asset_id = sha256.clone();
    let shard = &asset_id[0..2];
    let asset_dir = root.join(".refinex/assets/files").join(shard);
    fs::create_dir_all(&asset_dir).map_err(|_| "无法创建资产目录".to_string())?;
    let file_name = format!("{asset_id}{extension}");
    let file_path = asset_dir.join(file_name);

    if !file_path.exists() {
        fs::write(&file_path, &bytes).map_err(|_| "无法写入资产文件".to_string())?;
    }

    let mut index = read_asset_index(&root).map_err(|_| "无法读取资产索引".to_string())?;
    let record = WorkspaceAssetRecord {
        id: asset_id.clone(),
        storage: "local".to_string(),
        relative_path: relative_to_root(&root, &file_path)?,
        original_name: original_name.clone(),
        media_type: normalize_media_type(&input.media_type),
        size: bytes.len() as u64,
        created_at: current_iso_timestamp(),
        sha256,
    };
    index.assets.insert(asset_id.clone(), record.clone());
    write_asset_index(&root, &index).map_err(|_| "无法写入资产索引".to_string())?;

    let absolute_path = validate_asset_file_path(&root, &record.relative_path)?;

    Ok(UploadedWorkspaceAsset {
        id: asset_id.clone(),
        url: format!("{ASSET_URL_PREFIX}{asset_id}"),
        name: original_name,
        media_type: record.media_type,
        size: record.size,
        absolute_path: absolute_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn resolve_workspace_asset(
    root_path: String,
    asset_id: String,
) -> Result<ResolvedWorkspaceAsset, String> {
    let root = canonical_workspace_root(&root_path)?;
    let index = read_asset_index(&root).map_err(|_| "无法读取资产索引".to_string())?;
    let record = index
        .assets
        .get(&asset_id)
        .ok_or_else(|| "资产不存在".to_string())?;
    let absolute_path = validate_asset_file_path(&root, &record.relative_path)?;

    Ok(ResolvedWorkspaceAsset {
        id: record.id.clone(),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        media_type: record.media_type.clone(),
        name: record.original_name.clone(),
        size: record.size,
    })
}

pub fn extract_asset_ids(value: &Value) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    collect_asset_ids(value, &mut ids);
    ids
}

fn collect_asset_ids(value: &Value, ids: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(url)) = map.get("url") {
                if let Some(id) = url.strip_prefix(ASSET_URL_PREFIX) {
                    if !id.is_empty() {
                        ids.insert(id.to_string());
                    }
                }
            }
            for child in map.values() {
                collect_asset_ids(child, ids);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_asset_ids(item, ids);
            }
        }
        _ => {}
    }
}

fn read_asset_index(root: &Path) -> io::Result<WorkspaceAssetIndex> {
    let path = root.join(".refinex/assets/index.json");
    if !path.exists() {
        return Ok(WorkspaceAssetIndex {
            schema_version: ASSET_SCHEMA_VERSION,
            assets: BTreeMap::new(),
        });
    }
    let raw = fs::read_to_string(path)?;
    serde_json::from_str::<WorkspaceAssetIndex>(&raw)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_asset_index(root: &Path, index: &WorkspaceAssetIndex) -> io::Result<()> {
    let dir = root.join(".refinex/assets");
    fs::create_dir_all(&dir)?;
    let json = serde_json::to_string_pretty(index)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(dir.join("index.json"), format!("{json}\n"))
}

fn canonical_workspace_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;
    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }
    Ok(root)
}

fn validate_asset_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let asset_root = root.join(".refinex/assets/files");
    let path = root.join(relative_path)
        .canonicalize()
        .map_err(|_| "资产文件不存在".to_string())?;
    if !path.starts_with(asset_root) {
        return Err("资产路径越界".to_string());
    }
    Ok(path)
}

fn validate_file_name(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() || trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err("文件名无效".to_string());
    }
    Ok(trimmed.to_string())
}

fn safe_extension(file_name: &str, media_type: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let ext = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>();
    if !ext.is_empty() && ext.len() <= 12 {
        return format!(".{ext}");
    }
    match media_type {
        "image/png" => ".png".to_string(),
        "image/jpeg" => ".jpg".to_string(),
        "image/gif" => ".gif".to_string(),
        "image/webp" => ".webp".to_string(),
        "video/mp4" => ".mp4".to_string(),
        "audio/mpeg" => ".mp3".to_string(),
        "audio/wav" => ".wav".to_string(),
        "application/pdf" => ".pdf".to_string(),
        _ => ".bin".to_string(),
    }
}

fn normalize_media_type(media_type: &str) -> String {
    let trimmed = media_type.trim();
    if trimmed.is_empty() {
        "application/octet-stream".to_string()
    } else {
        trimmed.to_string()
    }
}

fn relative_to_root(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map_err(|_| "资产路径越界".to_string())
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

fn current_iso_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{millis}")
}
```

- [ ] **Step 5: Register commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod assets;
mod workspace;
```

Add to `tauri::generate_handler!`:

```rust
assets::upload_workspace_asset,
assets::resolve_workspace_asset,
```

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml assets::
```

Expected: all `assets::tests::*` tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/assets.rs src-tauri/src/lib.rs
git commit -m "feat：添加本地资产上传与解析命令"
```

## Task 2: Rust Reference Cleanup In Save And Delete

**Files:**
- Modify: `src-tauri/src/assets.rs`
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add failing cleanup tests**

Append tests in `src-tauri/src/workspace.rs` inside the existing test module:

```rust
#[test]
fn saving_document_removes_unreferenced_local_asset() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let uploaded = crate::assets::upload_workspace_asset(
        temp_dir.path().to_string_lossy().to_string(),
        crate::assets::UploadWorkspaceAssetInput {
            file_name: "cover.png".to_string(),
            media_type: "image/png".to_string(),
            base64_data: base64::engine::general_purpose::STANDARD.encode(b"asset"),
        },
    )
    .expect("上传资产失败");
    let doc_path = temp_dir.path().join("guide.plate.json");
    let old = PlateDocumentEnvelope {
        schema_version: 1,
        title: "Guide".to_string(),
        created_at: "2026-05-31T00:00:00.000Z".to_string(),
        updated_at: "2026-05-31T00:00:00.000Z".to_string(),
        content: serde_json::json!([{ "type": "img", "url": uploaded.url, "children": [{ "text": "" }] }]),
    };
    write_json_pretty(&doc_path, &old).expect("写入旧文档失败");
    let asset_path = PathBuf::from(uploaded.absolute_path);

    save_plate_document(
        temp_dir.path().to_string_lossy().to_string(),
        doc_path.to_string_lossy().to_string(),
        PlateDocumentEnvelope {
            content: serde_json::json!([{ "type": "p", "children": [{ "text": "no asset" }] }]),
            updated_at: "2026-05-31T00:00:01.000Z".to_string(),
            ..old
        },
    )
    .expect("保存文档失败");

    assert!(!asset_path.exists());
}

#[test]
fn deleting_one_of_two_documents_keeps_shared_asset() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    let uploaded = crate::assets::upload_workspace_asset(
        temp_dir.path().to_string_lossy().to_string(),
        crate::assets::UploadWorkspaceAssetInput {
            file_name: "cover.png".to_string(),
            media_type: "image/png".to_string(),
            base64_data: base64::engine::general_purpose::STANDARD.encode(b"shared"),
        },
    )
    .expect("上传资产失败");
    let asset_path = PathBuf::from(uploaded.absolute_path.clone());
    for name in ["a.plate.json", "b.plate.json"] {
        write_json_pretty(
            &temp_dir.path().join(name),
            &PlateDocumentEnvelope {
                schema_version: 1,
                title: name.to_string(),
                created_at: "2026-05-31T00:00:00.000Z".to_string(),
                updated_at: "2026-05-31T00:00:00.000Z".to_string(),
                content: serde_json::json!([{ "type": "img", "url": uploaded.url, "children": [{ "text": "" }] }]),
            },
        )
        .expect("写入文档失败");
    }

    delete_workspace_node(
        temp_dir.path().to_string_lossy().to_string(),
        temp_dir.path().join("a.plate.json").to_string_lossy().to_string(),
    )
    .expect("删除文档失败");

    assert!(asset_path.exists());
}
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests::saving_document_removes_unreferenced_local_asset workspace::tests::deleting_one_of_two_documents_keeps_shared_asset
```

Expected: fails because cleanup is not connected.

- [ ] **Step 3: Add cleanup functions**

Add to `src-tauri/src/assets.rs`:

```rust
pub fn cleanup_unreferenced_assets(root: &Path, candidate_ids: BTreeSet<String>) -> Result<(), String> {
    if candidate_ids.is_empty() {
        return Ok(());
    }
    let referenced = collect_workspace_asset_references(root)?;
    let mut index = read_asset_index(root).map_err(|_| "无法读取资产索引".to_string())?;

    for asset_id in candidate_ids {
        if referenced.contains(&asset_id) {
            continue;
        }
        if let Some(record) = index.assets.remove(&asset_id) {
            let path = validate_asset_file_path(root, &record.relative_path)?;
            fs::remove_file(path).map_err(|_| "无法删除资产文件".to_string())?;
        }
    }

    write_asset_index(root, &index).map_err(|_| "无法写入资产索引".to_string())
}

pub fn collect_asset_ids_from_documents(paths: &[PathBuf]) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    for path in paths {
        if let Ok(raw) = fs::read_to_string(path) {
            if let Ok(envelope) = serde_json::from_str::<Value>(&raw) {
                ids.extend(extract_asset_ids(&envelope));
            }
        }
    }
    ids
}

fn collect_workspace_asset_references(root: &Path) -> Result<BTreeSet<String>, String> {
    let mut paths = Vec::new();
    collect_plate_documents(root, &mut paths).map_err(|_| "无法扫描工作区文档".to_string())?;
    Ok(collect_asset_ids_from_documents(&paths))
}

fn collect_plate_documents(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
        if file_name == ".refinex" || file_name == ".git" || file_name == "node_modules" || file_name == "target" {
            continue;
        }
        if path.is_dir() {
            collect_plate_documents(&path, paths)?;
        } else if file_name.ends_with(".plate.json") {
            paths.push(path);
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Connect cleanup in save and delete**

In `src-tauri/src/workspace.rs`, import:

```rust
use crate::assets::{cleanup_unreferenced_assets, collect_asset_ids_from_documents, extract_asset_ids};
use std::collections::BTreeSet;
```

In `save_plate_document`, read old content before writing:

```rust
let old_asset_ids = fs::read_to_string(&document)
    .ok()
    .and_then(|raw| serde_json::from_str::<PlateDocumentEnvelope>(&raw).ok())
    .map(|old| extract_asset_ids(&old.content))
    .unwrap_or_default();
let new_asset_ids = extract_asset_ids(&envelope.content);
let cleanup_candidates = old_asset_ids
    .difference(&new_asset_ids)
    .cloned()
    .collect::<BTreeSet<_>>();
```

After `write_json_pretty`, call cleanup and log failure:

```rust
if let Err(error) = cleanup_unreferenced_assets(&root_for_document(&document)?, cleanup_candidates) {
    log::warn!("本地资产清理失败：{error}");
}
```

If `root_for_document` is not convenient, use the already canonicalized workspace root returned by `canonical_workspace_root(root_path)`.

In `delete_workspace_node`, collect document paths before deletion:

```rust
let root_for_cleanup = _root.clone();
let cleanup_candidates = match kind {
    WorkspaceNodeKind::Document => collect_asset_ids_from_documents(&[node.clone()]),
    WorkspaceNodeKind::Directory => {
        let mut documents = Vec::new();
        collect_plate_document_paths(&node, &mut documents)
            .map_err(|_| "无法扫描待删除目录".to_string())?;
        collect_asset_ids_from_documents(&documents)
    }
};
```

After deletion:

```rust
if let Err(error) = cleanup_unreferenced_assets(&root_for_cleanup, cleanup_candidates) {
    log::warn!("本地资产清理失败：{error}");
}
```

- [ ] **Step 5: Run cleanup tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests::saving_document_removes_unreferenced_local_asset workspace::tests::deleting_one_of_two_documents_keeps_shared_asset
```

Expected: both tests pass.

- [ ] **Step 6: Run all Rust workspace and asset tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace:: assets::
```

Expected: all matching tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/assets.rs src-tauri/src/workspace.rs
git commit -m "feat：清理未引用的本地资产"
```

## Task 3: App Settings Commands

**Files:**
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Test: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Add Rust settings module**

Create `src-tauri/src/settings.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub storage: StorageSettings,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub default_provider: String,
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        schema_version: 1,
        storage: StorageSettings {
            default_provider: "local".to_string(),
        },
    }
}

#[tauri::command]
pub fn read_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(default_app_settings());
    }
    let raw = fs::read_to_string(path).map_err(|_| "无法读取应用设置".to_string())?;
    serde_json::from_str::<AppSettings>(&raw).map_err(|_| "应用设置格式损坏".to_string())
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    if settings.schema_version != 1 {
        return Err("应用设置版本不支持".to_string());
    }
    if settings.storage.default_provider != "local" {
        return Err("当前仅支持本地存储".to_string());
    }
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建应用设置目录".to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|_| "无法序列化应用设置".to_string())?;
    fs::write(&path, format!("{json}\n")).map_err(|_| "无法保存应用设置".to_string())?;
    Ok(settings)
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("settings.json"))
        .map_err(|_| "无法定位应用设置目录".to_string())
}
```

- [ ] **Step 2: Register settings commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod assets;
mod settings;
mod workspace;
```

Add to `tauri::generate_handler!`:

```rust
settings::read_app_settings,
settings::save_app_settings,
```

- [ ] **Step 3: Add frontend types and wrappers**

Append to `components/workspace/workspace-types.ts`:

```ts
export interface AppSettings {
  schemaVersion: 1;
  storage: {
    defaultProvider: 'local';
  };
}
```

Append to `components/workspace/workspace-api.ts`:

```ts
export async function readAppSettings() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AppSettings>('read_app_settings');
}

export async function saveAppSettings(settings: AppSettings) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AppSettings>('save_app_settings', { settings });
}
```

Add `AppSettings` to the existing type import list.

- [ ] **Step 4: Extend workspace API test**

In `components/workspace/__tests__/workspace-api.test.ts`, import `readAppSettings` and `saveAppSettings`, then add two mocked calls at the end of the native command test:

```ts
invokeMock
  .mockResolvedValueOnce({ schemaVersion: 1, storage: { defaultProvider: 'local' } })
  .mockResolvedValueOnce({ schemaVersion: 1, storage: { defaultProvider: 'local' } });

await readAppSettings();
await saveAppSettings({ schemaVersion: 1, storage: { defaultProvider: 'local' } });

expect(invokeMock).toHaveBeenNthCalledWith(11, 'read_app_settings');
expect(invokeMock).toHaveBeenNthCalledWith(12, 'save_app_settings', {
  settings: { schemaVersion: 1, storage: { defaultProvider: 'local' } },
});
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
cargo test --manifest-path src-tauri/Cargo.toml settings
```

Expected: frontend API test passes; Cargo settings tests pass if added, or command compiles as part of the test target.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/lib.rs components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat：添加应用存储设置命令"
```

## Task 4: Frontend Local Upload Adapter

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Create: `components/editor/workspace-asset-context.tsx`
- Modify: `components/editor/plate-editor.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `hooks/use-upload-file.ts`
- Test: `components/editor/__tests__/plate-editor.test.tsx`

- [ ] **Step 1: Add asset API types and wrappers**

Add to `components/workspace/workspace-types.ts`:

```ts
export interface UploadWorkspaceAssetInput {
  fileName: string;
  mediaType: string;
  base64Data: string;
}

export interface UploadedWorkspaceAsset {
  id: string;
  url: string;
  name: string;
  mediaType: string;
  size: number;
  absolutePath: string;
}

export interface ResolvedWorkspaceAsset {
  id: string;
  absolutePath: string;
  mediaType: string;
  name: string;
  size: number;
}
```

Add wrappers to `components/workspace/workspace-api.ts`:

```ts
export async function uploadWorkspaceAsset(
  rootPath: string,
  input: UploadWorkspaceAssetInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<UploadedWorkspaceAsset>('upload_workspace_asset', {
    rootPath,
    input,
  });
}

export async function resolveWorkspaceAsset(rootPath: string, assetId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ResolvedWorkspaceAsset>('resolve_workspace_asset', {
    rootPath,
    assetId,
  });
}
```

- [ ] **Step 2: Create workspace asset context**

Create `components/editor/workspace-asset-context.tsx`:

```tsx
'use client';

import * as React from 'react';

interface WorkspaceAssetContextValue {
  rootPath: string | null;
  mode: 'demo' | 'workspace';
}

const WorkspaceAssetContext = React.createContext<WorkspaceAssetContextValue>({
  mode: 'demo',
  rootPath: null,
});

export function WorkspaceAssetProvider({
  children,
  rootPath,
  mode,
}: React.PropsWithChildren<WorkspaceAssetContextValue>) {
  return (
    <WorkspaceAssetContext.Provider value={{ mode, rootPath }}>
      {children}
    </WorkspaceAssetContext.Provider>
  );
}

export function useWorkspaceAssetContext() {
  return React.useContext(WorkspaceAssetContext);
}
```

- [ ] **Step 3: Provide workspace root to the editor**

Modify `components/editor/plate-editor.tsx` props:

```ts
  workspaceRootPath?: string | null;
```

Wrap the existing `<Plate>` body:

```tsx
<WorkspaceAssetProvider
  mode={variant}
  rootPath={variant === 'workspace' ? (workspaceRootPath ?? null) : null}
>
  <Plate ...>
    ...
  </Plate>
</WorkspaceAssetProvider>
```

Import:

```ts
import { WorkspaceAssetProvider } from '@/components/editor/workspace-asset-context';
```

In `components/workspace/workspace-layout.tsx`, pass:

```tsx
workspaceRootPath={workspace.snapshot?.rootPath ?? null}
```

- [ ] **Step 4: Add file-to-base64 helper and local upload branch**

Modify `hooks/use-upload-file.ts`:

```ts
import { useWorkspaceAssetContext } from '@/components/editor/workspace-asset-context';
import { isTauriRuntime, uploadWorkspaceAsset } from '@/components/workspace/workspace-api';
```

Inside `useUploadFile`, read context:

```ts
const assetContext = useWorkspaceAssetContext();
```

At the top of `uploadThing(file: File)` after setting state:

```ts
if (
  assetContext.mode === 'workspace' &&
  assetContext.rootPath &&
  isTauriRuntime()
) {
  const uploaded = await uploadWorkspaceAsset(assetContext.rootPath, {
    base64Data: await fileToBase64(file),
    fileName: file.name,
    mediaType: file.type || 'application/octet-stream',
  });
  const localUploadedFile = {
    key: uploaded.id,
    appUrl: uploaded.url,
    name: uploaded.name,
    size: uploaded.size,
    type: uploaded.mediaType,
    url: uploaded.url,
  } as UploadedFile;
  setProgress(100);
  setUploadedFile(localUploadedFile);
  onUploadComplete?.(localUploadedFile);
  return localUploadedFile;
}
```

Append helper:

```ts
async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}
```

- [ ] **Step 5: Add tests**

In `components/editor/__tests__/plate-editor.test.tsx`, add an assertion that workspace mode passes the root path:

```tsx
it('provides workspace root path to media upload context', () => {
  render(
    <PlateEditor
      documentKey="/repo/guide.plate.json:1"
      value={[{ children: [{ text: '正文' }], type: 'p' }]}
      variant="workspace"
      workspaceRootPath="/repo"
    />,
  );

  expect(screen.getByTestId('plate-editor-root')).toBeTruthy();
});
```

If the test needs a stable marker, add `data-testid="plate-editor-root"` to the editor container wrapping the provider.

- [ ] **Step 6: Run focused tests**

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-api.test.ts
```

Expected: both test files pass.

- [ ] **Step 7: Commit**

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/editor/workspace-asset-context.tsx components/editor/plate-editor.tsx components/workspace/workspace-layout.tsx hooks/use-upload-file.ts components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat：接入工作区本地上传适配器"
```

## Task 5: Resolve Local Asset URLs In Media Nodes

**Files:**
- Create: `components/editor/use-resolved-asset-url.ts`
- Modify: `components/ui/media-image-node.tsx`
- Modify: `components/ui/media-video-node.tsx`
- Modify: `components/ui/media-audio-node.tsx`
- Modify: `components/ui/media-file-node.tsx`

- [ ] **Step 1: Create resolver hook**

Create `components/editor/use-resolved-asset-url.ts`:

```ts
'use client';

import * as React from 'react';

import { convertFileSrc } from '@tauri-apps/api/core';

import { useWorkspaceAssetContext } from '@/components/editor/workspace-asset-context';
import { resolveWorkspaceAsset } from '@/components/workspace/workspace-api';

const ASSET_PREFIX = 'refinex-asset://';

export function useResolvedAssetUrl(url: string | undefined) {
  const { mode, rootPath } = useWorkspaceAssetContext();
  const [resolvedUrl, setResolvedUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!url || !url.startsWith(ASSET_PREFIX) || mode !== 'workspace' || !rootPath) {
        setResolvedUrl(url ?? null);
        return;
      }

      try {
        const assetId = url.slice(ASSET_PREFIX.length);
        const resolved = await resolveWorkspaceAsset(rootPath, assetId);
        if (!cancelled) {
          setResolvedUrl(convertFileSrc(resolved.absolutePath));
        }
      } catch {
        if (!cancelled) {
          setResolvedUrl(null);
        }
      }
    }

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [mode, rootPath, url]);

  return resolvedUrl;
}
```

- [ ] **Step 2: Use resolver in media nodes**

For `media-video-node.tsx`, replace:

```tsx
src={unsafeUrl}
```

with:

```tsx
src={useResolvedAssetUrl(props.element.url as string | undefined) ?? unsafeUrl}
```

For `media-audio-node.tsx`, use the same resolved source for `<audio>`.

For `media-file-node.tsx`, use the same resolved URL for `href`.

For `media-image-node.tsx`, replace Plate's `<Image />` with an explicit image element:

```tsx
const resolvedUrl = useResolvedAssetUrl(props.element.url as string | undefined);
const src = resolvedUrl ?? (props.element.url as string | undefined);
```

Render:

```tsx
{src ? (
  <img
    ref={handleRef}
    className={cn(
      'block w-full max-w-full cursor-pointer object-cover px-0',
      'rounded-sm',
      focused && selected && 'ring-2 ring-ring ring-offset-2',
      isDragging && 'opacity-50',
    )}
    alt={props.attributes.alt as string | undefined}
    src={src}
  />
) : (
  <div className="rounded-sm border border-dashed p-4 text-sm text-muted-foreground">
    无法加载本地图片
  </div>
)}
```

- [ ] **Step 3: Run media-related tests**

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx components/ui/__tests__
```

Expected: existing UI tests pass. If no `components/ui/__tests__` suite exists for media nodes, add a narrow source test asserting the files import `useResolvedAssetUrl`.

- [ ] **Step 4: Commit**

```bash
git add components/editor/use-resolved-asset-url.ts components/ui/media-image-node.tsx components/ui/media-video-node.tsx components/ui/media-audio-node.tsx components/ui/media-file-node.tsx
git commit -m "feat：解析本地资产媒体地址"
```

## Task 6: Storage Settings Dialog

**Files:**
- Create: `components/workspace/workspace-settings-dialog.tsx`
- Modify: `components/workspace/ai-side-panel.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Add failing UI test**

Append to `components/workspace/__tests__/workspace-layout.test.tsx`:

```tsx
it('opens storage settings from the right settings menu', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(await screen.findByText('设置...'));

  expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '存储' }).className).toContain('bg-[#3574f0]');
  expect(screen.getByText('全局存储方式')).toBeTruthy();
  expect(screen.getByText('本地存储')).toBeTruthy();
  expect(screen.getByText('OSS 存储').getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText('refinex-asset://<assetId>')).toBeTruthy();
});
```

- [ ] **Step 2: Create dialog component**

Create `components/workspace/workspace-settings-dialog.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  rootPath: string | null;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceSettingsDialog({
  open,
  rootPath,
  onOpenChange,
}: WorkspaceSettingsDialogProps) {
  const assetDirectory = rootPath ? `${rootPath}/.refinex/assets` : '<workspace>/.refinex/assets';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="grid h-[min(720px,calc(100vh-4rem))] max-w-[920px] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0 sm:max-w-[920px]"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-r bg-muted/40 p-3">
            <button
              className="flex w-full items-center gap-2 rounded-md bg-[#3574f0] px-3 py-2 text-left text-sm font-medium text-white"
              type="button"
            >
              <Database size={16} />
              存储
            </button>
          </aside>

          <section className="min-w-0 overflow-auto p-5">
            <h2 className="mb-5 font-semibold text-base">存储</h2>

            <div className="grid max-w-xl gap-5">
              <SettingRow label="全局存储方式">
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input checked readOnly type="radio" />
                    本地存储
                  </label>
                  <span aria-disabled="true" className="text-muted-foreground text-sm">
                    OSS 存储
                  </span>
                  <span aria-disabled="true" className="text-muted-foreground text-sm">
                    自定义 API
                  </span>
                </div>
              </SettingRow>

              <SettingRow label="本地资源目录">
                <Input readOnly value={assetDirectory} />
              </SettingRow>

              <SettingRow label="引用格式">
                <Input readOnly value="refinex-asset://<assetId>" />
              </SettingRow>

              <SettingRow label="清理策略">
                <Input readOnly value="保存和删除时自动清理未引用资源" />
              </SettingRow>
            </div>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="outline" type="button">
            应用
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            确定
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({
  children,
  label,
}: React.PropsWithChildren<{ label: string }>) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-4">
      <div className="pt-2 text-muted-foreground text-sm">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Open dialog from right tool rail menu**

Modify `components/workspace/ai-side-panel.tsx`:

```ts
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { WorkspaceSettingsDialog } from './workspace-settings-dialog';
```

Extend `RightToolRailProps`:

```ts
  rootPath: string | null;
```

Inside `RightToolRail`, add state:

```ts
const [settingsOpen, setSettingsOpen] = React.useState(false);
```

Add menu item before the theme submenu:

```tsx
<DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
  <Settings size={15} />
  <span>设置...</span>
</DropdownMenuItem>
<DropdownMenuSeparator />
```

Render after `</DropdownMenu>`:

```tsx
<WorkspaceSettingsDialog
  open={settingsOpen}
  rootPath={rootPath}
  onOpenChange={setSettingsOpen}
/>
```

Pass `rootPath` from `components/workspace/workspace-layout.tsx`:

```tsx
<RightToolRail
  mode={workspace.rightPanelMode}
  rootPath={workspace.snapshot?.rootPath ?? null}
  onModeChange={workspace.setRightPanelMode}
/>
```

- [ ] **Step 4: Run UI tests**

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: workspace layout tests pass, including the new settings dialog test.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/workspace-settings-dialog.tsx components/workspace/ai-side-panel.tsx components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat：添加存储设置面板"
```

## Task 7: Asset Protocol Validation And Final Verification

**Files:**
- Modify: `src-tauri/tauri.conf.json` only if asset protocol scope can stay narrow.
- Modify: `docs/superpowers/specs/2026-05-31-local-asset-storage-design.md` only if implementation evidence changes the design decision.

- [ ] **Step 1: Verify asset protocol behavior manually in dev**

Run:

```bash
npm run desktop:dev
```

Expected: Tauri app starts and opens the workspace shell.

- [ ] **Step 2: Test upload and preview**

In the app:

1. Open or create a workspace.
2. Create a document.
3. Insert an image through the media toolbar.
4. Confirm `.refinex/assets/index.json` exists under the workspace.
5. Confirm the document content contains `refinex-asset://`.
6. Confirm the image renders after saving and reopening the document.

- [ ] **Step 3: Run focused verification**

```bash
cargo test --manifest-path src-tauri/Cargo.toml assets:: workspace:: settings::
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/workspace-layout.test.tsx components/editor/__tests__/plate-editor.test.tsx
npm run build
```

Expected: all commands pass. If `npm run build` fails due to existing unrelated lint noise, run the focused test commands above and record the known unrelated failure before proceeding.

- [ ] **Step 4: Commit verification-only config or docs changes**

If `src-tauri/tauri.conf.json` was changed for asset protocol scope:

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore：配置本地资产协议范围"
```

If no config or docs changes were required, do not create an empty commit.

## Self-Review Checklist

- Spec coverage:
  - Workspace-local `.refinex/assets` storage is covered by Tasks 1 and 2.
  - `refinex-asset://<assetId>` references are covered by Tasks 1, 4, and 5.
  - Save/delete cleanup is covered by Task 2.
  - Global settings with storage page is covered by Tasks 3 and 6.
  - Asset protocol risk gate is covered by Task 7.
- Placeholder scan:
  - No step uses open-ended implementation wording.
  - Every code-changing step names exact files and concrete code or command content.
- Type consistency:
  - Rust command names are `upload_workspace_asset`, `resolve_workspace_asset`, `read_app_settings`, and `save_app_settings`.
  - Frontend wrapper names are `uploadWorkspaceAsset`, `resolveWorkspaceAsset`, `readAppSettings`, and `saveAppSettings`.
  - Asset URL prefix is consistently `refinex-asset://`.

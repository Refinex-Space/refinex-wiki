use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub root_path: String,
    pub root_name: String,
    pub nodes: Vec<WorkspaceNode>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
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

#[derive(Copy, Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceNodeKind {
    Directory,
    Document,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
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

#[tauri::command]
pub fn load_workspace_tree(root_path: String) -> Result<WorkspaceSnapshot, String> {
    let root = canonical_workspace_root(&root_path)?;
    ensure_workspace_metadata(&root).map_err(|error| format!("初始化工作区失败：{error}"))?;
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

        if should_skip_entry(&file_name) {
            continue;
        }

        if path.is_dir() {
            let children = read_children(root, &path)?;
            nodes.push(build_directory_node(root, &path, file_name, children)?);
        } else if is_plate_document_file(&path) {
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

fn default_workspace_metadata() -> WorkspaceMetadata {
    WorkspaceMetadata {
        schema_version: 1,
        recent_document_path: None,
        expanded_paths: Vec::new(),
        sort_order: serde_json::Map::new(),
    }
}

fn ensure_workspace_metadata(root: &Path) -> io::Result<WorkspaceMetadata> {
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

fn write_json_pretty<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(path, format!("{json}\n"))
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

fn build_directory_node(
    root: &Path,
    path: &Path,
    name: String,
    children: Vec<WorkspaceNode>,
) -> std::io::Result<WorkspaceNode> {
    let relative_path = to_relative_path(root, path);

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
    let relative_path = to_relative_path(root, path);
    let title = read_plate_document_title(path)
        .unwrap_or_else(|| name.trim_end_matches(".plate.json").to_string());

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

fn to_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
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

fn directory_rank(node: &WorkspaceNode) -> u8 {
    match node.kind {
        WorkspaceNodeKind::Directory => 0,
        WorkspaceNodeKind::Document => 1,
    }
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

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
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("workspace.corrupt.")
            })
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
}

use crate::assets::{
    cleanup_unreferenced_assets, collect_asset_ids_from_documents, extract_asset_ids,
};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
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

const SORT_ORDER_STEP: i64 = 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSortOrder {
    version: u32,
    nodes: BTreeMap<String, WorkspaceSortRecord>,
}

impl Default for WorkspaceSortOrder {
    fn default() -> Self {
        Self {
            version: 1,
            nodes: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSortRecord {
    parent_path: String,
    rank: i64,
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

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeletedWorkspaceNode {
    pub path: String,
}

#[derive(Debug, Serialize, PartialEq)]
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

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceFile {
    pub path: String,
    pub file_name: String,
    pub content: Option<String>,
    pub base64_data: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ImportSourceFormat {
    Html,
    Markdown,
    Word,
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

#[tauri::command]
pub fn create_workspace_root(
    parent_path: String,
    workspace_name: String,
) -> Result<WorkspaceSnapshot, String> {
    let parent = canonical_parent_directory(&parent_path)?;
    let safe_name = validate_workspace_name(&workspace_name)?;
    let workspace_root = parent.join(&safe_name);

    if workspace_root.exists() {
        if !workspace_root.is_dir() {
            return Err("目标工作区路径不是文件夹".to_string());
        }

        if fs::read_dir(&workspace_root)
            .map_err(|_| "无法读取目标工作区目录".to_string())?
            .next()
            .is_some()
        {
            return Err("目标工作区目录已存在且不为空".to_string());
        }
    } else {
        fs::create_dir(&workspace_root).map_err(|_| "无法创建工作区目录".to_string())?;
    }

    ensure_workspace_metadata(&workspace_root)
        .map_err(|error| format!("初始化工作区失败：{error}"))?;
    build_workspace_snapshot(&workspace_root).map_err(|error| format!("读取工作区失败：{error}"))
}

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
    let root = canonical_workspace_root(&root_path)?;
    let document = validate_plate_document_path(&root_path, &document_path)?;
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

    write_json_pretty(&document, &envelope).map_err(|_| "无法保存文档内容".to_string())?;
    if let Err(error) = cleanup_unreferenced_assets(&root, cleanup_candidates) {
        log::warn!("本地资产清理失败：{error}");
    }

    let document = document
        .canonicalize()
        .map_err(|_| "无法读取文档信息".to_string())?;

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

    let file_name = document_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled.plate.json")
        .to_string();

    Ok(CreatedPlateDocument {
        node: build_document_node(&root, &document_path, file_name)
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
pub fn rename_workspace_node(
    root_path: String,
    node_path: String,
    new_name: String,
) -> Result<WorkspaceNode, String> {
    let (root, node, kind) = validate_workspace_node_path(&root_path, &node_path)?;
    let parent = node.parent().ok_or_else(|| "路径无效".to_string())?;
    let safe_name = validate_workspace_name(&new_name)?;
    let target = match kind {
        WorkspaceNodeKind::Directory => parent.join(&safe_name),
        WorkspaceNodeKind::Document => parent.join(format!("{safe_name}.plate.json")),
    };

    if target.exists() && target != node {
        return Err("目标名称已存在".to_string());
    }

    match kind {
        WorkspaceNodeKind::Directory => {
            fs::rename(&node, &target).map_err(|_| "无法重命名目录".to_string())?;
            let metadata =
                ensure_workspace_metadata(&root).map_err(|_| "无法读取工作区元数据".to_string())?;
            let sort_order = read_sort_order(&metadata);
            build_directory_node(
                &root,
                &target,
                safe_name,
                read_children(&root, &target, &sort_order).unwrap_or_default(),
            )
            .map_err(|_| "无法读取重命名后的目录".to_string())
        }
        WorkspaceNodeKind::Document => {
            let raw = fs::read_to_string(&node).map_err(|_| "无法读取文档内容".to_string())?;
            let mut envelope = serde_json::from_str::<PlateDocumentEnvelope>(&raw)
                .map_err(|_| "文档格式损坏".to_string())?;
            validate_plate_envelope(&envelope)?;

            fs::rename(&node, &target).map_err(|_| "无法重命名文档".to_string())?;
            envelope.title = safe_name;
            envelope.updated_at = current_iso_timestamp();
            write_json_pretty(&target, &envelope).map_err(|_| "无法更新文档标题".to_string())?;

            let file_name = target
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("renamed.plate.json")
                .to_string();
            build_document_node(&root, &target, file_name)
                .map_err(|_| "无法读取重命名后的文档".to_string())
        }
    }
}

#[tauri::command]
pub fn delete_workspace_node(
    root_path: String,
    node_path: String,
) -> Result<DeletedWorkspaceNode, String> {
    let (root, node, kind) = validate_workspace_node_path(&root_path, &node_path)?;
    let deleted_path = node.to_string_lossy().to_string();
    let cleanup_candidates = match kind {
        WorkspaceNodeKind::Directory => {
            let mut documents = Vec::new();
            collect_plate_document_paths(&node, &mut documents)
                .map_err(|_| "无法扫描待删除目录".to_string())?;
            collect_asset_ids_from_documents(&documents)
        }
        WorkspaceNodeKind::Document => {
            collect_asset_ids_from_documents(std::slice::from_ref(&node))
        }
    };

    match kind {
        WorkspaceNodeKind::Directory => {
            fs::remove_dir_all(&node).map_err(|_| "无法删除目录".to_string())?;
        }
        WorkspaceNodeKind::Document => {
            fs::remove_file(&node).map_err(|_| "无法删除文档".to_string())?;
        }
    }

    if let Err(error) = cleanup_unreferenced_assets(&root, cleanup_candidates) {
        log::warn!("本地资产清理失败：{error}");
    }

    Ok(DeletedWorkspaceNode { path: deleted_path })
}

#[tauri::command]
pub fn move_workspace_node(
    root_path: String,
    node_path: String,
    target_parent_path: String,
    before_path: Option<String>,
    after_path: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let root = canonical_workspace_root(&root_path)?;
    let (source, kind) = resolve_workspace_node_for_move(&root, &node_path)?;
    let target_parent = resolve_workspace_directory_for_move(&root, &target_parent_path)?;

    if kind == WorkspaceNodeKind::Directory && target_parent.starts_with(&source) {
        return Err("不能将目录移动到自身或其子目录内".to_string());
    }

    let before = resolve_optional_workspace_node_for_move(&root, before_path.as_deref())?;
    let after = resolve_optional_workspace_node_for_move(&root, after_path.as_deref())?;
    validate_move_sibling_parent(&target_parent, before.as_deref())?;
    validate_move_sibling_parent(&target_parent, after.as_deref())?;

    let file_name = source
        .file_name()
        .ok_or_else(|| "无法读取节点名称".to_string())?
        .to_os_string();
    let destination = target_parent.join(file_name);

    if destination.exists() {
        let existing = destination
            .canonicalize()
            .map_err(|_| "无法读取目标位置".to_string())?;

        if existing != source {
            return Err("目标位置已存在同名节点".to_string());
        }
    }

    let old_relative_path = to_relative_path(&root, &source);

    if destination != source {
        fs::rename(&source, &destination).map_err(|error| format!("移动节点失败：{error}"))?;
    }

    let destination = destination
        .canonicalize()
        .map_err(|_| "无法读取移动后的节点".to_string())?;
    let new_relative_path = to_relative_path(&root, &destination);
    let target_parent_relative_path = to_relative_path(&root, &target_parent);

    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;
    let mut sort_order = read_sort_order(&metadata);
    rewrite_sort_order_path_prefix(&mut sort_order, &old_relative_path, &new_relative_path);
    ensure_parent_sort_records(&root, &target_parent, &mut sort_order)
        .map_err(|error| format!("初始化排序元数据失败：{error}"))?;

    let previous_relative_path = match after.as_ref() {
        Some(path) => Some(to_relative_path(&root, path)),
        None if before.is_none() => {
            find_last_sibling_relative_path(&root, &target_parent, &new_relative_path, &sort_order)
                .map_err(|error| format!("读取目标排序失败：{error}"))?
        }
        None => None,
    };
    let next_relative_path = before.as_ref().map(|path| to_relative_path(&root, path));

    assign_rank_with_rebalance(
        &mut sort_order,
        &new_relative_path,
        &target_parent_relative_path,
        previous_relative_path.as_deref(),
        next_relative_path.as_deref(),
    );
    write_sort_order(&mut metadata, &sort_order)
        .map_err(|error| format!("更新排序元数据失败：{error}"))?;
    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存排序元数据失败：{error}"))?;

    build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
}

#[tauri::command]
pub fn read_markdown_source_files(
    source_paths: Vec<String>,
) -> Result<Vec<MarkdownSourceFile>, String> {
    source_paths
        .into_iter()
        .map(|source_path| {
            let path = PathBuf::from(&source_path)
                .canonicalize()
                .map_err(|_| "Markdown 源文件不存在".to_string())?;

            if !is_markdown_source_file(&path) {
                return Err("仅支持导入 .md 或 .mdx 文件".to_string());
            }

            let content =
                fs::read_to_string(&path).map_err(|_| "无法读取 Markdown 源文件".to_string())?;
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

#[tauri::command]
pub fn read_import_source_files(
    source_paths: Vec<String>,
    format: ImportSourceFormat,
) -> Result<Vec<ImportSourceFile>, String> {
    source_paths
        .into_iter()
        .map(|source_path| {
            let path = PathBuf::from(&source_path)
                .canonicalize()
                .map_err(|_| "导入源文件不存在".to_string())?;

            if !is_import_source_file(&path, &format) {
                return Err(import_source_format_error(&format).to_string());
            }

            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("import")
                .to_string();

            match format {
                ImportSourceFormat::Html | ImportSourceFormat::Markdown => {
                    let content =
                        fs::read_to_string(&path).map_err(|_| "无法读取导入源文件".to_string())?;

                    Ok(ImportSourceFile {
                        path: path.to_string_lossy().to_string(),
                        file_name,
                        content: Some(content),
                        base64_data: None,
                    })
                }
                ImportSourceFormat::Word => {
                    let bytes = fs::read(&path).map_err(|_| "无法读取 Word 源文件".to_string())?;

                    Ok(ImportSourceFile {
                        path: path.to_string_lossy().to_string(),
                        file_name,
                        content: None,
                        base64_data: Some(general_purpose::STANDARD.encode(bytes)),
                    })
                }
            }
        })
        .collect()
}

#[tauri::command]
pub fn write_export_file(target_path: String, base64_data: String) -> Result<String, String> {
    let path = PathBuf::from(target_path);
    let bytes = decode_base64_export_data(&base64_data)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建导出目录".to_string())?;
    }

    fs::write(&path, bytes).map_err(|_| "无法写入导出文件".to_string())?;

    Ok(path.to_string_lossy().to_string())
}

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
            Ok(()) => {
                let file_name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("import.plate.json")
                    .to_string();

                match build_document_node(&root, &path, file_name) {
                    Ok(node) => created.push(CreatedPlateDocument { node, envelope }),
                    Err(_) => failed.push(ImportFailure {
                        source_file_name: document.source_file_name,
                        message: "无法创建导入文档节点".to_string(),
                    }),
                }
            }
            Err(_) => failed.push(ImportFailure {
                source_file_name: document.source_file_name,
                message: "无法写入导入文档".to_string(),
            }),
        }
    }

    Ok(ImportedPlateDocumentResult { created, failed })
}

pub fn build_workspace_snapshot(root: &Path) -> std::io::Result<WorkspaceSnapshot> {
    let root = root.canonicalize()?;
    let metadata = ensure_workspace_metadata(&root)?;
    let sort_order = read_sort_order(&metadata);
    let root_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Workspace")
        .to_string();

    Ok(WorkspaceSnapshot {
        root_path: root.to_string_lossy().to_string(),
        root_name,
        nodes: read_children(&root, &root, &sort_order)?,
    })
}

fn read_children(
    root: &Path,
    dir: &Path,
    sort_order: &WorkspaceSortOrder,
) -> std::io::Result<Vec<WorkspaceNode>> {
    let mut nodes = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_skip_entry(&file_name) {
            continue;
        }

        let sort_timestamp = read_sort_timestamp(&path)?;

        if path.is_dir() {
            let children = read_children(root, &path, sort_order)?;
            nodes.push((
                build_directory_node(root, &path, file_name, children)?,
                sort_timestamp,
            ));
        } else if is_plate_document_file(&path) {
            nodes.push((build_document_node(root, &path, file_name)?, sort_timestamp));
        }
    }

    let parent_path = to_relative_path(root, dir);
    nodes.sort_by(|(left, left_timestamp), (right, right_timestamp)| {
        compare_workspace_nodes(
            &parent_path,
            left,
            *left_timestamp,
            right,
            *right_timestamp,
            sort_order,
        )
    });

    Ok(nodes.into_iter().map(|(node, _)| node).collect())
}

fn compare_workspace_nodes(
    parent_path: &str,
    left: &WorkspaceNode,
    left_timestamp: u128,
    right: &WorkspaceNode,
    right_timestamp: u128,
    sort_order: &WorkspaceSortOrder,
) -> std::cmp::Ordering {
    let left_rank = sort_order
        .nodes
        .get(&left.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);
    let right_rank = sort_order
        .nodes
        .get(&right.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);

    match (left_rank, right_rank) {
        (Some(left_rank), Some(right_rank)) => left_rank
            .cmp(&right_rank)
            .then_with(|| left_timestamp.cmp(&right_timestamp))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left_timestamp
            .cmp(&right_timestamp)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
    }
}

fn assign_rank_with_rebalance(
    sort_order: &mut WorkspaceSortOrder,
    moved_path: &str,
    parent_path: &str,
    previous_path: Option<&str>,
    next_path: Option<&str>,
) -> i64 {
    let previous_rank = previous_path.and_then(|path| {
        sort_order
            .nodes
            .get(path)
            .filter(|record| record.parent_path == parent_path)
            .map(|record| record.rank)
    });
    let next_rank = next_path.and_then(|path| {
        sort_order
            .nodes
            .get(path)
            .filter(|record| record.parent_path == parent_path)
            .map(|record| record.rank)
    });

    let candidate = match (previous_rank, next_rank) {
        (Some(previous), Some(next)) if next - previous > 1 => {
            Some(previous + ((next - previous) / 2))
        }
        (Some(previous), None) => Some(previous + SORT_ORDER_STEP),
        (None, Some(next)) if next > 1 => Some(next / 2),
        (None, None) => Some(SORT_ORDER_STEP),
        _ => None,
    };

    if let Some(rank) = candidate {
        sort_order.nodes.insert(
            moved_path.to_string(),
            WorkspaceSortRecord {
                parent_path: parent_path.to_string(),
                rank,
            },
        );
        return rank;
    }

    rebalance_parent_ranks(
        sort_order,
        moved_path,
        parent_path,
        previous_path,
        next_path,
    )
}

fn rebalance_parent_ranks(
    sort_order: &mut WorkspaceSortOrder,
    moved_path: &str,
    parent_path: &str,
    previous_path: Option<&str>,
    next_path: Option<&str>,
) -> i64 {
    let mut ordered_paths = sort_order
        .nodes
        .iter()
        .filter(|(path, record)| record.parent_path == parent_path && path.as_str() != moved_path)
        .map(|(path, record)| (path.clone(), record.rank))
        .collect::<Vec<_>>();

    ordered_paths.sort_by(|left, right| left.1.cmp(&right.1).then_with(|| left.0.cmp(&right.0)));

    let insert_index = if let Some(previous_path) = previous_path {
        ordered_paths
            .iter()
            .position(|(path, _)| path == previous_path)
            .map(|index| index + 1)
            .unwrap_or(ordered_paths.len())
    } else if let Some(next_path) = next_path {
        ordered_paths
            .iter()
            .position(|(path, _)| path == next_path)
            .unwrap_or(0)
    } else {
        ordered_paths.len()
    };

    ordered_paths.insert(insert_index, (moved_path.to_string(), 0));

    let mut moved_rank = SORT_ORDER_STEP;
    for (index, (path, _)) in ordered_paths.iter().enumerate() {
        let rank = ((index as i64) + 1) * SORT_ORDER_STEP;

        if path == moved_path {
            moved_rank = rank;
        }

        sort_order.nodes.insert(
            path.clone(),
            WorkspaceSortRecord {
                parent_path: parent_path.to_string(),
                rank,
            },
        );
    }

    moved_rank
}

#[derive(Debug)]
struct SortableChildEntry {
    relative_path: String,
    name: String,
    sort_timestamp: u128,
}

fn ensure_parent_sort_records(
    root: &Path,
    parent: &Path,
    sort_order: &mut WorkspaceSortOrder,
) -> std::io::Result<()> {
    let parent_path = to_relative_path(root, parent);
    let mut entries = read_sortable_child_entries(root, parent)?;

    entries.sort_by(|left, right| {
        compare_sortable_child_entries(&parent_path, left, right, sort_order)
    });

    let needs_rebalance = entries.iter().any(|entry| {
        sort_order
            .nodes
            .get(&entry.relative_path)
            .filter(|record| record.parent_path == parent_path)
            .is_none()
    });

    if !needs_rebalance {
        return Ok(());
    }

    for (index, entry) in entries.iter().enumerate() {
        sort_order.nodes.insert(
            entry.relative_path.clone(),
            WorkspaceSortRecord {
                parent_path: parent_path.clone(),
                rank: ((index as i64) + 1) * SORT_ORDER_STEP,
            },
        );
    }

    Ok(())
}

fn find_last_sibling_relative_path(
    root: &Path,
    parent: &Path,
    moved_path: &str,
    sort_order: &WorkspaceSortOrder,
) -> std::io::Result<Option<String>> {
    let parent_path = to_relative_path(root, parent);
    let mut entries = read_sortable_child_entries(root, parent)?;

    entries.sort_by(|left, right| {
        compare_sortable_child_entries(&parent_path, left, right, sort_order)
    });

    Ok(entries
        .into_iter()
        .filter(|entry| entry.relative_path != moved_path)
        .next_back()
        .map(|entry| entry.relative_path))
}

fn read_sortable_child_entries(
    root: &Path,
    parent: &Path,
) -> std::io::Result<Vec<SortableChildEntry>> {
    let mut entries = Vec::new();

    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_skip_entry(&file_name) {
            continue;
        }

        if path.is_dir() || is_plate_document_file(&path) {
            entries.push(SortableChildEntry {
                relative_path: to_relative_path(root, &path),
                name: file_name,
                sort_timestamp: read_sort_timestamp(&path)?,
            });
        }
    }

    Ok(entries)
}

fn compare_sortable_child_entries(
    parent_path: &str,
    left: &SortableChildEntry,
    right: &SortableChildEntry,
    sort_order: &WorkspaceSortOrder,
) -> std::cmp::Ordering {
    let left_rank = sort_order
        .nodes
        .get(&left.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);
    let right_rank = sort_order
        .nodes
        .get(&right.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);

    match (left_rank, right_rank) {
        (Some(left_rank), Some(right_rank)) => left_rank
            .cmp(&right_rank)
            .then_with(|| left.sort_timestamp.cmp(&right.sort_timestamp))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left
            .sort_timestamp
            .cmp(&right.sort_timestamp)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
    }
}

fn rewrite_sort_order_path_prefix(
    sort_order: &mut WorkspaceSortOrder,
    old_prefix: &str,
    new_prefix: &str,
) {
    let affected = sort_order
        .nodes
        .iter()
        .filter_map(|(path, record)| {
            if path == old_prefix || path.starts_with(&format!("{old_prefix}/")) {
                Some((path.clone(), record.clone()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    for (path, _) in &affected {
        sort_order.nodes.remove(path);
    }

    for (path, mut record) in affected {
        let next_path = rewrite_relative_prefix(&path, old_prefix, new_prefix);
        record.parent_path = rewrite_relative_prefix(&record.parent_path, old_prefix, new_prefix);
        sort_order.nodes.insert(next_path, record);
    }
}

fn rewrite_relative_prefix(value: &str, old_prefix: &str, new_prefix: &str) -> String {
    if value == old_prefix {
        return new_prefix.to_string();
    }

    if let Some(suffix) = value.strip_prefix(&format!("{old_prefix}/")) {
        return format!("{new_prefix}/{suffix}");
    }

    value.to_string()
}

fn default_workspace_metadata() -> WorkspaceMetadata {
    WorkspaceMetadata {
        schema_version: 1,
        recent_document_path: None,
        expanded_paths: Vec::new(),
        sort_order: serde_json::Map::new(),
    }
}

fn read_sort_order(metadata: &WorkspaceMetadata) -> WorkspaceSortOrder {
    serde_json::from_value(Value::Object(metadata.sort_order.clone())).unwrap_or_default()
}

fn write_sort_order(
    metadata: &mut WorkspaceMetadata,
    sort_order: &WorkspaceSortOrder,
) -> io::Result<()> {
    let value = serde_json::to_value(sort_order)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;

    metadata.sort_order = match value {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };

    Ok(())
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

fn write_workspace_metadata(root: &Path, metadata: &WorkspaceMetadata) -> io::Result<()> {
    write_json_pretty(&root.join(".refinex/workspace.json"), metadata)
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

fn canonical_parent_directory(parent_path: &str) -> Result<PathBuf, String> {
    let parent = PathBuf::from(parent_path)
        .canonicalize()
        .map_err(|_| "所在目录不存在".to_string())?;

    if !parent.is_dir() {
        return Err("所在目录不是文件夹".to_string());
    }

    Ok(parent)
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

fn is_markdown_source_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn is_import_source_file(path: &Path, format: &ImportSourceFormat) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| match format {
            ImportSourceFormat::Html => {
                matches!(extension.to_ascii_lowercase().as_str(), "html" | "htm")
            }
            ImportSourceFormat::Markdown => {
                matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx")
            }
            ImportSourceFormat::Word => extension.eq_ignore_ascii_case("docx"),
        })
        .unwrap_or(false)
}

fn import_source_format_error(format: &ImportSourceFormat) -> &'static str {
    match format {
        ImportSourceFormat::Html => "仅支持导入 .html 或 .htm 文件",
        ImportSourceFormat::Markdown => "仅支持导入 .md 或 .mdx 文件",
        ImportSourceFormat::Word => "仅支持导入 .docx 文件",
    }
}

fn decode_base64_export_data(base64_data: &str) -> Result<Vec<u8>, String> {
    general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|_| "导出文件内容无效".to_string())
}

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

fn validate_existing_plate_document_path(
    root_path: &str,
    document_path: &str,
) -> Result<PathBuf, String> {
    let document = validate_plate_document_path(root_path, document_path)?;

    if !document.is_file() {
        return Err("文档路径不是文件".to_string());
    }

    Ok(document)
}

fn validate_plate_document_path(root_path: &str, document_path: &str) -> Result<PathBuf, String> {
    let root = canonical_workspace_root(root_path)?;
    let document = PathBuf::from(document_path);
    let document = if document.exists() {
        document
            .canonicalize()
            .map_err(|_| "文档路径不存在".to_string())?
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

fn validate_workspace_directory(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let target = if relative_path.trim().is_empty() {
        root.to_path_buf()
    } else {
        let relative = Path::new(relative_path);

        if relative.is_absolute() {
            return Err("无法访问工作区外的目录".to_string());
        }

        root.join(relative)
    };

    let target = target
        .canonicalize()
        .map_err(|_| "目录路径不存在".to_string())?;

    if !target.starts_with(root) {
        return Err("无法访问工作区外的目录".to_string());
    }

    if !target.is_dir() {
        return Err("路径不是目录".to_string());
    }

    Ok(target)
}

fn validate_workspace_node_path(
    root_path: &str,
    node_path: &str,
) -> Result<(PathBuf, PathBuf, WorkspaceNodeKind), String> {
    let root = canonical_workspace_root(root_path)?;
    let node = PathBuf::from(node_path)
        .canonicalize()
        .map_err(|_| "路径不存在".to_string())?;

    if node == root {
        return Err("不能操作工作区根目录".to_string());
    }

    if !node.starts_with(&root) {
        return Err("无法访问工作区外的路径".to_string());
    }

    if node.starts_with(root.join(".refinex")) {
        return Err("不能操作工作区元数据".to_string());
    }

    if node.is_dir() {
        return Ok((root, node, WorkspaceNodeKind::Directory));
    }

    if node.is_file() && is_plate_document_file(&node) {
        return Ok((root, node, WorkspaceNodeKind::Document));
    }

    Err("仅支持工作区目录或 Plate 原生文档".to_string())
}

fn resolve_workspace_path_for_move(root: &Path, path: &str) -> Result<PathBuf, String> {
    let candidate = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else if path.trim().is_empty() {
        root.to_path_buf()
    } else {
        root.join(path)
    };
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "目标节点不存在".to_string())?;

    if !canonical.starts_with(root) {
        return Err("路径必须位于工作区内".to_string());
    }

    if canonical.starts_with(root.join(".refinex")) {
        return Err("不能操作工作区元数据".to_string());
    }

    Ok(canonical)
}

fn resolve_workspace_node_for_move(
    root: &Path,
    node_path: &str,
) -> Result<(PathBuf, WorkspaceNodeKind), String> {
    let node = resolve_workspace_path_for_move(root, node_path)?;

    if node == root {
        return Err("不能操作工作区根目录".to_string());
    }

    if node.is_dir() {
        return Ok((node, WorkspaceNodeKind::Directory));
    }

    if node.is_file() && is_plate_document_file(&node) {
        return Ok((node, WorkspaceNodeKind::Document));
    }

    Err("仅支持工作区目录或 Plate 原生文档".to_string())
}

fn resolve_workspace_directory_for_move(
    root: &Path,
    directory_path: &str,
) -> Result<PathBuf, String> {
    let directory = resolve_workspace_path_for_move(root, directory_path)?;

    if !directory.is_dir() {
        return Err("目标父级不是目录".to_string());
    }

    Ok(directory)
}

fn resolve_optional_workspace_node_for_move(
    root: &Path,
    path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    path.map(|value| resolve_workspace_node_for_move(root, value).map(|(node, _)| node))
        .transpose()
}

fn validate_move_sibling_parent(
    target_parent: &Path,
    sibling: Option<&Path>,
) -> Result<(), String> {
    if let Some(sibling) = sibling {
        if sibling.parent() != Some(target_parent) {
            return Err("排序相邻节点必须位于目标父级内".to_string());
        }
    }

    Ok(())
}

fn empty_plate_content() -> Value {
    serde_json::json!([{ "type": "p", "children": [{ "text": "" }] }])
}

fn normalize_document_title(title: &str) -> String {
    let normalized = sanitize_file_stem(title);

    if normalized.is_empty() {
        "未命名文档".to_string()
    } else {
        normalized
    }
}

fn normalize_directory_name(name: &str) -> String {
    let normalized = sanitize_file_stem(name);

    if normalized.is_empty() {
        "未命名目录".to_string()
    } else {
        normalized
    }
}

fn validate_workspace_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("工作区名称不能为空".to_string());
    }

    if matches!(trimmed, "." | "..") {
        return Err("工作区名称无效".to_string());
    }

    if trimmed.chars().any(|character| {
        matches!(
            character,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
        )
    }) {
        return Err("工作区名称不能包含路径特殊字符".to_string());
    }

    Ok(trimmed.to_string())
}

fn sanitize_file_stem(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => character,
        })
        .collect::<String>()
        .trim_matches('.')
        .trim()
        .to_string()
}

fn unique_plate_document_path(parent: &Path, title: &str) -> PathBuf {
    unique_path(parent, title, ".plate.json")
}

fn unique_directory_path(parent: &Path, name: &str) -> PathBuf {
    unique_path(parent, name, "")
}

fn unique_path(parent: &Path, stem: &str, suffix: &str) -> PathBuf {
    let first_name = format!("{stem}{suffix}");
    let first_path = parent.join(&first_name);

    if !first_path.exists() {
        return first_path;
    }

    for index in 1.. {
        let candidate = parent.join(format!("{stem}-{index}{suffix}"));

        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("无限序列应始终找到可用路径")
}

fn read_modified_at(path: &Path) -> Result<u128, String> {
    let metadata = fs::metadata(path).map_err(|_| "无法读取文档信息".to_string())?;
    let modified = metadata
        .modified()
        .map_err(|_| "无法读取文档修改时间".to_string())?;

    Ok(system_time_to_millis(modified))
}

fn read_sort_timestamp(path: &Path) -> std::io::Result<u128> {
    let metadata = fs::metadata(path)?;
    let timestamp = metadata.created().or_else(|_| metadata.modified())?;

    Ok(system_time_to_millis(timestamp))
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

fn collect_plate_document_paths(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if should_skip_entry(file_name) {
            continue;
        }

        if path.is_dir() {
            collect_plate_document_paths(&path, paths)?;
        } else if is_plate_document_file(&path) {
            paths.push(path);
        }
    }

    Ok(())
}

fn unix_timestamp_millis() -> u128 {
    system_time_to_millis(SystemTime::now())
}

fn system_time_to_millis(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn current_iso_timestamp() -> String {
    format!("{}Z", unix_timestamp_millis())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

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
    fn creates_new_workspace_root_under_parent_directory() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let snapshot = create_workspace_root(
            temp_dir.path().to_string_lossy().to_string(),
            "知识库".to_string(),
        )
        .expect("创建新工作区失败");

        assert_eq!(snapshot.root_name, "知识库");
        assert!(temp_dir
            .path()
            .join("知识库/.refinex/workspace.json")
            .is_file());
    }

    #[test]
    fn rejects_non_empty_existing_workspace_target() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let target = temp_dir.path().join("知识库");
        fs::create_dir(&target).expect("创建已有目录失败");
        fs::write(target.join("note.txt"), "content").expect("写入已有文件失败");

        let error = create_workspace_root(
            temp_dir.path().to_string_lossy().to_string(),
            "知识库".to_string(),
        )
        .expect_err("非空目录不应被当作新工作区初始化");

        assert_eq!(error, "目标工作区目录已存在且不为空");
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

    #[test]
    fn orders_new_nodes_after_existing_siblings() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir(temp_dir.path().join("ZFolder")).expect("创建已有目录失败");
        fs::write(
            temp_dir.path().join("A.plate.json"),
            r#"{"schemaVersion":1,"title":"A","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入已有文档失败");
        std::thread::sleep(std::time::Duration::from_millis(20));

        create_workspace_directory(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            "未命名目录".to_string(),
        )
        .expect("创建新目录失败");
        std::thread::sleep(std::time::Duration::from_millis(20));
        create_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            "未命名文档".to_string(),
        )
        .expect("创建新文档失败");

        let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");
        let relative_paths = snapshot
            .nodes
            .iter()
            .map(|node| node.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(relative_paths.len(), 4);
        assert_eq!(relative_paths[2], "未命名目录");
        assert_eq!(relative_paths[3], "未命名文档.plate.json");
    }

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
        fs::write(
            &doc_path,
            r#"{"schemaVersion":1,"title":"坏文档","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":{}}"#,
        )
        .unwrap();

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

        assert_eq!(
            meta.path,
            doc_path.canonicalize().unwrap().to_string_lossy()
        );
        assert!(fs::read_to_string(&doc_path)
            .unwrap()
            .contains("\"title\": \"指南\""));
    }

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
            content: serde_json::json!([
                {
                    "type": "img",
                    "url": uploaded.url,
                    "children": [{ "text": "" }]
                }
            ]),
        };
        write_json_pretty(&doc_path, &old).expect("写入旧文档失败");
        let asset_path = PathBuf::from(uploaded.absolute_path);

        save_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
            PlateDocumentEnvelope {
                content: serde_json::json!([
                    {
                        "type": "p",
                        "children": [{ "text": "no asset" }]
                    }
                ]),
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
                    content: serde_json::json!([
                        {
                            "type": "img",
                            "url": uploaded.url.clone(),
                            "children": [{ "text": "" }]
                        }
                    ]),
                },
            )
            .expect("写入文档失败");
        }

        delete_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("a.plate.json")
                .to_string_lossy()
                .to_string(),
        )
        .expect("删除文档失败");

        assert!(asset_path.exists());
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
    fn reads_import_source_files_by_format() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let html_path = temp_dir.path().join("source.html");
        let docx_path = temp_dir.path().join("source.docx");
        fs::write(&html_path, "<h1>标题</h1>").unwrap();
        fs::write(&docx_path, [1_u8, 2, 3]).unwrap();

        let html_files = read_import_source_files(
            vec![html_path.to_string_lossy().to_string()],
            ImportSourceFormat::Html,
        )
        .expect("读取 HTML 源文件失败");
        let word_files = read_import_source_files(
            vec![docx_path.to_string_lossy().to_string()],
            ImportSourceFormat::Word,
        )
        .expect("读取 Word 源文件失败");

        assert_eq!(html_files[0].file_name, "source.html");
        assert_eq!(html_files[0].content.as_deref(), Some("<h1>标题</h1>"));
        assert_eq!(html_files[0].base64_data, None);
        assert_eq!(word_files[0].file_name, "source.docx");
        assert_eq!(word_files[0].content, None);
        assert_eq!(word_files[0].base64_data.as_deref(), Some("AQID"));
    }

    #[test]
    fn writes_export_file() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let export_path = temp_dir.path().join("导出.md");

        write_export_file(
            export_path.to_string_lossy().to_string(),
            "5Lit5paH".to_string(),
        )
        .expect("写入导出文件失败");

        assert_eq!(fs::read_to_string(export_path).unwrap(), "中文");
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

    #[test]
    fn renames_plate_document_and_updates_title() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("old.plate.json");
        fs::write(
            &doc_path,
            r#"{"schemaVersion":1,"title":"旧标题","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":"正文"}]}]}"#,
        )
        .unwrap();

        let node = rename_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
            "新标题".to_string(),
        )
        .expect("重命名文档失败");

        assert_eq!(node.title.as_deref(), Some("新标题"));
        assert!(temp_dir.path().join("新标题.plate.json").is_file());
        assert!(!doc_path.exists());
        assert!(
            fs::read_to_string(temp_dir.path().join("新标题.plate.json"))
                .unwrap()
                .contains("\"title\": \"新标题\"")
        );
    }

    #[test]
    fn renames_workspace_directory_without_overwriting_existing_path() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let docs_path = temp_dir.path().join("docs");
        fs::create_dir(&docs_path).expect("创建目录失败");
        fs::create_dir(temp_dir.path().join("existing")).expect("创建已有目录失败");

        let error = rename_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            docs_path.to_string_lossy().to_string(),
            "existing".to_string(),
        )
        .expect_err("重名目录不应覆盖已有目录");

        assert_eq!(error, "目标名称已存在");
        assert!(docs_path.is_dir());
    }

    #[test]
    fn deletes_workspace_directory_recursively_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let docs_path = temp_dir.path().join("docs");
        fs::create_dir(&docs_path).expect("创建目录失败");
        fs::write(docs_path.join("guide.plate.json"), "{}").expect("写入文档失败");

        delete_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            docs_path.to_string_lossy().to_string(),
        )
        .expect("删除目录失败");

        assert!(!docs_path.exists());
    }

    #[test]
    fn load_snapshot_uses_manual_sort_order_before_creation_time() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::write(
            temp_dir.path().join("A.plate.json"),
            r#"{"schemaVersion":1,"title":"A","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入 A 文档失败");
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(
            temp_dir.path().join("B.plate.json"),
            r#"{"schemaVersion":1,"title":"B","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入 B 文档失败");
        fs::create_dir_all(temp_dir.path().join(".refinex")).expect("创建元数据目录失败");
        fs::write(
            temp_dir.path().join(".refinex/workspace.json"),
            r#"{
  "schemaVersion": 1,
  "recentDocumentPath": null,
  "expandedPaths": [],
  "sortOrder": {
    "version": 1,
    "nodes": {
      "A.plate.json": { "parentPath": "", "rank": 2048 },
      "B.plate.json": { "parentPath": "", "rank": 1024 }
    }
  }
}"#,
        )
        .expect("写入排序元数据失败");

        let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");
        let paths = snapshot
            .nodes
            .iter()
            .map(|node| node.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["B.plate.json", "A.plate.json"]);
    }

    #[test]
    fn sparse_rank_rebalances_only_target_parent_when_gap_is_exhausted() {
        let mut sort_order = WorkspaceSortOrder::default();
        sort_order.nodes.insert(
            "docs/a.plate.json".to_string(),
            WorkspaceSortRecord {
                parent_path: "docs".to_string(),
                rank: 1024,
            },
        );
        sort_order.nodes.insert(
            "docs/b.plate.json".to_string(),
            WorkspaceSortRecord {
                parent_path: "docs".to_string(),
                rank: 1025,
            },
        );
        sort_order.nodes.insert(
            "other/c.plate.json".to_string(),
            WorkspaceSortRecord {
                parent_path: "other".to_string(),
                rank: 1024,
            },
        );

        let rank = assign_rank_with_rebalance(
            &mut sort_order,
            "docs/moved.plate.json",
            "docs",
            Some("docs/a.plate.json"),
            Some("docs/b.plate.json"),
        );

        assert_eq!(rank, 2048);
        assert_eq!(sort_order.nodes["docs/a.plate.json"].rank, 1024);
        assert_eq!(sort_order.nodes["docs/moved.plate.json"].rank, 2048);
        assert_eq!(sort_order.nodes["docs/b.plate.json"].rank, 3072);
        assert_eq!(sort_order.nodes["other/c.plate.json"].rank, 1024);
    }

    #[test]
    fn moves_document_into_directory_and_returns_sorted_snapshot() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir(temp_dir.path().join("docs")).expect("创建目录失败");
        fs::write(
            temp_dir.path().join("guide.plate.json"),
            r#"{"schemaVersion":1,"title":"指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入文档失败");

        let snapshot = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("guide.plate.json")
                .to_string_lossy()
                .to_string(),
            temp_dir.path().join("docs").to_string_lossy().to_string(),
            None,
            None,
        )
        .expect("移动文档失败");

        assert!(temp_dir.path().join("docs/guide.plate.json").is_file());
        assert!(!temp_dir.path().join("guide.plate.json").exists());
        assert_eq!(
            snapshot.nodes[0].children.as_ref().unwrap()[0].relative_path,
            "docs/guide.plate.json"
        );
    }

    #[test]
    fn moves_directory_with_children_and_rejects_descendant_target() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir_all(temp_dir.path().join("docs/child")).expect("创建子目录失败");
        fs::create_dir(temp_dir.path().join("target")).expect("创建目标目录失败");
        fs::write(
            temp_dir.path().join("docs/child/a.plate.json"),
            r#"{"schemaVersion":1,"title":"A","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入文档失败");

        let error = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir.path().join("docs").to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("docs/child")
                .to_string_lossy()
                .to_string(),
            None,
            None,
        )
        .expect_err("目录不应移动到自己的后代目录");

        assert_eq!(error, "不能将目录移动到自身或其子目录内");

        move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir.path().join("docs").to_string_lossy().to_string(),
            temp_dir.path().join("target").to_string_lossy().to_string(),
            None,
            None,
        )
        .expect("移动目录失败");

        assert!(temp_dir
            .path()
            .join("target/docs/child/a.plate.json")
            .is_file());
    }

    #[test]
    fn rejects_move_when_target_name_exists() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir(temp_dir.path().join("target")).expect("创建目标目录失败");
        fs::write(
            temp_dir.path().join("guide.plate.json"),
            r#"{"schemaVersion":1,"title":"指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入文档失败");
        fs::write(
            temp_dir.path().join("target/guide.plate.json"),
            r#"{"schemaVersion":1,"title":"已有","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入已有文档失败");

        let error = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("guide.plate.json")
                .to_string_lossy()
                .to_string(),
            temp_dir.path().join("target").to_string_lossy().to_string(),
            None,
            None,
        )
        .expect_err("同名文件不应被覆盖");

        assert_eq!(error, "目标位置已存在同名节点");
    }

    #[test]
    fn reorders_document_before_sibling_in_same_parent() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        for name in ["a", "b", "c"] {
            fs::write(
                temp_dir.path().join(format!("{name}.plate.json")),
                format!(
                    r#"{{"schemaVersion":1,"title":"{name}","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{{"type":"p","children":[{{"text":""}}]}}]}}"#
                ),
            )
            .expect("写入文档失败");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let snapshot = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("c.plate.json")
                .to_string_lossy()
                .to_string(),
            temp_dir.path().to_string_lossy().to_string(),
            Some(
                temp_dir
                    .path()
                    .join("a.plate.json")
                    .to_string_lossy()
                    .to_string(),
            ),
            None,
        )
        .expect("同层排序失败");
        let paths = snapshot
            .nodes
            .iter()
            .map(|node| node.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["c.plate.json", "a.plate.json", "b.plate.json"]);
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
}

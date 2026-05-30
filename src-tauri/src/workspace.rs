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

#[derive(Copy, Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceNodeKind {
    Directory,
    Document,
}

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
    matches!(file_name, "node_modules" | "target" | "dist" | "build")
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
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

fn to_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
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

        assert_eq!(
            document.path,
            doc_path.canonicalize().unwrap().to_string_lossy()
        );
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
        assert_eq!(
            meta.path,
            doc_path.canonicalize().unwrap().to_string_lossy()
        );
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
}

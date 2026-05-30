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
    matches!(file_name, "node_modules" | "target" | "dist" | "build")
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
}

use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

const MAX_GIT_OUTPUT_BYTES: usize = 1024 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitProbe {
    pub git_available: bool,
    pub is_repository: bool,
    pub root_path: String,
    pub branch: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandOutput {
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub fn git_probe(root_path: String) -> Result<GitProbe, String> {
    let root = canonical_root(&root_path)?;
    let git_available = Command::new("git").arg("--version").output().is_ok();

    if !git_available {
        return Ok(GitProbe {
            git_available: false,
            is_repository: false,
            root_path: root.to_string_lossy().to_string(),
            branch: None,
        });
    }

    let is_repository = run_git(&root, &["rev-parse", "--is-inside-work-tree"])
        .map(|output| output.stdout.trim() == "true")
        .unwrap_or(false);
    let branch = if is_repository {
        run_git(&root, &["branch", "--show-current"])
            .ok()
            .map(|output| output.stdout.trim().to_string())
            .filter(|value| !value.is_empty())
    } else {
        None
    };

    Ok(GitProbe {
        git_available,
        is_repository,
        root_path: root.to_string_lossy().to_string(),
        branch,
    })
}

#[tauri::command]
pub fn git_init(root_path: String) -> Result<GitProbe, String> {
    let root = canonical_root(&root_path)?;
    run_git(&root, &["init"])?;
    git_probe(root.to_string_lossy().to_string())
}

pub fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;

    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }

    Ok(root)
}

pub fn validate_repo_relative_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("路径不安全：路径不能为空".to_string());
    }

    let relative = Path::new(path);

    if relative.is_absolute() {
        return Err("路径不安全：不允许绝对路径".to_string());
    }

    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("路径不安全：不允许跳出工作区".to_string());
    }

    Ok(root.join(relative))
}

fn run_git(root: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|_| "未检测到 Git 命令".to_string())?;

    let stdout = limited_output(output.stdout)?;
    let stderr = limited_output(output.stderr)?;

    if !output.status.success() {
        return Err(format_git_error(&stderr));
    }

    Ok(GitCommandOutput { stdout, stderr })
}

fn limited_output(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > MAX_GIT_OUTPUT_BYTES {
        return Err("Git 输出过大".to_string());
    }

    String::from_utf8(bytes).map_err(|_| "Git 输出不是有效 UTF-8".to_string())
}

fn format_git_error(stderr: &str) -> String {
    let message = stderr.trim();

    if message.is_empty() {
        "Git 命令执行失败".to_string()
    } else {
        format!("Git 命令执行失败：{message}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rejects_absolute_repo_relative_path() {
        let root = tempdir().expect("temp root");
        let error = validate_repo_relative_path(root.path(), "/tmp/file.txt").unwrap_err();

        assert!(error.contains("路径不安全"));
    }

    #[test]
    fn rejects_parent_traversal_path() {
        let root = tempdir().expect("temp root");
        let error = validate_repo_relative_path(root.path(), "../file.txt").unwrap_err();

        assert!(error.contains("路径不安全"));
    }

    #[test]
    fn allows_workspace_relative_path() {
        let root = tempdir().expect("temp root");
        let validated = validate_repo_relative_path(root.path(), "docs/a.md").unwrap();

        assert_eq!(validated, root.path().join("docs/a.md"));
    }

    #[test]
    fn probes_non_repository_workspace() {
        let root = tempdir().expect("temp root");
        fs::create_dir_all(root.path().join(".refinex")).expect("metadata dir");

        let probe = git_probe(root.path().to_string_lossy().to_string()).unwrap();

        assert!(probe.git_available);
        assert!(!probe.is_repository);
        assert_eq!(
            probe.root_path,
            root.path().canonicalize().unwrap().to_string_lossy()
        );
    }
}

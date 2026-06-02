use portable_pty::{
    native_pty_system, Child, CommandBuilder, MasterPty, PtySize,
};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const MAX_COLS: u16 = 300;
const MAX_ROWS: u16 = 120;

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

pub struct TerminalSession {
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub cwd: String,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDataEvent {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalErrorEvent {
    pub session_id: String,
    pub message: String,
}

#[derive(Debug)]
struct ShellCommand {
    program: PathBuf,
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    root_path: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalSessionInfo, String> {
    let root = validate_terminal_root(&root_path)?;
    let shell = default_shell();
    let (cols, rows) = normalize_terminal_size(cols, rows);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("创建终端失败: {error}"))?;
    let mut command = CommandBuilder::new(&shell.program);

    command.cwd(&root);
    command.env("TERM", "xterm-256color");
    command.env("TERM_PROGRAM", "RefinexWiki");

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("启动 Shell 失败: {error}"))?;
    drop(pair.slave);

    let session_id = Uuid::new_v4().to_string();
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("读取终端输出失败: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("写入终端失败: {error}"))?;

    spawn_reader_thread(app, session_id.clone(), reader);

    state
        .sessions
        .lock()
        .map_err(|_| "终端状态锁已损坏".to_string())?
        .insert(
            session_id.clone(),
            TerminalSession {
                writer,
                child,
                master: pair.master,
            },
        );

    Ok(TerminalSessionInfo {
        id: session_id,
        cwd: root.to_string_lossy().to_string(),
        shell: shell.program.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "终端状态锁已损坏".to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "终端会话不存在".to_string())?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| format!("写入终端失败: {error}"))?;
    session
        .writer
        .flush()
        .map_err(|error| format!("刷新终端输入失败: {error}"))
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let (cols, rows) = normalize_terminal_size(cols, rows);
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "终端状态锁已损坏".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "终端会话不存在".to_string())?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("调整终端尺寸失败: {error}"))
}

#[tauri::command]
pub fn terminal_kill(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "终端状态锁已损坏".to_string())?;
    let mut session = sessions
        .remove(&session_id)
        .ok_or_else(|| "终端会话不存在".to_string())?;

    session
        .child
        .kill()
        .map_err(|error| format!("关闭终端失败: {error}"))
}

fn spawn_reader_thread(app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let _ = app.emit(
                        "terminal:exit",
                        TerminalExitEvent {
                            session_id: session_id.clone(),
                            code: None,
                        },
                    );
                    break;
                }
                Ok(len) => {
                    let data = String::from_utf8_lossy(&buffer[..len]).to_string();
                    let _ = app.emit(
                        "terminal:data",
                        TerminalDataEvent {
                            session_id: session_id.clone(),
                            data,
                        },
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "terminal:error",
                        TerminalErrorEvent {
                            session_id: session_id.clone(),
                            message: format!("读取终端输出失败: {error}"),
                        },
                    );
                    break;
                }
            }
        }
    });
}

fn normalize_terminal_size(cols: u16, rows: u16) -> (u16, u16) {
    let cols = if cols == 0 {
        DEFAULT_COLS
    } else {
        cols.min(MAX_COLS)
    };
    let rows = if rows == 0 {
        DEFAULT_ROWS
    } else {
        rows.min(MAX_ROWS)
    };

    (cols, rows)
}

fn validate_terminal_root(root_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;

    if !root.is_dir() {
        return Err("工作区路径不是目录".to_string());
    }

    Ok(root)
}

fn default_shell() -> ShellCommand {
    if cfg!(windows) {
        return ShellCommand {
            program: PathBuf::from("powershell.exe"),
        };
    }

    if let Some(shell) = env::var_os("SHELL").filter(|value| !value.is_empty()) {
        return ShellCommand {
            program: PathBuf::from(shell),
        };
    }

    if cfg!(target_os = "macos") {
        ShellCommand {
            program: PathBuf::from("/bin/zsh"),
        }
    } else {
        ShellCommand {
            program: PathBuf::from("/bin/sh"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_terminal_size_clamps_invalid_values() {
        assert_eq!(normalize_terminal_size(0, 0), (80, 24));
        assert_eq!(normalize_terminal_size(500, 200), (300, 120));
        assert_eq!(normalize_terminal_size(120, 40), (120, 40));
    }

    #[test]
    fn validate_terminal_root_rejects_missing_directory() {
        let result = validate_terminal_root("/path/that/does/not/exist");

        assert!(result.is_err());
    }

    #[test]
    fn default_shell_has_a_program_name() {
        let shell = default_shell();

        assert!(!shell.program.as_os_str().is_empty());
    }
}

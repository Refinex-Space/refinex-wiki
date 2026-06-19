---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an IDEA-like bottom terminal panel for Refinex Wiki with real PTY-backed shell sessions, multi-tab support, workspace-root cwd, theme-aware xterm rendering, and the same layout quality as the existing Git log drawer.

**Architecture:** The frontend owns panel layout, tabs, theme mapping, xterm lifecycle, and IPC wrappers. The Tauri Rust backend owns PTY sessions through `portable-pty`, validates workspace paths, streams PTY output to the frontend, and cleans up sessions. `WorkspaceLayout` switches between Git log and terminal as mutually exclusive bottom panels.

**Tech Stack:** Next.js 16, React 19, Vitest, Tauri v2, Rust 2021, `portable-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`.

---

## File Structure

- Create `src-tauri/src/terminal.rs`: PTY session state, shell selection, Tauri commands, event payloads, tests.
- Modify `src-tauri/src/lib.rs`: register `terminal` module, managed state, and terminal commands.
- Modify `src-tauri/Cargo.toml`: add `portable-pty`, `uuid`, and `parking_lot` if needed; prefer standard `Mutex` unless borrow complexity requires `parking_lot`.
- Modify `components/workspace/workspace-types.ts`: add terminal session/event types.
- Modify `components/workspace/workspace-api.ts`: add terminal invoke wrappers and event listeners.
- Create `components/workspace/terminal-panel.tsx`: bottom panel shell, tabs, toolbar, empty/error states.
- Create `components/workspace/xterm-terminal.tsx`: client-only xterm renderer and lifecycle binding.
- Modify `components/workspace/workspace-layout.tsx`: add terminal icon, terminal bottom mode, terminal height storage, mutual switching with Git log.
- Modify `app/globals.css`: xterm import-compatible styles and thin terminal scrollbar polish.
- Create `components/workspace/__tests__/terminal-panel.test.tsx`: panel UI tests.
- Create `components/workspace/__tests__/xterm-terminal.test.tsx`: mocked xterm lifecycle tests.
- Modify `components/workspace/__tests__/workspace-api.test.ts`: terminal API wrapper tests.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`: terminal icon and bottom panel integration tests.

---

### Task 1: Add Frontend Terminal Types and API Wrappers

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Write failing API wrapper tests**

Append this test block to `components/workspace/__tests__/workspace-api.test.ts` and extend the import list with the terminal API functions:

```ts
import {
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
} from '../workspace-api';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('workspace-api terminal commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('wraps terminal Tauri commands', async () => {
    invokeMock
      .mockResolvedValueOnce({
        id: 'term-1',
        cwd: '/repo',
        shell: '/bin/zsh',
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(terminalSpawn('/repo', 120, 32)).resolves.toEqual({
      id: 'term-1',
      cwd: '/repo',
      shell: '/bin/zsh',
    });
    await terminalWrite('term-1', 'git status\r');
    await terminalResize('term-1', 100, 24);
    await terminalKill('term-1');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'terminal_spawn', {
      rootPath: '/repo',
      cols: 120,
      rows: 32,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'terminal_write', {
      sessionId: 'term-1',
      data: 'git status\r',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'terminal_resize', {
      sessionId: 'term-1',
      cols: 100,
      rows: 24,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'terminal_kill', {
      sessionId: 'term-1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because terminal API functions and event listener wrappers do not exist.

- [ ] **Step 3: Add terminal types**

Add these exports to `components/workspace/workspace-types.ts`:

```ts
export interface TerminalSessionInfo {
  id: string;
  cwd: string;
  shell: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  code: number | null;
}

export interface TerminalErrorEvent {
  sessionId: string;
  message: string;
}
```

- [ ] **Step 4: Add terminal API wrappers**

Add imports and functions in `components/workspace/workspace-api.ts`:

```ts
import type { UnlistenFn } from '@tauri-apps/api/event';
```

```ts
export async function terminalSpawn(
  rootPath: string,
  cols: number,
  rows: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<TerminalSessionInfo>('terminal_spawn', {
    rootPath,
    cols,
    rows,
  });
}

export async function terminalWrite(sessionId: string, data: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('terminal_write', { sessionId, data });
}

export async function terminalResize(
  sessionId: string,
  cols: number,
  rows: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('terminal_resize', { sessionId, cols, rows });
}

export async function terminalKill(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('terminal_kill', { sessionId });
}

export async function listenTerminalData(
  handler: (event: TerminalDataEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<TerminalDataEvent>('terminal:data', (event) =>
    handler(event.payload),
  );
}

export async function listenTerminalExit(
  handler: (event: TerminalExitEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<TerminalExitEvent>('terminal:exit', (event) =>
    handler(event.payload),
  );
}

export async function listenTerminalError(
  handler: (event: TerminalErrorEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<TerminalErrorEvent>('terminal:error', (event) =>
    handler(event.payload),
  );
}
```

Also add the new terminal types to the existing type import list from `workspace-types`.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat: 添加终端 IPC 前端封装"
```

---

### Task 2: Add Rust PTY Backend Core

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/terminal.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add dependencies**

Modify `src-tauri/Cargo.toml`:

```toml
portable-pty = "0.9"
uuid = { version = "1.11", features = ["v4"] }
```

- [ ] **Step 2: Write backend unit tests**

Create `src-tauri/src/terminal.rs` with tests first:

```rust
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

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
```

- [ ] **Step 3: Run Rust tests to verify they fail**

Run:

```bash
cd src-tauri && cargo test terminal
```

Expected: FAIL because helper functions and structs are not implemented.

- [ ] **Step 4: Implement Rust terminal backend**

Replace `src-tauri/src/terminal.rs` with:

```rust
use portable_pty::{native_pty_system, CommandBuilder, Child, MasterPty, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
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
    child: Box<dyn Child + Send + Sync>,
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
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("读取终端输出失败: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("写入终端失败: {error}"))?;

    spawn_reader_thread(app.clone(), session_id.clone(), reader);

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
    let cols = if cols == 0 { DEFAULT_COLS } else { cols.min(MAX_COLS) };
    let rows = if rows == 0 { DEFAULT_ROWS } else { rows.min(MAX_ROWS) };

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
```

- [ ] **Step 5: Register module and commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod terminal;
```

Add managed state before `invoke_handler`:

```rust
.manage(terminal::TerminalState::default())
```

Add commands:

```rust
terminal::terminal_spawn,
terminal::terminal_write,
terminal::terminal_resize,
terminal::terminal_kill,
```

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cd src-tauri && cargo test terminal
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/terminal.rs src-tauri/src/lib.rs
git commit -m "feat: 添加终端 PTY 后端"
```

---

### Task 3: Add Terminal Panel UI Without xterm Runtime

**Files:**
- Create: `components/workspace/terminal-panel.tsx`
- Create: `components/workspace/__tests__/terminal-panel.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `components/workspace/__tests__/terminal-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TerminalPanel } from '../terminal-panel';

describe('TerminalPanel', () => {
  it('renders IDEA-like header, workspace name, and active tab', () => {
    render(
      <TerminalPanel
        activeTabId="term-1"
        error={null}
        height={360}
        isTauriRuntime
        rootName="repo"
        rootPath="/repo"
        tabs={[
          {
            cwd: '/repo',
            id: 'term-1',
            status: 'running',
            title: '本地',
          },
        ]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
      />
    );

    expect(screen.getByText('终端')).toBeTruthy();
    expect(screen.getByText('repo')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /本地/ })).toBeTruthy();
  });

  it('creates, selects, and closes tabs', async () => {
    const user = userEvent.setup();
    const onNewTab = vi.fn();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <TerminalPanel
        activeTabId="term-1"
        error={null}
        height={360}
        isTauriRuntime
        rootName="repo"
        rootPath="/repo"
        tabs={[
          { cwd: '/repo', id: 'term-1', status: 'running', title: '本地' },
          { cwd: '/repo', id: 'term-2', status: 'running', title: '本地 2' },
        ]}
        onClose={vi.fn()}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        onSelectTab={onSelectTab}
      />
    );

    await user.click(screen.getByRole('button', { name: '新建终端标签页' }));
    await user.click(screen.getByRole('tab', { name: /本地 2/ }));
    await user.click(screen.getByRole('button', { name: '关闭终端标签页 本地 2' }));

    expect(onNewTab).toHaveBeenCalledTimes(1);
    expect(onSelectTab).toHaveBeenCalledWith('term-2');
    expect(onCloseTab).toHaveBeenCalledWith('term-2');
  });

  it('renders empty and unavailable states', () => {
    const { rerender } = render(
      <TerminalPanel
        activeTabId={null}
        error={null}
        height={360}
        isTauriRuntime
        rootName="repo"
        rootPath={null}
        tabs={[]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
      />
    );

    expect(screen.getByText('打开工作区后可以启动终端。')).toBeTruthy();

    rerender(
      <TerminalPanel
        activeTabId={null}
        error={null}
        height={360}
        isTauriRuntime={false}
        rootName="repo"
        rootPath="/repo"
        tabs={[]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
      />
    );

    expect(screen.getByText('终端仅在桌面应用中可用。')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/terminal-panel.test.tsx
```

Expected: FAIL because `TerminalPanel` does not exist.

- [ ] **Step 3: Implement `TerminalPanel` shell**

Create `components/workspace/terminal-panel.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Plus, SquareTerminal, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export type TerminalTabStatus = 'starting' | 'running' | 'exited' | 'error';

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  status: TerminalTabStatus;
}

interface TerminalPanelProps {
  activeTabId: string | null;
  error: string | null;
  height: number;
  isTauriRuntime: boolean;
  rootName: string;
  rootPath: string | null;
  tabs: TerminalTab[];
  children?: React.ReactNode;
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onSelectTab: (tabId: string) => void;
}

export function TerminalPanel({
  activeTabId,
  error,
  height,
  isTauriRuntime,
  rootName,
  rootPath,
  tabs,
  children,
  onClose,
  onCloseTab,
  onNewTab,
  onSelectTab,
}: TerminalPanelProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <section
      className="flex shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm"
      data-testid="terminal-panel"
      style={{ height }}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SquareTerminal size={16} />
            <span>终端</span>
            <span className="text-xs font-normal text-muted-foreground">
              {rootName}
            </span>
          </div>
          <div className="ml-2 flex min-w-0 items-center gap-1" role="tablist">
            {tabs.map((tab) => (
              <button
                aria-selected={tab.id === activeTabId}
                className={cn(
                  'group inline-flex h-7 max-w-48 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground',
                  tab.id === activeTabId && 'bg-muted text-foreground',
                )}
                key={tab.id}
                role="tab"
                type="button"
                onClick={() => onSelectTab(tab.id)}
              >
                <span className="truncate">{tab.title}</span>
                {tab.status === 'exited' ? (
                  <span className="text-[10px] text-muted-foreground">已退出</span>
                ) : null}
                <span
                  aria-label={`关闭终端标签页 ${tab.title}`}
                  className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-background"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="新建终端标签页"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isTauriRuntime || !rootPath}
            type="button"
            onClick={onNewTab}
          >
            <Plus size={15} />
          </button>
          <button
            aria-label="关闭终端面板"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 bg-background">
        {!isTauriRuntime ? (
          <TerminalEmptyState text="终端仅在桌面应用中可用。" />
        ) : !rootPath ? (
          <TerminalEmptyState text="打开工作区后可以启动终端。" />
        ) : activeTab ? (
          children
        ) : (
          <TerminalEmptyState text="点击加号新建一个本地终端。" />
        )}
      </div>
    </section>
  );
}

function TerminalEmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:run -- components/workspace/__tests__/terminal-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/terminal-panel.tsx components/workspace/__tests__/terminal-panel.test.tsx
git commit -m "feat: 添加终端底部面板 UI"
```

---

### Task 4: Add xterm Renderer Component

**Files:**
- Modify: `package.json`
- Create: `components/workspace/xterm-terminal.tsx`
- Create: `components/workspace/__tests__/xterm-terminal.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Install xterm dependencies**

Run:

```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

Expected: `package.json` and lockfile update.

- [ ] **Step 2: Write xterm lifecycle tests**

Create `components/workspace/__tests__/xterm-terminal.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { XtermTerminal } from '../xterm-terminal';

const writeMock = vi.fn();
const openMock = vi.fn();
const disposeMock = vi.fn();
const loadAddonMock = vi.fn();
const onDataMock = vi.fn();
const resizeMock = vi.fn();
const fitMock = vi.fn();
const terminalInstances: Array<{ options: Record<string, unknown> }> = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation((options) => {
    const instance = {
      cols: 120,
      rows: 32,
      options,
      dispose: disposeMock,
      loadAddon: loadAddonMock,
      onData: onDataMock,
      open: openMock,
      resize: resizeMock,
      write: writeMock,
    };

    terminalInstances.push(instance);

    return instance;
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: fitMock,
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}));

describe('XtermTerminal', () => {
  afterEach(() => {
    writeMock.mockReset();
    openMock.mockReset();
    disposeMock.mockReset();
    loadAddonMock.mockReset();
    onDataMock.mockReset();
    resizeMock.mockReset();
    fitMock.mockReset();
    terminalInstances.length = 0;
  });

  it('opens xterm, binds input, writes output, and cleans up', async () => {
    const onData = vi.fn();
    const onResize = vi.fn();
    const { rerender, unmount } = render(
      <XtermTerminal
        isActive
        output="hello"
        sessionId="term-1"
        themeMode="light"
        onData={onData}
        onResize={onResize}
      />,
    );

    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    expect(loadAddonMock).toHaveBeenCalledTimes(2);
    expect(writeMock).toHaveBeenCalledWith('hello');

    const dataHandler = onDataMock.mock.calls[0][0] as (value: string) => void;
    dataHandler('pwd\r');
    expect(onData).toHaveBeenCalledWith('term-1', 'pwd\r');

    rerender(
      <XtermTerminal
        isActive
        output="world"
        sessionId="term-1"
        themeMode="dark"
        onData={onData}
        onResize={onResize}
      />,
    );
    expect(writeMock).toHaveBeenCalledWith('world');
    expect(terminalInstances[0].options.theme).toBeTruthy();

    unmount();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/xterm-terminal.test.tsx
```

Expected: FAIL because `XtermTerminal` does not exist.

- [ ] **Step 4: Implement xterm renderer**

Create `components/workspace/xterm-terminal.tsx`:

```tsx
'use client';

import * as React from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface XtermTerminalProps {
  isActive: boolean;
  output: string;
  sessionId: string;
  themeMode: 'dark' | 'light';
  onData: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
}

export function XtermTerminal({
  isActive,
  output,
  sessionId,
  themeMode,
  onData,
  onResize,
}: XtermTerminalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<Terminal | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const lastOutputRef = React.useRef('');

  React.useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: getTerminalTheme(themeMode),
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(containerRef.current);
    fitAddon.fit();
    onResize(sessionId, terminal.cols, terminal.rows);
    terminal.onData((data) => onData(sessionId, data));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onData, onResize, sessionId, themeMode]);

  React.useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    terminal.options.theme = getTerminalTheme(themeMode);
  }, [themeMode]);

  React.useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal || !output) {
      return;
    }

    const previous = lastOutputRef.current;
    const nextChunk = output.startsWith(previous)
      ? output.slice(previous.length)
      : output;

    if (nextChunk) {
      terminal.write(nextChunk);
    }

    lastOutputRef.current = output;
  }, [output]);

  React.useEffect(() => {
    if (!isActive || !containerRef.current) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;

      if (!terminal || !fitAddon) {
        return;
      }

      fitAddon.fit();
      onResize(sessionId, terminal.cols, terminal.rows);
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [isActive, onResize, sessionId]);

  return (
    <div
      className="h-full min-h-0 bg-background px-3 py-2 terminal-surface"
      data-testid={`xterm-terminal-${sessionId}`}
      ref={containerRef}
    />
  );
}

function getTerminalTheme(themeMode: 'dark' | 'light') {
  if (themeMode === 'dark') {
    return {
      background: '#0a0a0a',
      foreground: '#ededed',
      cursor: '#ededed',
      selectionBackground: '#2f4268',
      black: '#111111',
      red: '#ff6b6b',
      green: '#7bd88f',
      yellow: '#f7d774',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#d7d7d7',
    };
  }

  return {
    background: '#ffffff',
    foreground: '#171717',
    cursor: '#171717',
    selectionBackground: '#cfe1ff',
    black: '#171717',
    red: '#d12f2f',
    green: '#237a3b',
    yellow: '#8a6500',
    blue: '#1f63d8',
    magenta: '#7c3fb8',
    cyan: '#0d7282',
    white: '#f8f8f8',
  };
}
```

- [ ] **Step 5: Add terminal scrollbar polish**

Add to `app/globals.css`:

```css
  .terminal-surface .xterm-viewport {
    scrollbar-color: color-mix(in oklab, var(--muted-foreground) 22%, transparent) transparent;
    scrollbar-width: thin;
  }

  .terminal-surface .xterm-viewport::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .terminal-surface .xterm-viewport::-webkit-scrollbar-track {
    background: transparent;
  }

  .terminal-surface .xterm-viewport::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: color-mix(in oklab, var(--muted-foreground) 20%, transparent);
    background-clip: padding-box;
  }
```

- [ ] **Step 6: Run xterm test**

Run:

```bash
npm run test:run -- components/workspace/__tests__/xterm-terminal.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json app/globals.css components/workspace/xterm-terminal.tsx components/workspace/__tests__/xterm-terminal.test.tsx
git commit -m "feat: 添加 xterm 终端渲染器"
```

---

### Task 5: Wire Terminal Panel into Workspace Layout

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Extend workspace layout tests**

In `components/workspace/__tests__/workspace-layout.test.tsx`, add terminal API mocks to the existing `vi.mock('../workspace-api')` block and mock `TerminalPanel`/`XtermTerminal` for integration tests:

```ts
terminalKill: vi.fn(),
terminalResize: vi.fn(),
terminalSpawn: vi.fn(),
terminalWrite: vi.fn(),
listenTerminalData: vi.fn(),
listenTerminalError: vi.fn(),
listenTerminalExit: vi.fn(),
```

Add this component mock near the existing `PlateEditor` mock:

```ts
vi.mock('../xterm-terminal', () => ({
  XtermTerminal: ({ sessionId, output }: { sessionId: string; output: string }) => (
    <div data-testid={`mock-xterm-${sessionId}`}>{output}</div>
  ),
}));
```

Add tests:

```tsx
it('opens the terminal bottom panel from the left rail', async () => {
  const user = userEvent.setup();

  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开终端' }));

  expect(screen.getByTestId('terminal-panel')).toBeTruthy();
  expect(screen.getByText('终端')).toBeTruthy();
  expect(screen.getByText('repo')).toBeTruthy();
});

it('places terminal above Git history in the bottom tool area', () => {
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  const terminalButton = screen.getByRole('button', { name: '打开终端' });
  const gitLogButton = screen.getByRole('button', { name: '打开 Git 日志' });

  expect(
    terminalButton.compareDocumentPosition(gitLogButton) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because terminal layout integration does not exist.

- [ ] **Step 3: Implement bottom panel mode and terminal icon**

Modify `components/workspace/workspace-layout.tsx`:

- Import `SquareTerminal`.
- Import `TerminalPanel`, `TerminalTab`, and `XtermTerminal`.
- Add `BottomPanelMode = 'git-log' | 'terminal' | null`.
- Replace `gitLogOpen` with `bottomPanelMode === 'git-log'`.
- Add terminal state:

```ts
const [bottomPanelMode, setBottomPanelMode] =
  React.useState<BottomPanelMode>(null);
const [terminalTabs, setTerminalTabs] = React.useState<TerminalTab[]>([]);
const [terminalActiveTabId, setTerminalActiveTabId] =
  React.useState<string | null>(null);
const [terminalOutputs, setTerminalOutputs] = React.useState<Record<string, string>>({});
const [terminalError, setTerminalError] = React.useState<string | null>(null);
```

- Add terminal height storage:

```ts
terminalHeight: 'refinex-wiki:workspace:terminal-height',
```

Use `useStoredPanelWidth` with `GIT_LOG_HEIGHT` bounds for `terminalHeight`.

- Add toolbar button above Git history:

```tsx
<button
  aria-label={bottomPanelMode === 'terminal' ? '关闭终端' : '打开终端'}
  className={cn(
    'mt-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
    bottomPanelMode === 'terminal' &&
      'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
  )}
  type="button"
  onClick={toggleTerminalPanel}
>
  <SquareTerminal size={17} />
</button>
```

Remove `mt-auto` from the Git history button so it sits below terminal.

- [ ] **Step 4: Implement terminal tab callbacks**

Add callbacks in `WorkspaceLayout`:

```ts
const createTerminalTab = React.useCallback(async () => {
  if (!workspaceRootPath || !isTauriRuntime) {
    return;
  }

  setTerminalError(null);

  try {
    const info = await terminalSpawn(workspaceRootPath, 120, 32);
    const title = terminalTabs.length === 0 ? '本地' : `本地 ${terminalTabs.length + 1}`;

    setTerminalTabs((current) => [
      ...current,
      {
        cwd: info.cwd,
        id: info.id,
        status: 'running',
        title,
      },
    ]);
    setTerminalOutputs((current) => ({ ...current, [info.id]: '' }));
    setTerminalActiveTabId(info.id);
  } catch (error) {
    setTerminalError(formatUnknownError(error));
  }
}, [isTauriRuntime, terminalTabs.length, workspaceRootPath]);

const toggleTerminalPanel = React.useCallback(() => {
  setBottomPanelMode((current) => {
    const next = current === 'terminal' ? null : 'terminal';

    if (next === 'terminal' && terminalTabs.length === 0) {
      void createTerminalTab();
    }

    return next;
  });
}, [createTerminalTab, terminalTabs.length]);
```

Add close/select/write/resize callbacks:

```ts
const handleTerminalCloseTab = React.useCallback((tabId: string) => {
  void terminalKill(tabId).catch((error) => setTerminalError(formatUnknownError(error)));
  setTerminalTabs((current) => current.filter((tab) => tab.id !== tabId));
  setTerminalOutputs((current) => {
    const next = { ...current };
    delete next[tabId];
    return next;
  });
  setTerminalActiveTabId((current) => {
    if (current !== tabId) {
      return current;
    }
    const nextTab = terminalTabs.find((tab) => tab.id !== tabId);
    return nextTab?.id ?? null;
  });
}, [terminalTabs]);

const handleTerminalData = React.useCallback((sessionId: string, data: string) => {
  void terminalWrite(sessionId, data).catch((error) =>
    setTerminalError(formatUnknownError(error)),
  );
}, []);

const handleTerminalResize = React.useCallback(
  (sessionId: string, cols: number, rows: number) => {
    void terminalResize(sessionId, cols, rows).catch((error) =>
      setTerminalError(formatUnknownError(error)),
    );
  },
  [],
);
```

Add event listeners:

```ts
React.useEffect(() => {
  if (!isTauriRuntime) {
    return;
  }

  let disposed = false;
  const unlisteners: Array<() => void> = [];

  void listenTerminalData(({ sessionId, data }) => {
    setTerminalOutputs((current) => ({
      ...current,
      [sessionId]: `${current[sessionId] ?? ''}${data}`,
    }));
  }).then((unlisten) => {
    if (disposed) {
      unlisten();
    } else {
      unlisteners.push(unlisten);
    }
  });

  void listenTerminalExit(({ sessionId }) => {
    setTerminalTabs((current) =>
      current.map((tab) =>
        tab.id === sessionId ? { ...tab, status: 'exited' } : tab,
      ),
    );
  }).then((unlisten) => {
    if (disposed) {
      unlisten();
    } else {
      unlisteners.push(unlisten);
    }
  });

  void listenTerminalError(({ message }) => setTerminalError(message)).then(
    (unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    },
  );

  return () => {
    disposed = true;
    unlisteners.forEach((unlisten) => unlisten());
  };
}, [isTauriRuntime]);
```

- [ ] **Step 5: Render terminal bottom panel**

Below the main editor row, render the resize handle and panel based on `bottomPanelMode`:

```tsx
{bottomPanelMode === 'terminal' ? (
  <WorkspaceHorizontalResizeHandle
    aria-label="调整终端高度"
    max={GIT_LOG_HEIGHT.max}
    min={GIT_LOG_HEIGHT.min}
    value={terminalHeight}
    onResize={setTerminalHeight}
  />
) : null}
{bottomPanelMode === 'terminal' ? (
  <TerminalPanel
    activeTabId={terminalActiveTabId}
    error={terminalError}
    height={terminalHeight}
    isTauriRuntime={isTauriRuntime}
    rootName={workspace.snapshot?.rootName ?? '工作区'}
    rootPath={workspaceRootPath}
    tabs={terminalTabs}
    onClose={() => setBottomPanelMode(null)}
    onCloseTab={handleTerminalCloseTab}
    onNewTab={() => void createTerminalTab()}
    onSelectTab={setTerminalActiveTabId}
  >
    {terminalTabs.map((tab) =>
      tab.id === terminalActiveTabId ? (
        <XtermTerminal
          isActive
          key={tab.id}
          output={terminalOutputs[tab.id] ?? ''}
          sessionId={tab.id}
          themeMode="light"
          onData={handleTerminalData}
          onResize={handleTerminalResize}
        />
      ) : null,
    )}
  </TerminalPanel>
) : null}
```

In the actual implementation, derive `themeMode` from `useTheme().resolvedTheme` in Task 6.

- [ ] **Step 6: Run workspace layout tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat: 接入终端底部面板"
```

---

### Task 6: Theme Integration and Session Lifecycle Hardening

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/xterm-terminal.tsx`
- Modify: `components/workspace/__tests__/xterm-terminal.test.tsx`

- [ ] **Step 1: Add theme assertions**

Extend `components/workspace/__tests__/xterm-terminal.test.tsx`:

```tsx
it('uses a dark terminal background when theme mode is dark', async () => {
  render(
    <XtermTerminal
      isActive
      output=""
      sessionId="term-dark"
      themeMode="dark"
      onData={vi.fn()}
      onResize={vi.fn()}
    />,
  );

  await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
  expect(terminalInstances[0].options.theme).toEqual(
    expect.objectContaining({
      background: '#0a0a0a',
      foreground: '#ededed',
    }),
  );
});
```

- [ ] **Step 2: Wire `next-themes` into layout**

In `components/workspace/workspace-layout.tsx`, import and use:

```ts
import { useTheme } from 'next-themes';
```

Inside `WorkspaceLayout`:

```ts
const { resolvedTheme } = useTheme();
const terminalThemeMode = resolvedTheme === 'dark' ? 'dark' : 'light';
```

Pass `terminalThemeMode` into `XtermTerminal`.

- [ ] **Step 3: Kill all terminal sessions on unmount**

Add cleanup in `WorkspaceLayout`:

```ts
React.useEffect(() => {
  return () => {
    terminalTabs.forEach((tab) => {
      void terminalKill(tab.id);
    });
  };
}, [terminalTabs]);
```

If this causes repeated cleanup due to changing dependency arrays, replace with a `terminalTabsRef` that is updated in an effect and read in the unmount-only cleanup.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/xterm-terminal.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/xterm-terminal.tsx components/workspace/__tests__/xterm-terminal.test.tsx
git commit -m "feat: 联动终端主题和生命周期"
```

---

### Task 7: End-to-End Verification and Build Fixes

**Files:**
- Modify files only if verification exposes concrete failures.

- [ ] **Step 1: Run full frontend tests**

Run:

```bash
npm run test:run
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run web build**

Run:

```bash
npm run build
```

Expected: PASS. If Next.js fails because xterm imports browser-only code during SSR, update `xterm-terminal.tsx` to dynamically import xterm inside `useEffect` and adjust the test mock to await the dynamic import path.

- [ ] **Step 4: Run Rust tests**

Run:

```bash
cd src-tauri && cargo test
```

Expected: PASS.

- [ ] **Step 5: Run desktop dev smoke test**

Run:

```bash
npm run desktop:dev
```

Manual checks:

- Click terminal icon above Git history icon.
- Terminal panel opens at the bottom with the same rounded panel style as Git log.
- Run `pwd`; output path equals current workspace root.
- Run `git status`; output appears inside terminal.
- Create a second tab; both tabs keep separate output.
- Toggle dark and light theme; terminal background and text remain consistent with the app.
- Resize bottom panel; terminal refits and prompt remains usable.
- Close a tab; the session stops and no stale output arrives.

- [ ] **Step 6: Final commit if fixes were needed**

If Step 1-5 required changes:

```bash
git add <changed-files>
git commit -m "fix: 完善终端面板验证问题"
```

If no changes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Left rail terminal icon above Git history: Task 5.
- Bottom panel matching Git log block: Task 3 and Task 5.
- Default cwd is workspace root: Task 2 and Task 5.
- Theme-aware light/dark terminal: Task 4 and Task 6.
- Multi-tab support: Task 3 and Task 5.
- PTY-backed interactive shell: Task 2.
- Lifecycle cleanup: Task 2 and Task 6.
- Tests and verification: Task 1 through Task 7.

Placeholder scan:

- Scan passed; every task contains concrete paths, commands, and code-level direction.

Type consistency:

- Frontend session type uses `id`, `cwd`, `shell`.
- Tauri command names use `terminal_spawn`, `terminal_write`, `terminal_resize`, `terminal_kill`.
- Event names use `terminal:data`, `terminal:exit`, `terminal:error`.
- Panel tab type uses `id`, `title`, `cwd`, `status`.

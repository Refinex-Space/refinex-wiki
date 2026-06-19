---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Git File Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IDE-like right-click actions for a single changed file in the Git panel.

**Architecture:** Backend file mutations stay in Tauri Git commands with repo-relative path validation. Frontend adds context-menu actions to `GitPanel`, while `WorkspaceLayout` owns state updates and command execution. Existing batch submit flow remains the single commit path.

**Tech Stack:** Next.js 16, React 19, Vitest, Testing Library, Tauri 2, Rust 2021, native `git` through `std::process::Command`.

---

## File Structure

- Modify `src-tauri/src/git.rs`: add `git_revert_file`, `git_delete_file`, safe file deletion helpers, and Rust tests.
- Modify `src-tauri/src/lib.rs`: register new Tauri commands.
- Modify `components/workspace/workspace-api.ts`: add `gitRevertFile` and `gitDeleteFile` wrappers.
- Modify `components/workspace/__tests__/workspace-api.test.ts`: assert new invoke wrappers.
- Modify `components/workspace/git-panel.tsx`: add context menu and confirmation dialogs for changed-file rows.
- Modify `components/workspace/__tests__/git-panel.test.tsx`: verify menu behavior and confirm actions.
- Modify `components/workspace/workspace-layout.tsx`: wire single-file callbacks to API calls and state refresh.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`: verify single-file callbacks integrate with backend wrappers.

## Task 1: Backend Single-File Git Commands

**Files:**
- Modify: `src-tauri/src/git.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/git.rs`

- [ ] **Step 1: Add failing Rust tests**

Add tests inside `src-tauri/src/git.rs` test module:

```rust
#[test]
fn reverts_tracked_file_changes() {
    let root = init_repo();
    fs::write(root.path().join("note.md"), "old").expect("note file");
    run_git(root.path(), &["add", "note.md"]).expect("add note");
    run_git(root.path(), &["commit", "-m", "init"]).expect("commit note");
    fs::write(root.path().join("note.md"), "new").expect("modify note");

    let status = git_revert_file(
        root.path().to_string_lossy().to_string(),
        "note.md".to_string(),
    )
    .unwrap();

    assert!(status.changes.is_empty());
    assert_eq!(fs::read_to_string(root.path().join("note.md")).unwrap(), "old");
}

#[test]
fn reverts_untracked_file_by_deleting_it() {
    let root = init_repo();
    fs::write(root.path().join("draft.md"), "draft").expect("draft file");

    let status = git_revert_file(
        root.path().to_string_lossy().to_string(),
        "draft.md".to_string(),
    )
    .unwrap();

    assert!(status.changes.is_empty());
    assert!(!root.path().join("draft.md").exists());
}

#[test]
fn deletes_tracked_file_with_git_rm() {
    let root = init_repo();
    fs::write(root.path().join("note.md"), "old").expect("note file");
    run_git(root.path(), &["add", "note.md"]).expect("add note");
    run_git(root.path(), &["commit", "-m", "init"]).expect("commit note");

    let status = git_delete_file(
        root.path().to_string_lossy().to_string(),
        "note.md".to_string(),
    )
    .unwrap();

    assert!(!root.path().join("note.md").exists());
    assert!(status
        .changes
        .iter()
        .any(|change| change.path == "note.md" && change.index_status == "D"));
}

#[test]
fn deletes_untracked_file_from_disk() {
    let root = init_repo();
    fs::write(root.path().join("draft.md"), "draft").expect("draft file");

    let status = git_delete_file(
        root.path().to_string_lossy().to_string(),
        "draft.md".to_string(),
    )
    .unwrap();

    assert!(status.changes.is_empty());
    assert!(!root.path().join("draft.md").exists());
}
```

- [ ] **Step 2: Run Rust tests to verify they fail**

Run:

```bash
cd src-tauri && cargo test git::tests --lib
```

Expected: FAIL because `git_revert_file` and `git_delete_file` are missing.

- [ ] **Step 3: Implement backend commands**

Add to `src-tauri/src/git.rs`:

```rust
#[tauri::command]
pub fn git_revert_file(root_path: String, path: String) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let target = validate_existing_repo_file_path(&root, &path)?;

    if is_untracked(&root, &path)? {
        delete_file_inside_root(&root, &target)?;
        return git_status(root.to_string_lossy().to_string());
    }

    let _ = git_unstage(root.to_string_lossy().to_string(), vec![path.clone()]);
    run_git(&root, &["restore", "--worktree", "--", path.as_str()])?;
    git_status(root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn git_delete_file(root_path: String, path: String) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let target = validate_existing_repo_file_path(&root, &path)?;

    if is_untracked(&root, &path)? {
        delete_file_inside_root(&root, &target)?;
    } else {
        run_git(&root, &["rm", "-f", "--", path.as_str()])?;
    }

    git_status(root.to_string_lossy().to_string())
}

fn validate_existing_repo_file_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let target = validate_repo_relative_path(root, path)?;
    let canonical = target
        .canonicalize()
        .map_err(|_| "文件不存在".to_string())?;

    if !canonical.starts_with(root) {
        return Err("路径不安全：不允许跳出工作区".to_string());
    }

    if !canonical.is_file() {
        return Err("目标不是文件".to_string());
    }

    Ok(canonical)
}

fn delete_file_inside_root(root: &Path, target: &Path) -> Result<(), String> {
    if !target.starts_with(root) {
        return Err("路径不安全：不允许跳出工作区".to_string());
    }

    std::fs::remove_file(target).map_err(|_| "无法删除文件".to_string())
}

fn is_untracked(root: &Path, path: &str) -> Result<bool, String> {
    let output = run_git(&root, &["status", "--porcelain=v2", "-z", "--", path])?;

    Ok(output
        .stdout
        .split('\0')
        .any(|entry| entry.strip_prefix("? ").is_some()))
}
```

Modify `src-tauri/src/lib.rs` command list:

```rust
git::git_revert_file,
git::git_delete_file,
```

- [ ] **Step 4: Run Rust tests to verify they pass**

Run:

```bash
cd src-tauri && cargo test git::tests --lib
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/git.rs src-tauri/src/lib.rs
git commit -m "feat: 增加 Git 单文件回滚和删除命令"
```

## Task 2: Frontend API Wrappers

**Files:**
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Add failing wrapper assertions**

In `components/workspace/__tests__/workspace-api.test.ts`, extend imports:

```ts
  gitDeleteFile,
  gitRevertFile,
```

Extend the Git wrapper test:

```ts
.mockResolvedValueOnce({
  ahead: 0,
  behind: 0,
  branch: 'main',
  changes: [],
  rootPath: '/repo',
  upstream: null,
})
.mockResolvedValueOnce({
  ahead: 0,
  behind: 0,
  branch: 'main',
  changes: [],
  rootPath: '/repo',
  upstream: null,
});

await gitRevertFile('/repo', 'a.md');
await gitDeleteFile('/repo', 'a.md');

expect(invokeMock).toHaveBeenNthCalledWith(8, 'git_revert_file', {
  rootPath: '/repo',
  path: 'a.md',
});
expect(invokeMock).toHaveBeenNthCalledWith(9, 'git_delete_file', {
  rootPath: '/repo',
  path: 'a.md',
});
```

- [ ] **Step 2: Run wrapper test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because the wrappers do not exist.

- [ ] **Step 3: Add wrappers**

Append to `components/workspace/workspace-api.ts`:

```ts
export async function gitRevertFile(rootPath: string, path: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_revert_file', { rootPath, path });
}

export async function gitDeleteFile(rootPath: string, path: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_delete_file', { rootPath, path });
}
```

- [ ] **Step 4: Run wrapper test to verify it passes**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat: 增加 Git 单文件前端 API"
```

## Task 3: GitPanel Context Menu

**Files:**
- Modify: `components/workspace/git-panel.tsx`
- Modify: `components/workspace/__tests__/git-panel.test.tsx`

- [ ] **Step 1: Add failing menu tests**

Add required props to existing `GitPanel` test renders:

```tsx
onCommitSingleFile={vi.fn()}
onDeleteFile={vi.fn()}
onRevertFile={vi.fn()}
onUnstageFile={vi.fn()}
```

Add tests:

```tsx
it('opens a context menu for a changed file and shows diff', async () => {
  const user = userEvent.setup();
  const onSelectFile = vi.fn();

  renderGitPanel({ onSelectFile });

  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('button', { name: /docs\/a.md/ }),
  });
  await user.click(await screen.findByRole('menuitem', { name: '显示差异' }));

  expect(onSelectFile).toHaveBeenCalledWith('docs/a.md');
});

it('focuses commit message when committing a single file from menu', async () => {
  const user = userEvent.setup();
  const onCommitSingleFile = vi.fn();

  renderGitPanel({ onCommitSingleFile });

  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('button', { name: /docs\/a.md/ }),
  });
  await user.click(await screen.findByRole('menuitem', { name: '提交' }));

  expect(onCommitSingleFile).toHaveBeenCalledWith('docs/a.md');
  expect(screen.getByLabelText('提交信息')).toHaveFocus();
});

it('confirms before reverting a file', async () => {
  const user = userEvent.setup();
  const onRevertFile = vi.fn();

  renderGitPanel({ onRevertFile });

  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('button', { name: /docs\/a.md/ }),
  });
  await user.click(await screen.findByRole('menuitem', { name: '回滚' }));
  await user.click(await screen.findByRole('button', { name: '确认回滚' }));

  expect(onRevertFile).toHaveBeenCalledWith('docs/a.md');
});

it('confirms before deleting a file', async () => {
  const user = userEvent.setup();
  const onDeleteFile = vi.fn();

  renderGitPanel({ onDeleteFile });

  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('button', { name: /docs\/a.md/ }),
  });
  await user.click(await screen.findByRole('menuitem', { name: '删除' }));
  await user.click(await screen.findByRole('button', { name: '确认删除' }));

  expect(onDeleteFile).toHaveBeenCalledWith('docs/a.md');
});
```

- [ ] **Step 2: Run GitPanel tests to verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/git-panel.test.tsx
```

Expected: FAIL because menu props and UI do not exist.

- [ ] **Step 3: Implement context menu**

In `components/workspace/git-panel.tsx`:

- Import `AlertDialog` components from `@/components/ui/alert-dialog`.
- Import `ContextMenu` components from `@/components/ui/context-menu`.
- Add props:

```ts
  onCommitSingleFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRevertFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
```

- Add `const commitMessageRef = React.useRef<HTMLTextAreaElement>(null);`.
- Add handlers:

```ts
function handleCommitSingleFile(path: string) {
  onCommitSingleFile(path);
  window.requestAnimationFrame(() => commitMessageRef.current?.focus());
}
```

- Wrap each changed-file row with `ContextMenu`.
- Render menu items:

```tsx
<ContextMenuItem onSelect={() => handleCommitSingleFile(change.path)}>
  提交
</ContextMenuItem>
<ContextMenuItem onSelect={() => onSelectFile(change.path)}>
  显示差异
</ContextMenuItem>
<ContextMenuItem
  disabled={!change.staged && !change.indexStatus}
  onSelect={() => onUnstageFile(change.path)}
>
  取消暂存
</ContextMenuItem>
<ContextMenuItem onSelect={() => setPendingRevertPath(change.path)}>
  回滚
</ContextMenuItem>
<ContextMenuItem
  className="text-destructive focus:text-destructive"
  onSelect={() => setPendingDeletePath(change.path)}
>
  删除
</ContextMenuItem>
```

- Add two `AlertDialog` blocks with action labels `确认回滚` and `确认删除`.
- Attach `ref={commitMessageRef}` to the commit textarea.

- [ ] **Step 4: Run GitPanel tests to verify they pass**

Run:

```bash
npm run test:run -- components/workspace/__tests__/git-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/git-panel.tsx components/workspace/__tests__/git-panel.test.tsx
git commit -m "feat: 增加 Git 文件右键菜单"
```

## Task 4: Workspace Integration

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Add failing integration test**

Extend workspace-api imports and mocks in `workspace-layout.test.tsx`:

```ts
  gitDeleteFile,
  gitRevertFile,
```

Mock reset:

```ts
const gitDeleteFileMock = vi.mocked(gitDeleteFile);
const gitRevertFileMock = vi.mocked(gitRevertFile);
gitDeleteFileMock.mockReset();
gitRevertFileMock.mockReset();
```

Add test:

```tsx
it('reverts a single Git file from the context menu', async () => {
  const user = userEvent.setup();
  gitProbeMock.mockResolvedValue({
    branch: 'main',
    gitAvailable: true,
    isRepository: true,
    rootPath: '/repo',
  });
  gitStatusMock.mockResolvedValue({
    ahead: 0,
    behind: 0,
    branch: 'main',
    changes: [
      {
        changeType: 'modified',
        indexStatus: '',
        oldPath: null,
        path: 'README.plate.json',
        staged: false,
        workingTreeStatus: 'M',
      },
    ],
    rootPath: '/repo',
    upstream: null,
  });
  gitRevertFileMock.mockResolvedValue({
    ahead: 0,
    behind: 0,
    branch: 'main',
    changes: [],
    rootPath: '/repo',
    upstream: null,
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));
  await user.pointer({
    keys: '[MouseRight]',
    target: await screen.findByRole('button', { name: /README.plate.json/ }),
  });
  await user.click(await screen.findByRole('menuitem', { name: '回滚' }));
  await user.click(await screen.findByRole('button', { name: '确认回滚' }));

  expect(gitRevertFileMock).toHaveBeenCalledWith('/repo', 'README.plate.json');
  expect(await screen.findByText('没有本地变更')).toBeTruthy();
});
```

- [ ] **Step 2: Run layout test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because layout callbacks are not wired.

- [ ] **Step 3: Wire callbacks**

In `components/workspace/workspace-layout.tsx`, import:

```ts
  gitDeleteFile,
  gitRevertFile,
```

Add handlers:

```tsx
const handleGitCommitSingleFile = React.useCallback((path: string) => {
  setGitSelectedPaths(new Set([path]));
}, []);

const handleGitUnstageFile = React.useCallback(
  async (path: string) => {
    if (!workspaceRootPath) return;
    setGitLoading(true);
    setGitError(null);
    try {
      setGitStatusState(await gitUnstage(workspaceRootPath, [path]));
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  },
  [workspaceRootPath],
);

const handleGitRevertFile = React.useCallback(
  async (path: string) => {
    if (!workspaceRootPath) return;
    setGitLoading(true);
    setGitError(null);
    try {
      setGitStatusState(await gitRevertFile(workspaceRootPath, path));
      setGitDiffState(null);
      setGitSelectedPath(null);
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  },
  [workspaceRootPath],
);

const handleGitDeleteFile = React.useCallback(
  async (path: string) => {
    if (!workspaceRootPath) return;
    setGitLoading(true);
    setGitError(null);
    try {
      setGitStatusState(await gitDeleteFile(workspaceRootPath, path));
      setGitDiffState(null);
      setGitSelectedPath(null);
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  },
  [workspaceRootPath],
);
```

Pass the props to `GitPanel`.

- [ ] **Step 4: Run layout test to verify it passes**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat: 接入 Git 文件右键操作"
```

## Task 5: Verification

**Files:**
- Modify only files touched by earlier tasks when verification exposes concrete defects.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/git-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
cd src-tauri && cargo test git::tests --lib
```

Expected: PASS.

- [ ] **Step 2: Run focused lint**

Run:

```bash
npx eslint components/workspace/git-panel.tsx components/workspace/workspace-layout.tsx components/workspace/workspace-api.ts components/workspace/__tests__/git-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit fixes if verification required changes**

If verification required code changes:

```bash
git status --short
git add src-tauri/src/git.rs src-tauri/src/lib.rs components/workspace/workspace-api.ts components/workspace/git-panel.tsx components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/git-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "fix: 打磨 Git 文件右键操作"
```

If verification did not require code changes, do not create an empty commit.

---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Git 面板设计

## 背景

Refinex Wiki 当前以本地工作区为核心，左侧已有工具栏和文档树面板，编辑区可展示文档或目录页。Git 面板需要让用户在同一个工作区内完成类似 IntelliJ IDEA Commit 面板的版本管理操作：查看变更、选择文件、查看 diff、提交、提交并推送，以及处理基础分支和远程同步。

首版目标不是完整 Git 客户端，而是安全覆盖知识库和文档工作流的高频版本管理能力。

## 目标

- 在左侧工具栏的目录按钮下方新增 Git 图标。
- 点击 Git 图标后，左侧文档树区域切换为 Git 面板；再次点击目录按钮则回到文档树。
- 在有 Git 仓库时展示变更列表、暂存状态、提交信息区和基础远程/分支状态。
- 在没有 `.git` 时展示空状态，并在本机安装 Git 的前提下提供一键 `git init`。
- 在主编辑区展示选中文件的 diff；没有选中文件时保持当前文档或目录页。
- 通过后端 Tauri 命令封装 Git 操作，避免前端直接拼接 shell 命令。

## 非目标

- 不实现完整 VCS 客户端。
- 不做 rebase、cherry-pick、复杂 merge 冲突编辑器、stash 管理、tag、blame、patch apply。
- 不提供 `reset --hard`、全仓清理、强制 push。
- 不创建远程仓库，不处理 Git 账号登录和凭据管理。
- 不自动安装 Git。

## 布局方案

采用“左侧 Git 工具视图”方案。

左侧工具栏包含：

- 目录按钮：切换到文档树视图。
- Git 按钮：切换到 Git 面板视图。

左侧面板行为：

- `workspace` 模式显示现有文档树。
- `git` 模式显示 Git 面板。
- 面板宽度首版复用当前左侧面板宽度；独立 Git 面板宽度不进入本次范围。

主编辑区行为：

- 用户在 Git 面板点击变更文件时，主编辑区显示 diff。
- 用户在文档树打开文档时，主编辑区恢复文档编辑。
- Git 面板保持打开时，用户仍可通过目录按钮回到文档树。

## 顶层状态

Git 面板按以下状态展示：

1. 未打开工作区
   - 显示“先打开工作区”空状态。
   - 提供打开工作区入口。

2. 检测中
   - 打开工作区、切换到 Git 面板、执行 Git 操作后进入。
   - 显示轻量 skeleton，不阻塞主编辑器。

3. 未安装 Git
   - 后端执行 `git --version` 失败。
   - 显示安装指引。
   - 不提供初始化按钮。

4. 非 Git 仓库
   - 工作区存在，但没有 `.git`。
   - 显示“这个工作区还不是 Git 仓库”。
   - 主按钮为“初始化 Git 仓库”，执行 `git init`。

5. 正常仓库
   - 展示分支、remote、ahead/behind、变更列表、提交区。
   - 支持刷新、暂存、取消暂存、查看 diff、提交、push、pull、分支基础操作。

6. 阻断或冲突状态
   - 例如未保存文档、push 失败、pull 前存在未提交变更、远程未配置。
   - 使用 Git 面板顶部 inline banner 呈现，不默认弹大 modal。
   - 单文件 revert 等 destructive 操作必须二次确认。

## 首版能力

### 仓库检测

打开工作区或切换到 Git 面板时检测：

- 本机 Git 是否可用。
- 工作区是否 Git 仓库。
- 当前分支。
- upstream。
- ahead/behind。
- 是否配置 remote。
- 工作区变更数。

### 初始化仓库

无 `.git` 时：

- 如果 Git 可用，显示“初始化 Git 仓库”。
- 点击后执行 `git init`。
- 成功后刷新状态，显示初始变更列表。
- 失败时展示 stderr 摘要。

### 变更列表

变更列表展示：

- modified
- added
- deleted
- renamed
- untracked

支持：

- 按目录分组。
- 搜索文件名和路径。
- 全选/取消全选。
- 单文件勾选。
- staged/unstaged 视觉区分。
- 文件右键菜单：显示 diff、stage、unstage、revert、在 Finder 中显示、复制路径。

### 暂存

支持：

- stage 单文件。
- unstage 单文件。
- stage 勾选文件。
- unstage 勾选文件。
- stage all。

提交行为以勾选文件为准；如果用户没有勾选但已有 staged 文件，则提交 staged 文件。UI 需要明确展示本次会提交哪些文件。

### Diff

点击变更文件后主编辑区进入 diff 视图。

首版 diff 能力：

- 文本文件 side-by-side diff。
- 可切换 staged/unstaged diff。
- 二进制文件显示摘要，不渲染内容。
- 删除文件显示删除前内容摘要。
- 重命名文件显示 oldPath -> path。

### 撤销

首版只提供单文件 revert。

规则：

- 必须二次确认。
- 不提供全仓 discard all。
- 不提供 `git reset --hard`。
- revert 后自动刷新 status。

### 提交

提交区包含：

- 提交信息输入框。
- 勾选项：提交前保存当前文档。
- 按钮：提交、提交并推送、更多。

提交规则：

- 如果当前 Plate 文档 dirty，先保存当前文档。
- 保存失败则阻断提交。
- 提交信息为空时阻断。
- 没有待提交文件时阻断。
- 提交成功后刷新 status。

### 分支和远程

首版支持：

- 查看当前分支。
- 查看 ahead/behind。
- 新建分支。
- 切换分支。
- pull。
- push。

阻断规则：

- 切换分支前如果有未保存文档，先提示保存。
- pull 前如果有未保存文档，先提示保存。
- pull 前如果有未提交变更，默认阻断并提示先提交或处理变更。
- push 如果 remote 未配置，显示“未配置远程仓库”。

## 前端组件

新增组件：

- `components/workspace/git-panel.tsx`
  - Git 面板入口，承载状态分发、header、toolbar、变更列表和提交区。

- `components/workspace/git-empty-state.tsx`
  - 渲染未打开工作区、未安装 Git、非 Git 仓库状态。

- `components/workspace/git-changes-list.tsx`
  - 变更列表、分组、搜索、勾选、右键菜单。

- `components/workspace/git-commit-box.tsx`
  - 提交信息、提交按钮、提交前保存提示、错误展示。

- `components/workspace/git-diff-view.tsx`
  - 主编辑区 diff 视图。

- `components/workspace/use-git-panel.ts`
  - 管理 Git 状态、选中文件、勾选文件、loading/error 和操作调用。

`WorkspaceLayout` 增加：

```ts
type LeftPanelMode = 'workspace' | 'git';
```

左侧 tool rail 根据 `leftPanelMode` 高亮目录或 Git 按钮。

## 前端数据模型

```ts
export interface GitRepositoryState {
  gitAvailable: boolean;
  isRepository: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export type GitChangeStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked';

export interface GitChange {
  path: string;
  oldPath?: string;
  status: GitChangeStatus;
  staged: boolean;
  binary: boolean;
}

export interface GitStatusSnapshot {
  repository: GitRepositoryState;
  changes: GitChange[];
}

export interface GitDiffResult {
  path: string;
  oldPath?: string;
  staged: boolean;
  binary: boolean;
  text: string | null;
}
```

## 后端命令

新增 `src-tauri/src/git.rs`，并注册到 `src-tauri/src/lib.rs`。

命令：

- `git_probe(root_path)`
- `git_init(root_path)`
- `git_status(root_path)`
- `git_diff(root_path, path, staged)`
- `git_stage(root_path, paths)`
- `git_unstage(root_path, paths)`
- `git_revert_file(root_path, path)`
- `git_commit(root_path, message, paths)`
- `git_push(root_path)`
- `git_pull(root_path)`
- `git_branches(root_path)`
- `git_checkout_branch(root_path, branch)`
- `git_create_branch(root_path, branch)`

前端对应在 `components/workspace/workspace-api.ts` 增加封装函数。

## 后端安全规则

- 所有命令先 canonicalize `root_path`。
- 只允许在当前 workspace root 下执行 Git。
- 文件路径只接受 repo-relative path。
- 拒绝绝对路径。
- 拒绝空路径。
- 拒绝包含 `..` 的路径。
- 不使用 shell 拼接命令。
- 使用 `std::process::Command::new("git").args(["status", "--porcelain=v2"]).current_dir(root)` 这一类显式参数数组。
- stdout/stderr 限制最大长度，避免异常输出撑爆前端。
- push/pull 不处理凭据输入；失败时返回错误摘要和处理建议。

## Git 输出解析

status 使用 porcelain v2：

```bash
git status --porcelain=v2 --branch -z
```

原因：

- 稳定。
- 适合机器解析。
- 能同时拿到 branch/upstream/ahead/behind 和文件状态。
- `-z` 能正确处理特殊字符文件名。

diff 使用：

```bash
git diff -- <path>
git diff --staged -- <path>
```

二进制判断：

- 如果 diff 输出包含 binary marker，返回 `binary: true`。
- 大文件输出超过限制时返回摘要，不渲染完整 diff。

## 错误处理

错误分为：

- `GitUnavailable`：没有 Git。
- `NotRepository`：非仓库。
- `UnsafePath`：路径不安全。
- `CommandFailed`：Git 命令失败。
- `OutputTooLarge`：输出过大。
- `RemoteUnavailable`：未配置远程或远程不可用。

前端展示规则：

- 可恢复错误使用面板内 banner。
- destructive 操作用 confirm dialog。
- push/pull 失败保留 stderr 摘要，提供“复制错误”。

## 测试策略

前端测试：

- 左侧 tool rail 切换 workspace/git。
- 无工作区、无 Git、非仓库、正常仓库空状态。
- 变更列表勾选和提交按钮启用/禁用。
- 点击变更文件切换主区 diff。
- 提交前保存 dirty 文档阻断/成功路径。

后端测试：

- 路径校验：绝对路径、`..`、空路径被拒绝。
- `git status --porcelain=v2 -z` 解析 modified/added/deleted/renamed/untracked。
- 非 Git 仓库检测。
- Git 不可用错误映射。
- `git init` 成功后仓库状态可读取。

集成验证：

- 在临时目录初始化仓库，创建/修改/删除文件，验证 status。
- stage/unstage 后状态变化正确。
- commit 后工作区变干净。

## 实施顺序

1. 新增 Git 类型和 API 封装。
2. 新增后端 `git.rs`，实现 probe/init/status 基础能力。
3. 接入左侧 tool rail 和 `LeftPanelMode`。
4. 实现 Git 空状态和 Git 面板基本壳。
5. 实现变更列表、勾选、刷新。
6. 实现 diff 视图。
7. 实现 stage/unstage。
8. 实现 commit 和提交前保存。
9. 实现 push/pull 和分支基础操作。
10. 补齐测试和视觉回归。

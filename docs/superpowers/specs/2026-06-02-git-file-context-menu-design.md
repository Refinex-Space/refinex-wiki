---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Git File Context Menu Design

## 背景

当前 Git 面板已经支持仓库检测、初始化、变更列表、显示差异、批量暂存、批量取消暂存和提交。缺口是单个变更文件的右键操作能力不足，用户需要类似 IDE 的文件级 Git 操作入口。

## 目标

- 在 Git 面板变更文件行上支持右键菜单。
- 提供文件级操作：提交、回滚、删除、显示差异、取消暂存。
- 危险操作必须确认，避免误删或误回滚。
- 操作后刷新 Git 状态，保持左侧变更列表和主区域 diff 一致。

## 非目标

- 不实现分支切换、push、pull、stash 或历史记录。
- 不实现无提交信息的即时提交。
- 不改变现有底部提交框的提交流程。
- 不引入复杂 diff 编辑或冲突解决能力。

## 交互设计

右键单个变更文件时打开 Context Menu。

菜单项：

- `提交`：把该文件设为唯一选中项，并聚焦底部提交信息输入框。用户输入 message 后使用现有提交按钮提交。
- `显示差异`：选择该文件，并在主区域展示工作区 diff。
- `取消暂存`：只对当前文件执行取消暂存。未暂存文件禁用。
- `回滚`：打开确认弹窗。确认后回滚该文件的暂存和工作区修改。
- `删除`：打开确认弹窗。确认后删除当前文件。

禁用规则：

- `取消暂存` 仅当 `change.staged === true` 或 `indexStatus` 非空时启用。
- `回滚` 对所有非 unknown 变更启用。
- `删除` 对所有变更启用。
- `提交` 对所有变更启用。
- `显示差异` 对所有变更启用。

## 后端命令

新增 Tauri 命令：

- `git_revert_file(root_path, path)`
- `git_delete_file(root_path, path)`

`git_revert_file` 行为：

- 路径必须是 repo-relative path。
- 对已暂存内容先执行 `git restore --staged -- <path>`，如果仓库没有 HEAD 且命令失败，则使用现有 fallback 模式处理。
- 再执行 `git restore --worktree -- <path>`。
- 对 untracked 文件执行删除物理文件。
- 返回刷新后的 `GitStatus`。

`git_delete_file` 行为：

- 路径必须是 repo-relative path。
- 如果文件是 untracked，直接删除 repo 内物理文件。
- 如果文件是 tracked 或 staged，执行 `git rm -f -- <path>`。
- 返回刷新后的 `GitStatus`。

安全要求：

- 继续复用 `validate_repo_relative_path`。
- 拒绝空路径、绝对路径、`..` 路径。
- 删除物理文件前必须确认 canonical path 仍在 workspace root 内。
- 不使用 shell 拼接命令。

## 前端组件

`components/workspace/git-panel.tsx`：

- 给每个变更行包裹 `ContextMenu`。
- 新增 props：
  - `onCommitSingleFile(path)`
  - `onRevertFile(path)`
  - `onDeleteFile(path)`
  - `onUnstageFile(path)`
- 底部提交信息 `textarea` 暴露聚焦能力。`提交` 菜单项触发后，将该文件设为唯一选中项，并聚焦提交信息。
- `回滚` 和 `删除` 使用 `AlertDialog` 确认。

`components/workspace/workspace-layout.tsx`：

- 接收 GitPanel 的单文件操作回调。
- `onUnstageFile` 调用 `gitUnstage(root, [path])`。
- `onRevertFile` 调用 `gitRevertFile(root, path)`。
- `onDeleteFile` 调用 `gitDeleteFile(root, path)`。
- 所有操作成功后更新 `GitStatus`，如果当前 diff 文件被删除或变干净，则清空 diff。

`components/workspace/workspace-api.ts`：

- 新增 `gitRevertFile(rootPath, path)`。
- 新增 `gitDeleteFile(rootPath, path)`。

`components/workspace/workspace-types.ts`：

- 不需要新增类型，两个命令返回现有 `GitStatus`。

## 测试策略

后端测试：

- tracked 文件修改后 `git_revert_file` 还原内容并清空状态。
- staged 文件 `git_revert_file` 同时清掉暂存和工作区修改。
- untracked 文件 `git_revert_file` 删除物理文件。
- tracked 文件 `git_delete_file` 后状态为 deleted/staged 或最终 status 可读取。
- untracked 文件 `git_delete_file` 删除物理文件。
- 不安全路径被拒绝。

前端测试：

- 右键变更行展示菜单项。
- 点击 `显示差异` 调用当前文件选择回调。
- 未暂存文件的 `取消暂存` 禁用。
- 点击 `提交` 后只选中该文件并聚焦提交信息。
- 点击 `回滚` 确认后调用回滚回调。
- 点击 `删除` 确认后调用删除回调。

集成验证：

- Git 面板中右键单个 modified 文件，显示差异正常。
- 单个 staged 文件可以取消暂存。
- 单个 modified 文件确认回滚后消失。
- 单个 untracked 文件确认删除后从磁盘和变更列表消失。

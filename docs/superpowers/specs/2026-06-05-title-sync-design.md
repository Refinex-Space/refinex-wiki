---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 文件树名称与 H1 标题双向同步

**日期：** 2026-06-05
**状态：** 已确认，待实施

## 背景

当前文档的标题存在于三个位置：文件名（`.md` 文件名）、frontmatter `title`、正文 H1。创建时三者一致，但后续修改时不同步：

- 文件树重命名 → 更新文件名 + frontmatter title，**不更新** H1
- 编辑器修改 H1 → **不更新** frontmatter title 或文件名

## 需求

文件树显示名称与编辑器中一级标题（H1）双向实时同步：

1. 在文件树中输入/修改名称时，编辑器 H1 和磁盘文件名跟着更新
2. 在编辑器中修改 H1 时，文件树名称和磁盘文件名跟着更新
3. 同步方式：防抖（停止输入 300ms 后）
4. H1 保留用户原始输入，文件名做规范化（特殊字符替换为 `-`）

## 真相源

frontmatter `title` 是存储层的真相源，H1 是用户可见的表达，文件名是规范化的磁盘标识。三者始终对齐。

## 方案：在现有流程中扩展

改动集中在现有的内容更新和重命名流程中，不引入新的架构组件。

### H1 → 文件名/文件树方向

**触发点：** `updateDocumentValue`（`use-workspace.ts`）

1. 在 `withUpdatedMarkdownValue` 中检测 H1 变更
   - 从 Plate value 中提取第一个 H1 节点的文本
   - 与当前 `draft.metadata.title` 比较
   - 相同则走现有流程，不同则触发同步

2. H1 变更时
   - 更新 frontmatter `title` 为 H1 原始文本
   - 用规范化逻辑生成安全文件名
   - 调用 `renameNode(currentDocument, normalizedTitle)` 更新文件名

3. 防抖：300ms，独立于自动保存的 800ms
   - 先完成重命名，再触发保存
   - 重命名进行中时暂缓新的同步请求

**新增工具函数：**
- `extractH1FromPlateValue(value)` — 从 Plate value 中提取 H1 文本
- `sanitizeTitleForFileName(title)` — 前端文件名规范化，与 Rust `sanitize_file_stem` 对齐

### 文件名 → H1 方向

**触发点：** Rust 后端 `rename_workspace_node`

1. 修改 `update_markdown_document_title` 函数
   - 除了更新 frontmatter `title`，同时替换正文中的第一个 `# xxx` 行
   - 保持重命名是一个原子操作

2. 前端无需额外逻辑
   - 现有流程：重命名 → 刷新文件树 → 重新打开文档
   - 重新打开时 H1 自然就是新标题

### 竞态处理

- `isRenamingRef` 标记重命名是否进行中，进行中时暂缓 H1 同步
- 重命名完成后用最新状态决定是否需要再次同步
- 重命名操作本身会写文件，完成后前端刷新 `lastSavedMarkdownRef` 避免保存冲突
- 现有 `renameNode` 已处理"先保存当前文档再重命名"的逻辑

### 错误处理

- 重命名失败（文件名冲突等）→ 不修改 H1 和 frontmatter，toast 提示用户
- 保存失败 → 现有错误处理机制已覆盖
- H1 为空或只有空白 → 不触发同步，保留原标题
- 文档没有 H1 → 不触发同步

## 涉及文件

| 文件 | 改动 |
|------|------|
| `use-workspace.ts` | `withUpdatedMarkdownValue` 增加 H1 变更检测；`updateDocumentValue` 增加同步逻辑 |
| `workspace.rs` | `update_markdown_document_title` 增加替换正文 H1 |
| 新增工具函数文件 | `extractH1FromPlateValue`、`sanitizeTitleForFileName` |

## 不在范围内

- 多窗口/多标签编辑同一文档的同步
- H2-H6 级别标题的同步
- 文件名与标题的自动去重或智能命名

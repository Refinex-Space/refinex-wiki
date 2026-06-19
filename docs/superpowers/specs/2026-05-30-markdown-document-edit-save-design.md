---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Markdown Document Edit And Save Design

## 背景

当前 Refinex Wiki 已经具备本地工作区选择、目录树展示、当前文档高亮、Plate 编辑器区域和桌面窗口标题更新能力。但点击左侧 Markdown 文档后，右侧编辑区域仍展示 Plate playground 默认内容，没有读取真实 `.md` / `.mdx` 文件，也没有保存链路。

本设计覆盖从点击真实 Markdown 文档，到在右侧 Plate 编辑器展示、编辑、自动保存、快捷键保存的第一版闭环。

## 目标

- 点击左侧 `.md` / `.mdx` 文档后，在右侧编辑区域展示该文件真实内容。
- 使用现有 Plate 编辑器承载编辑体验，而不是新增纯文本编辑器。
- 支持自动保存和 `Cmd/Ctrl + S` 立即保存。
- 展示清晰的保存状态：加载中、有未保存更改、保存中、已保存、保存失败。
- 保存失败时保留用户当前编辑内容，不因为错误清空编辑器。
- 保持当前 Tauri 桌面架构：文件读写由后端 command 统一处理。

## 非目标

- 不实现文件新建、删除、重命名、移动。
- 不实现多文档标签页。
- 不实现编辑冲突弹窗、外部文件变更 watcher 或三方 merge。
- 不实现 Markdown 源码和富文本双栏切换。
- 不实现发布、同步、Git 提交或版本历史。
- 不保证 MDX 自定义组件可完整可视化渲染；第一版按 Markdown 能力尽力反序列化。

## 推荐方案

采用 Tauri 后端读写文件，前端通过 Plate Markdown 插件完成 Markdown 与 Plate value 的互转。

数据流：

1. 用户点击 `DocumentTree` 中的文档节点。
2. `useWorkspace` 进入文档加载状态，并调用 Tauri `read_document`。
3. Rust command 校验路径在当前工作区内、扩展名为 `.md` 或 `.mdx`，读取 UTF-8 文本。
4. 前端拿到 Markdown 原文后传入 `PlateEditor`。
5. `PlateEditor` 使用 `MarkdownPlugin` 将 Markdown 反序列化为 Plate value。
6. 用户编辑内容后，前端将编辑器当前 value 序列化为 Markdown。
7. 内容变化后触发 debounce 自动保存；`Cmd/Ctrl + S` 触发立即保存。
8. 保存时调用 Tauri `save_document` 写回原文件。

## 组件边界

### Tauri 后端

新增 command：

- `read_document(root_path, document_path) -> DocumentContent`
- `save_document(root_path, document_path, content) -> DocumentContentMeta`

推荐结构：

- `DocumentContent`
  - `path`
  - `content`
  - `modified_at`
- `DocumentContentMeta`
  - `path`
  - `modified_at`

路径校验规则：

- `root_path` 和 `document_path` 都需要 canonicalize。
- `document_path` 必须位于 `root_path` 内。
- 只允许 `.md` 和 `.mdx`。
- 文件必须存在且是普通文件。
- 读取和写入错误转换为面向用户的简短中文错误。

### Workspace 状态

`useWorkspace` 增加当前文档内容状态：

- `currentDocument`
- `documentContent`
- `documentVersion`
- `documentLoadState`: `idle | loading | loaded | error`
- `saveState`: `idle | dirty | saving | saved | error`
- `saveError`
- `lastSavedAt`

点击文档时：

- 如果已有文档处于 `dirty` 或 `saving`，先触发一次立即保存。
- 无论保存是否成功，都允许切换文档；保存失败通过状态提示暴露，不阻塞用户。
- 新文档读取期间右侧展示加载态。
- 读取失败时保留当前工作区目录树，右侧展示错误态。

### PlateEditor

`PlateEditor` 从固定 demo value 改成支持两种输入模式：

- `variant="demo"`：继续使用 playground 默认内容。
- `variant="workspace"`：接收 Markdown 内容和文档版本。

推荐 props：

- `markdown?: string`
- `documentKey?: string`
- `onMarkdownChange?: (markdown: string) => void`
- `onSaveRequested?: () => void`

编辑器初始化：

- workspace 模式下使用 `MarkdownPlugin` 的 `markdown.deserialize(markdown)` 得到初始 value。
- `documentKey` 变化时重建 editor，避免旧文档内容残留。
- 空文件反序列化为一个空段落，避免编辑器不可编辑。

内容变更：

- 监听 Plate value 变化。
- 使用 `MarkdownPlugin` 的 `markdown.serialize()` 得到 Markdown。
- 只有序列化结果与最近保存内容不一致时标记 `dirty`。

## 保存策略

自动保存：

- 内容变化后进入 `dirty`。
- 使用 800ms debounce。
- debounce 到期后调用 `save_document`。
- 保存中继续允许编辑；如果保存期间又发生变化，保存完成后再次判断是否需要下一轮保存。

快捷键保存：

- 监听 `Cmd/Ctrl + S`。
- 阻止浏览器默认保存网页行为。
- 如果当前有文档且存在未保存更改，立即取消等待中的 debounce 并保存。
- 如果没有未保存更改，可刷新状态为 `saved`，不重复写文件。

保存失败：

- `saveState` 进入 `error`。
- 保留编辑器当前内容。
- 下一次内容变化或再次按 `Cmd/Ctrl + S` 时允许重试。

## UI 行为

编辑区域状态：

- 未选择文档：沿用当前空态。
- 文档加载中：显示 “正在打开文档…”。
- 文档读取失败：显示错误文案和重试入口。
- 文档打开成功：展示 Plate 编辑器。

保存状态展示：

- 建议放在编辑 island 右上角或工具栏末尾，轻量展示。
- 文案：
  - `保存中...`
  - `已保存`
  - `有未保存更改`
  - `保存失败`

窗口标题：

- 继续使用当前文档标题或文件名。
- 打开文档成功后，窗口标题应类似截图中显示当前文档名。

## 错误处理

- 工作区路径不存在：提示重新选择工作区。
- 文档路径越界：提示无法打开该文档。
- 非 Markdown 文件：提示仅支持 Markdown 文档。
- 文档读取失败：右侧显示错误态。
- 文档保存失败：右侧保留内容并展示保存失败状态。

错误不应让整个页面崩溃，也不应清空目录树。

## 测试策略

Rust 测试：

- 能读取工作区内 Markdown 文件。
- 能保存工作区内 Markdown 文件。
- 拒绝 `.txt` 等非 Markdown 文件。
- 拒绝通过 `../` 访问工作区外文件。
- 保存后返回更新后的 `modified_at`。

前端测试：

- 点击文档后调用读取接口。
- 读取中展示加载态。
- 读取成功后传入 Plate 编辑器真实 Markdown。
- 读取失败展示错误态。
- 编辑后进入 `dirty`。
- debounce 后调用保存接口。
- `Cmd/Ctrl + S` 触发立即保存。
- 保存失败后保留当前内容并展示错误状态。

验证命令：

- `npm run test:run -- components/workspace`
- `npx eslint app/page.tsx app/editor/page.tsx components/workspace/**/*.ts components/workspace/**/*.tsx components/editor/plate-editor.tsx vitest.config.ts`
- `npm run build`
- `npm run desktop:build -- --no-bundle`

## 已确认决策

- 范围选择：编辑并保存。
- 保存策略：自动保存 + `Cmd/Ctrl + S` 立即保存。
- 文件读写：优先放在 Tauri 后端 command。
- 编辑器：复用现有 Plate 编辑器和 `@platejs/markdown`。
- 第一版不做外部文件变更冲突处理。

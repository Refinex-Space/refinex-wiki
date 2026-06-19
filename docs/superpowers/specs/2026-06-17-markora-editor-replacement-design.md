---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 编辑器全面替换为 markora

**日期：** 2026-06-17
**状态：** 已确认，待实施

## 背景

Refinex Wiki 当前的编辑器基于 Plate.js 富文本框架（`components/editor/plate-editor.tsx` + 约 60 个 `components/editor/plugins/*` 插件包 + 约 255 个 `components/ui/*-node.tsx` Plate 节点组件）。磁盘文档早已迁移为 `.md` 文件，Tauri 层负责读写，但内存草稿 `MarkdownDocumentDraft` 仍同时保存 markdown 字符串与 Plate JSON `value`，每次编辑都做 `markdownToPlateValue` / `plateValueToMarkdown` 双向转换。这层转换是"原生 Markdown 体验"的核心阻碍：编辑器看到的不是文件本身，而是一份 Plate 投影。

本次目标是用自研的 markora（`@refinex/markora@1.0.1`，基于 CodeMirror 6 的 Markdown 原生编辑器）**全面、一次性替换** Plate 编辑器，磁盘 `.md` 文件、内存模型、编辑器三层统一为 Markdown 字符串，彻底删除 Plate 全部代码与依赖。

## 目标与非目标

**目标：**

1. 编辑器组件从 `PlateEditor` 换成 `MarkoraEditor`（基于 `@uiw/react-codemirror` + markora extensions）。
2. 内存草稿瘦身为纯 Markdown 字符串，删除 `markdown ↔ Plate JSON` 双向转换层。
3. 右侧 TOC 面板数据源从 Plate `useTocElementState` 改为 markora `onTocChange`，滚动定位改为 CodeMirror `EditorView.scrollIntoView`。
4. 附件上传（粘贴 / 拖拽 / slash media）复用现有 `workspace-local-assets` 写入逻辑。
5. 保留 H1 ↔ 文件名双向同步行为，但 H1 提取改为基于 Markdown 正则。
6. 删除全部 Plate 代码与依赖，仓库内无 `platejs` / `@platejs` / `slate` 残留。

**非目标（本期不做，后续独立项目）：**

- **AI 辅助**：现有右侧 AI 面板是占位，未正式实现。AI 后端代码（`app/api/ai/*`）保留不动，AI 接入作为后续项目。
- **导出功能**：PDF / DOCX / 图片 / zip 归档导出当前基于 Plate value 实现，删除 Plate 后不可用。本期删除导出代码，后续基于 markora `preview()` 统一重设计。
- **编辑器模式切换**：源码 / 预览 / HTML-CSS 输出模式（playground 的 code/view/output）。本期只做 live WYSIWYG 模式，refinex-wiki 当前也没有这些模式切换。
- **评论 / 建议 / Excalidraw / 代码绘图**：markora 无对应能力，本期放弃。

## 架构总览

替换边界按模块划分：

| 模块 | 处理方式 |
|---|---|
| `components/editor/plate-editor.tsx` | 删除，新建 `components/editor/markora-editor.tsx` |
| `components/editor/plugins/`（整个目录，~60 文件） | 全部删除 |
| `components/ui/*-node*.tsx`、`editor.tsx`、`editor-static.tsx` 等 Plate 节点 | 全部删除（保留通用 UI：button/popover/tooltip/calendar 等，逐个甄别） |
| `components/editor/markdown-document.ts` | 删除（含 `markdownToPlateValue`/`plateValueToMarkdown`/`extractH1Text(value)`） |
| `components/editor/markdown-import.ts` | 删除（Plate 导入） |
| `components/editor/transforms.ts` | 删除（Plate value 变换） |
| `components/editor/document-toc-bridge.tsx` | 重写：数据源改 markora `onTocChange`，滚动改 `EditorView.scrollIntoView` |
| `components/editor/markdown-frontmatter.ts` | 新建：纯字符串 frontmatter 解析 / 序列化 / H1 提取 |
| `components/workspace/use-workspace.ts` | 草稿模型瘦身为纯 markdown |
| `components/workspace/workspace-document-transfer.ts` | 删除（导出基于 Plate value） |
| `components/workspace/workspace-document-insights.ts` | 部分删除：`countPlateDocumentCharacters` 删；`extractDocumentResourceReferences` 改写为基于 markdown 的 `extractResourceReferencesFromMarkdown`（document-meta-panel 依赖） |
| `components/workspace/workspace-export-archive.ts` | 删除 |
| `components/editor/settings-dialog.tsx` | 删除（Plate 编辑器设置面板） |
| `app/api/ai/*` | 保留不动 |
| `components/workspace/ai-side-panel.tsx`、`components/editor/use-chat.ts` | 保留不动（AI 占位） |
| `components/workspace/workspace-layout.tsx` | 仅把 `PlateEditor` 引用换成 `MarkoraEditor`、props 适配 |
| `package.json` 中 `@platejs/*`、`@udecode/cn`、`@emoji-mart/data`、`@excalidraw/excalidraw`、`html2canvas-pro`、`jszip` 等 | 删除 |

**保留完全不动**：workspace 外壳（侧栏、git 面板、终端、状态栏）、`EditorPane`（只接收 children，天然适配）、`workspace-api.ts`、Tauri 层、`WorkspaceAssetProvider`（资产上下文，不依赖 Plate）。

**核心数据流（替换后）：**

```
.md 文件 (Tauri fs)
  ⇅ readMarkdownDocument / saveMarkdownDocument（不变）
use-workspace: MarkdownDraft { markdown: string, metadata, modifiedAt, path }
  ⇅ value / onChange（纯字符串）
MarkoraEditor (CodeMirror + markora extensions)
```

## 数据模型瘦身

新的纯 Markdown 草稿，替换现有 `MarkdownDocumentDraft`：

```ts
export interface MarkdownDraft {
  markdown: string;          // 完整文档（含 frontmatter + body）
  metadata: {
    title: string;
    createdAt: string | null;
    updatedAt: string | null;
    refinexDialect: number;
  };
  modifiedAt: number;
  path: string;
}
```

删除的字段：`value: Value`（Plate JSON）、`body: string`（拆分出来的纯正文）。

`use-workspace.ts` 改动：

- `createMarkdownDraft`：去掉 `markdownToPlateValue(parsed.body)`，直接返回 `{ markdown: content.content, metadata: parsed.metadata, ... }`。
- `updateDocumentValue(nextValue)` 重命名为 `updateMarkdown(nextMarkdown: string)`，内部：
  1. 从 markdown 解析 H1 文本（`extractH1FromMarkdown`），与 `metadata.title` 比较，变化则更新 metadata.title。
  2. 若补了 frontmatter title，重新序列化 markdown。
  3. 触发防抖保存（800ms）+ 防抖重命名（300ms）。
- `withUpdatedMarkdownValue` 删除（Plate value → markdown 的桥）。
- `countPlateDocumentCharacters` 删除；状态栏字数统计改为 `Array.from(markdown.replace(/\s+/g, '')).length`（与现有 `countNodeCharacters` 的"去空白后字符数"语义对齐）。

`workspace-document-insights.ts` 含两个函数，处理方式不同：

- `countPlateDocumentCharacters(value)` 删除（基于 Plate value）。
- `extractDocumentResourceReferences(value)` 被 `document-meta-panel.tsx`（右侧 meta 面板的资源计数）使用。它扫描节点树里的 `LOCAL_ASSET_URL_PREFIX` 字符串。改为 `extractResourceReferencesFromMarkdown(markdown: string): DocumentResourceReference[]`——直接正则扫描 markdown 文本中的本地资源引用（图片/链接/HTML src）。`document-meta-panel.tsx` 的 props 从 `PlateDocumentEnvelope` 改为接收 `markdown`。

frontmatter 处理集中在新的 `components/editor/markdown-frontmatter.ts`，只做两件事：

- `parseFrontmatter(raw): { metadata, body }`
- `serializeFrontmatter({ body, metadata }): string`

外加纯字符串工具：

- `extractH1FromMarkdown(markdown): string | null`（正则提取第一个 `# ` 标题文本）
- `sanitizeTitleForFileName`（保留现有实现）

这些工具与编辑器无关，是纯字符串领域逻辑，可持续复用。

## MarkoraEditor 组件

新建 `components/editor/markora-editor.tsx`，签名对齐 `EditorPane` 的 children 需求：

```tsx
interface MarkoraEditorProps {
  documentKey?: string;              // 用于强制重建（切换文档）
  pageWidthMode?: PageWidthMode;
  markdown: string;                  // 替代 value: Value
  onSaveRequested?: () => void;      // Cmd/Ctrl+S
  onTocSnapshotChange?: (snapshot: DocumentTocSnapshot) => void;
  onMarkdownChange?: (markdown: string) => void;   // 替代 onValueChange
  workspaceRootPath?: string | null;
}
```

内部结构（遵循 markora React 接入指南第 5-9 节）：

- `useRef<ReactCodeMirrorRef>` 持有 CodeMirror view。
- `useMemo` 生成 markora extensions。**依赖项：theme、locale、pageWidthMode、uploader。不依赖 markdown 文本**——文本通过 `value/onChange` 同步，避免每次输入重建扩展。
- 主题：`useTheme()` 取 `resolvedTheme` → 映射 `ThemeEnum.LIGHT/DARK` + `githubLight/githubDark`。
- `basicSetup={false}`，按接入指南要求避免扩展重复。
- `attachments.uploader`：包装 `workspace-local-assets.ts` 的写入逻辑（见下节）。
- `toc.onTocChange`：把 `MarkoraTocItem[]` 推给一个 ref，由 TOC bridge 消费。
- `value={markdown}`，`onChange={onMarkdownChange}`。
- **Cmd/Ctrl+S**：在编辑器容器 `onKeyDown` 拦截（沿用现有 `PlateEditor` 模式）。
- **回到顶部按钮**：沿用现有实现（滚动容器 ref 不变）。
- `variant` / `demo` 概念删除（只保留 workspace 用法；demo playground 内容删除）。

`WorkspaceAssetProvider` 保留（uploader 需要 rootPath，它不依赖 Plate）。

## TOC 桥重写

`document-toc-bridge.tsx` 改为不依赖 Plate。`DocumentTocSnapshot` 对外接口不变（右侧 `DocumentTocPanel` 零改动）。

**数据源**：markora `toc.onTocChange(items: MarkoraTocItem[])` → 过滤掉 level 1（H1）→ 映射成 `DocumentTocItem`（depth = level - 1，clamp 到 [1,3]）。

**活动标题（active）**：markora 内置 TOC 扩展在自己面板里跟踪 active，但我们不用它的面板，需要自己算。方案：MarkoraEditor 在 `extensions` 末尾追加一个轻量 `EditorView.updateListener`，每次滚动/更新时取滚动容器顶部坐标，用 `view.coordsAtPos(item.from)` 对比各标题位置，算出当前可见的第一个标题作为 active，写入 TOC snapshot。

**滚动定位**：`scrollToHeading(id)` → 找到对应 `MarkoraTocItem.from` → `view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start' }) })`。

**实现要点**：TOC bridge 不再是独立 React 组件（它原本依赖 Plate `useTocElementState`），而是内联进 MarkoraEditor：MarkoraEditor 持有 view ref + TOC items ref，通过 `useEffect` + `updateListener` 维护 active 状态，对外通过 `onTocSnapshotChange` 回调发布。`document-toc-bridge.tsx` 文件删除，逻辑并入 `markora-editor.tsx`（或拆为 `use-markora-toc.ts` hook 保持文件聚焦）。

## 附件落地

复用现有 `workspace-local-assets.ts` 的写入逻辑：

- markora `attachments.uploader(file)` 内部调用基于 `workspace-local-assets.ts` 的 base64 写入，把文件写入 workspace 的 assets 目录，返回 `{ url, name, mimeType }`。
- url 用相对 workspace 的路径（如 `assets/xxx.png`），markora 把它写进 markdown；显示时走现有 `use-resolved-asset-url.ts` 解析。
- paste / drop 与 slash media 命令共用同一 uploader（markora 自动复用）。
- `enablePaste` / `enableDrop` 均开启；`accept` 按 image/video/audio/file 配置。
- blob URL 生命周期：因为是写入磁盘的真实路径，不需要 `URL.revokeObjectURL` 清理（区别于 playground 的 demo uploader）。

## H1 ↔ 文件名同步

保持现有行为（见 `2026-06-05-title-sync-design.md`），但 H1 提取从 Plate value 改为 Markdown 正则：

- 编辑时 `onMarkdownChange` → `updateMarkdown` → `extractH1FromMarkdown(markdown)` → 与 `metadata.title` 比较 → 变则更新 metadata.title + 触发文件名防抖重命名（300ms）。
- 文件树重命名 → 读盘 → 刷新 markdown（保留现有平滑更新逻辑，`isRenamingRef` 机制不变）。
- `sanitizeTitleForFileName` 保留。
- H1 缺失补偿（`compensateMarkdownDocument`）保留：打开文档时若无 H1 则补 `# title`，若无 frontmatter 则补。

## 删除清单

**依赖删除（package.json）：**

- 全部 `@platejs/*`（约 40 个）
- `@udecode/cn`
- `@emoji-mart/data`
- `@excalidraw/excalidraw`
- `html2canvas-pro`（仅 Plate 导出用）
- `jszip`（仅归档导出用）
- 其它仅被 Plate 代码引用的依赖（实施时通过 `depcheck` 核实）

**依赖新增：**

- `@refinex/markora@1.0.1`
- `@uiw/react-codemirror`
- `@uiw/codemirror-theme-github`
- `@codemirror/lang-markdown`
- `@codemirror/language`
- `@codemirror/language-data`
- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/commands`

**文件删除：**

- `components/editor/plugins/`（整个目录）
- `components/editor/editor-kit.tsx`、`editor-base-kit.tsx`、`plate-types.ts`、`markdown-document.ts`、`markdown-import.ts`、`transforms.ts`、`settings-dialog.tsx`、`document-toc-bridge.tsx`、`math-kit.tsx`
- `components/ui/` 下所有 Plate 节点组件与 `editor.tsx`/`editor-static.tsx`（逐个甄别，保留通用 UI：`button`/`popover`/`tooltip`/`calendar`/`alert-dialog`/`input-group`/`hover-card`/`resize-handle`/`toolbar`/dropdown 相关）
- `components/workspace/workspace-document-transfer.ts`、`workspace-export-archive.ts`
- 相关测试：`__tests__/` 下涉及 Plate 的测试删除/重写

**文件新增：**

- `components/editor/markora-editor.tsx`
- `components/editor/markora-frontmatter.ts`
- `components/editor/use-markora-toc.ts`（TOC 桥逻辑，从 document-toc-bridge 演化）

## 测试策略

TDD，vitest：

- **新增 `markora-frontmatter.test.ts`**：frontmatter 解析 / 序列化、H1 正则提取、title 规范化、边界（无 frontmatter、无 H1、空文档）。
- **新增 `markora-editor.test.tsx`**：渲染、markdown 双向同步（输入 → onChange、外部 value 变更 → 编辑器更新）、Cmd/Ctrl+S 触发 `onSaveRequested`、切换 `documentKey` 重建编辑器、主题映射。
- **新增 `use-markora-toc.test.ts`**：mock CodeMirror view → TOC items 提取、active 标题计算、`scrollToHeading` 调用 `view.dispatch` 带 `scrollIntoView` effect。
- **重写 `use-workspace` 相关测试**：纯 markdown 草稿流转、H1 → 文件名防抖重命名、文件树重命名 → 读盘刷新、缺失 H1 补偿。
- **删除**：`plate-editor.test.tsx`、`markdown-document.test.ts`、`markdown-import.test.ts`、`document-toc-bridge.test.tsx`、`excalidraw-kit.test.ts`、`title-sync-utils.test.ts` 中基于 Plate value 的用例（保留 H1 正则相关用例并迁移到 frontmatter 测试）。
- 现有 workspace-layout / document-tree / workspace-api 等不涉及 Plate 的测试保持绿色。

## 验收标准

1. Tauri 桌面端打开工作区 → 打开 `.md` → 编辑实时保存到磁盘（验证文件内容变化）。
2. 修改 H1 → 文件名防抖重命名生效；文件树重命名 → H1 平滑更新。
3. 右侧 TOC 面板显示标题（H2-H6）、点击跳转、滚动高亮当前标题。
4. 粘贴 / 拖拽图片 → 写入 workspace assets 目录、markdown 插入引用、编辑器正常显示。
5. 主题切换 light/dark → 编辑器主题跟随。
6. `pnpm test`、`pnpm lint`、`pnpm build`（next build）全绿。
7. 仓库内无 `platejs` / `@platejs` 残留引用（`grep -ri "platejs\|@platejs" --include="*.ts" --include="*.tsx" .` 确认，排除 node_modules）。`slate` 是 platejs 的传递依赖，删除 `@platejs/*` 后自动消失。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 一次性删除量大，遗漏引用导致编译失败 | 按"先加 MarkoraEditor + 新数据模型 → 切换 workspace-layout 引用 → 删除 Plate 文件 → 删除依赖"顺序推进，每步 `pnpm build` 验证 |
| markora `onTocChange` 的 active 跟踪只在自己面板生效，右侧面板需自算 | 用 `updateListener` + `coordsAtPos` 自算 active，单独测试 |
| 附件 uploader 写入失败时 markora 会插入失败占位，需用户可见反馈 | 复用现有 toast（sonner），uploader 抛错时提示 |
| CodeMirror SSR 与 Next.js App Router 兼容 | MarkoraEditor 标 `'use client'`；必要时动态导入 |
| `package.json` 同时存在 `package-lock.json`（npm）和 `pnpm-lock.yaml`（pnpm）两套锁文件 | 项目 `package.json` 未声明 `packageManager`，脚本以 pnpm 为准（`pnpm-lock.yaml` 较新）。实施统一用 pnpm，删除 `package-lock.json` 避免歧义 |

# Markdown-Centered Refinex Document Architecture Design

## 背景

当前 Refinex Wiki 的文档热路径以 `.plate.json` 为主：目录树扫描、文档读取、保存、预览、导入、导出、本地资产清理和测试数据都围绕 Plate 原生 JSON envelope 工作。这种模型对 Plate 运行时直接、快速，但跨平台通用性弱，Git diff 噪音大，也让 AI 面板只能通过临时 Markdown 转换理解文档。

当前 AI 链路已经证明 Markdown 是更稳定的语义表达层：服务端接收 Plate `children` 和 `selection` 后，使用 `getMarkdown` / `getMarkdownWithSelection` 构造 Markdown 或 MDX prompt；编辑、生成、评论和表格工具也要求模型输出 Markdown、MDX 或结构化 JSON。因此新的文档架构应让存储真值与 AI 处理格式一致。

本设计取代 `.plate.json` 作为主文档格式的长期方向，但不删除旧规格，便于实现迁移时对照历史设计。

## 决策

Refinex Wiki 采用 Markdown-centered 文档架构：

- `.md` 是默认新建和编辑的主文档格式。
- `.md/.mdx` 文件是文档正文和扩展语义的唯一真值。
- PlateJS 是查看、编辑、选区定位、富渲染和变更应用层，不再是主存储格式。
- 标准 Markdown 能表达的内容必须优先使用标准语法。
- Plate 标准 Markdown 以外的能力使用 Refinex Markdown Dialect 扩展语法，仍内嵌保存在同一个 `.md` 文件中。
- `.refinex/` 只保存工作区 UI 状态、排序、资产索引、迁移报告等工作区级元数据，不保存文档正文语义。

这意味着普通 Markdown 工具可以读取标准部分；Refinex 扩展块在第三方工具中是否完整渲染不是目标。取舍类似 Notion 导出 Markdown 时保留部分 HTML/XML 风格结构：第三方可读，Refinex 可逆。

## 目标

- 以 `.md` 为中心提供新建、打开、编辑、保存、搜索、预览和 Git diff。
- 支持完整标准 Markdown 能力，包括 CommonMark、GFM、任务列表、表格、脚注、数学公式、代码块、链接、图片等。
- 用 Refinex Markdown Dialect 承载 Plate 专有节点，并保证 Refinex 内部可逆解析和渲染。
- 让 AI 面板直接围绕最终存储格式 Markdown 工作，减少 JSON 中间态造成的不稳定。
- 从现有 `.plate.json` 工作区提供可控迁移路径。
- 保持 Rust/Tauri 作为本地文件系统安全边界。

## 非目标

- 不追求第三方 Markdown 软件正确渲染所有 Refinex 扩展语法。
- 不在第一阶段实现所有 Plate 高级节点的完美可逆映射。
- 不把正文语义拆分到 sidecar 文件。
- 不引入远程同步、多人协作或数据库存储。
- 不让前端直接绕过 Rust command 任意读写工作区文件。

## 文档格式

默认新建文档使用 `.md`。`.mdx` 可以打开和保留，但默认不新建，避免普通用户误解。

文档级元信息使用 YAML frontmatter：

```md
---
title: 文档标题
createdAt: 2026-06-05T12:00:00.000Z
updatedAt: 2026-06-05T12:00:00.000Z
refinexDialect: 1
---

# 文档标题

正文内容。
```

标题读取优先级：

1. frontmatter `title`
2. 第一个 H1
3. 文件名 stem

`updatedAt` 只在正文或标题变化时更新，避免无意义 Git diff。

## Refinex Markdown Dialect

扩展语法遵循三条原则：

- 标准优先：能用 Markdown/GFM/remark-math 表达的内容不发明新语法。
- 前缀稳定：自定义标签和 directive 使用 `refinex-` 前缀，避免和普通 HTML/MDX 混淆。
- 可逆优先：`Markdown -> Plate Value -> Markdown` 不应无故丢字段。

推荐映射：

| Plate 能力 | Markdown 存储策略 |
| --- | --- |
| 标题、段落、引用、分割线 | 标准 Markdown |
| 粗体、斜体、删除线、行内代码、链接 | 标准 Markdown / GFM |
| 表格、任务列表、脚注、数学公式 | GFM / remark-math |
| 图片、视频、文件 | 标准图片语法优先，必要时使用 `refinex-asset://` 或相对路径 |
| Mermaid / PlantUML / Graphviz | fenced code block：`mermaid` / `plantuml` / `dot` |
| Callout | `:::refinex-callout{type="info"}` directive |
| Toggle | `<refinex-toggle title="...">...</refinex-toggle>` |
| Columns | `<refinex-columns>` + `<refinex-column>` |
| TOC | `<refinex-toc depth="3" />` |
| Date | `<refinex-date value="2026-06-05" />` |
| Mention | `<refinex-mention id="..." label="..." />` |
| Excalidraw | fenced code block：`refinex-excalidraw` |
| 评论、建议 | 后续阶段用 `refinex-comment` / `refinex-suggestion` 标记，第一阶段不强制持久化 |

示例：

````md
# 产品设计

:::refinex-callout{type="warning"}
这里是提醒内容。
:::

<refinex-toggle title="展开高级配置">

- 配置 A
- 配置 B

</refinex-toggle>

<refinex-columns>
<refinex-column width="50%">

左侧内容

</refinex-column>
<refinex-column width="50%">

右侧内容

</refinex-column>
</refinex-columns>

```mermaid
flowchart TD
  A --> B
```

```refinex-excalidraw
{"version":1,"elements":[]}
```
````

复杂 JSON 块默认视为 opaque block。AI 可以整体移动、删除或替换，但不能默认局部修改内部 JSON。

## 读写架构

运行时数据流：

```text
open .md
-> Rust 校验路径、读取 UTF-8 文本和 modifiedAt
-> 前端 MarkdownDocumentParser 解析 frontmatter + Markdown body
-> Plate MarkdownPlugin + RefinexMarkdownExtensionRules 反序列化为 Plate Value
-> Plate 编辑器编辑
-> Plate Value 序列化为 Refinex Markdown
-> Rust 原子写回同一个 .md
```

边界：

- Rust 层负责安全路径、读写、重命名、移动、删除、原子写入、mtime 冲突检测和资产文件落盘。
- 前端文档层负责 frontmatter 解析、Markdown dialect 解析、Plate Value 互转和扩展语法规则。
- Plate 层只接收和产出 `Value`，不直接知道文件系统。
- AI 层直接以 Markdown/MDX 文本作为主要上下文。

保存策略：

- 打开时保留原始 Markdown 快照和 `modifiedAt`。
- 编辑后由 Plate Value 序列化为完整 Markdown 字符串。
- 800ms debounce 自动保存，`Cmd/Ctrl + S` 立即保存。
- Rust 使用临时文件 + rename 写入，避免半写坏文档。
- 保存前比较磁盘 `modifiedAt`，发现外部修改则进入冲突状态，不直接覆盖。

## AI 面板模型

AI 面板以 Markdown 真值为最高优先级上下文，Plate Value 只用于选区定位、块 ID 和应用结果。

数据流：

```text
.md 原文
-> MarkdownParser 生成 Plate Value
-> 用户选区
-> AIContextBuilder 从 Plate selection 取选区 Markdown
-> 模型输出 Markdown / JSON patch / comment data
-> AIApplier 应用到 Plate Value
-> MarkdownSerializer 生成新的 .md
-> 保存
```

规则：

- 全文任务直接提供当前 Markdown body，不提供 Plate JSON。
- 选区编辑继续用 `<Selection>` 标记包住 Markdown 片段。
- 评论任务使用 `<block id="...">...</block>` 包住 Markdown 块，block id 只用于定位，不写入最终 `.md`。
- 表格任务继续使用 Markdown table + `<CellRef />`。
- prompt 明确要求保留 `refinex-*` 标签、directive、fenced JSON，除非用户明确要求修改。
- AI 输出必须先经过 Markdown parser 校验；如果破坏 frontmatter、扩展标签配对或 fenced block，拒绝自动应用并进入预览或错误状态。

## 迁移策略

迁移从显式入口触发，不静默改写用户文件。

流程：

```text
扫描 .plate.json
-> 生成同名 .md
-> Plate Value 序列化为 Refinex Markdown
-> 原 .plate.json 移到 .refinex/migrations/backup/
-> 记录 migration report
-> 刷新目录树
```

规则：

- 已存在同名 `.md` 时追加 `-1`、`-2`。
- 迁移失败的文件保留原样。
- 第一阶段允许打开旧 `.plate.json` 只读或提示迁移，不继续维护双写。
- 迁移报告记录源路径、目标路径、结果、失败原因和时间。

## 资产策略

保留当前 `.refinex/assets/files/...` 和资产索引方向。Markdown 正文通过 `refinex-asset://` 引用工作区资产：

```md
![架构图](refinex-asset://sha256...)
```

渲染时 Refinex 将 `refinex-asset://` 解析为真实本地文件。删除文档或目录时，Rust 从 Markdown 文本扫描 `refinex-asset://` 引用，确认没有其他 `.md/.mdx` 引用后再清理资产。

导出时可以选择：

- 转换为相对路径。
- 转换为 base64 inline。
- 保留 `refinex-asset://`。

第一阶段保留现有导出体验，后续按用户场景增加选项。

## 搜索、预览和 Git

搜索和预览不应完整初始化 Plate editor：

- 标题优先 frontmatter `title`，其次 H1，最后文件名。
- 摘要剥离 frontmatter、代码块和大型扩展块后提取纯文本。
- 扩展块按标签和可读内容参与搜索，大型 JSON 默认不索引。
- 只有打开文档时才构造完整 Plate Value。

Git 收益：

- diff 从 JSON 结构噪音变成 Markdown 文本 diff。
- AI 修改结果能被 Git 面板直接阅读。
- 文档重命名就是 `.md` 文件重命名。
- frontmatter 更新产生少量 diff，属于可接受成本。

## 错误处理

- 路径越界：Rust canonicalize 后拒绝工作区外读写。
- 非 UTF-8：提示仅支持 UTF-8 Markdown 文档。
- frontmatter 损坏：保留正文，标题使用 H1 或文件名兜底。
- Refinex 扩展语法损坏：降级为普通代码块或 HTML 块展示，不让编辑器崩溃。
- 保存冲突：提供重新加载、另存副本、覆盖三种动作。
- 写入中断：临时文件 + rename 保证旧文件仍可用。
- AI 输出损坏：拒绝自动应用，保留原文和当前编辑器内容。

## 性能策略

- 打开文档时只解析当前 `.md`。
- 目录树只扫描目录和 `.md/.mdx`，跳过 `.refinex/.git/node_modules/target/dist/build`。
- 预览和搜索使用轻量 Markdown 文本提取。
- 保存使用 debounce，复杂序列化可放入异步任务。
- 超过 1MB 的文档提示性能风险，但仍允许打开。
- 资产清理异步扫描引用，不阻塞保存主链路。

## 测试策略

Rust 测试：

- 目录树只展示目录和 `.md/.mdx` 文档。
- 拒绝路径越界。
- 读写 UTF-8 Markdown 文档。
- 原子写入失败不破坏旧文件。
- 删除文档后扫描并清理未引用资产。
- `.plate.json -> .md` 迁移成功和失败分支。

前端测试：

- Markdown 打开后正确生成 Plate Value。
- Plate 编辑后序列化回 Refinex Markdown。
- frontmatter/H1/文件名标题优先级正确。
- callout、toggle、columns、toc、date、excalidraw round-trip。
- AI 选区 prompt 使用 Markdown 而不是 JSON。
- 损坏扩展语法降级展示。
- 外部修改冲突不覆盖用户数据。

集成验证：

- 新建 `.md`、编辑、保存、重新打开内容一致。
- 导入现有 Markdown 后 Git diff 可读。
- 使用 AI 改写选区后，保存的 `.md` 是模型输出的 Markdown。
- 旧 `.plate.json` 迁移后可打开。

## 阶段拆分

### 第一阶段：Markdown 主热路径

- 新建、打开、保存 `.md`。
- frontmatter 解析与序列化。
- 标准 Markdown、GFM、math、Mermaid/code drawing。
- 目录树、搜索、预览、Git 基础改造。
- `.plate.json` 显式迁移入口。

### 第二阶段：Refinex 扩展语法

- callout、toggle、columns、toc、date、mention。
- 扩展语法 round-trip 测试。
- AI prompt 保护扩展块。

### 第三阶段：高级编辑状态

- comment、suggestion 持久化策略。
- 冲突 UI。
- 大文档优化。
- 更完整的 Markdown/HTML/Word/PDF/Image 导出策略。

## 已确认决策

- `.md` 是默认主文档格式。
- PlateJS 是查看和编辑层，不是主存储格式。
- Plate 标准 Markdown 以外的能力使用 Refinex 扩展语法内嵌在 `.md` 中。
- 第三方 Markdown 软件是否完整渲染 Refinex 扩展不是目标。
- AI 面板以 Markdown 真值为主要上下文。
- `.refinex/` 不保存正文语义，只保存工作区级元数据、资产索引和迁移报告。

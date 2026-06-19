---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Right Side Document TOC Design

## 背景

Refinex Wiki 当前已经具备基于 Plate 的原生文档编辑能力，并在编辑器插件集中接入了 `@platejs/toc`。现有目录能力是正文内的 `toc` 块：用户可以把目录作为文档内容插入编辑区。

本次需求不是新增一个正文块，而是在右侧工具栏中，在 AI 图标下方增加目录图标。点击目录图标后，右侧面板展示当前文档目录。目录不包含一级标题，活跃目录项随编辑器滚动更新，点击目录项后滚动到对应标题位置。

## 目标

- 右侧工具栏支持 AI 和目录两个互斥入口。
- 点击目录图标时，复用右侧面板区域展示目录面板。
- 目录列表从二级标题开始，不展示一级标题。
- 活跃目录项随当前文档滚动自动切换。
- 点击目录项平滑滚动到对应标题位置。
- 尽量复用 Plate TOC 的 heading list、active heading 和 scroll 机制。

## 非目标

- 不移除或重写正文内 `toc` 块。
- 不把右侧目录写入文档内容。
- 不实现目录拖拽重排、标题重命名或层级编辑。
- 不实现多面板同时展开。
- 不在本阶段接入 AI 生成大纲能力。
- 不支持跨文档目录或全工作区目录。

## PlateJS 依据

Plate TOC 插件提供以下能力：

- `TocPlugin`：负责目录插件配置，支持 `topOffset` 和 `isScroll` 等滚动选项。
- `useTocElementState`：提供 `headingList`、`activeContentId` 和 `onContentScroll`。
- `useTocElement`：提供目录项点击滚动所需的交互 props。

设计原则是把这些能力用于外置右侧面板，而不是手写一套基于 DOM 查询的标题解析和滚动逻辑。只有当外置面板无法直接使用现有 TOC hooks 时，才补一个共享 hook，把 heading 提取、过滤和滚动封装在编辑器上下文内。

## 右侧面板模型

当前 `AiSidePanel` 同时承担右侧面板内容和右侧工具栏。新设计将它拆成更清晰的两个职责：

- `RightToolRail`：渲染右侧工具按钮。
- `RightSidePanel`：根据当前模式渲染面板内容。

右侧面板模式：

```ts
type RightPanelMode = 'ai' | 'toc' | null;
```

交互规则：

- 当前为 `null`，点击 AI 图标切到 `ai`。
- 当前为 `null`，点击目录图标切到 `toc`。
- 当前为 `ai`，点击目录图标切到 `toc`。
- 当前为 `toc`，点击 AI 图标切到 `ai`。
- 当前为 `ai`，再次点击 AI 图标折叠为 `null`。
- 当前为 `toc`，再次点击目录图标折叠为 `null`。

右侧同一时间只展示一个面板。激活的工具图标使用现有蓝色高亮样式，未激活图标保持灰色 hover 样式。

## 组件边界

推荐组件边界：

- `WorkspaceLayout`：持有 `rightPanelMode`，装配编辑区、右侧面板和右侧工具栏。
- `RightSidePanel`：根据 `mode` 渲染 `AiPanelContent` 或 `DocumentTocPanel`。
- `RightToolRail`：渲染 AI 图标和目录图标，向上报告模式切换。
- `AiPanelContent`：保留现有 AI 占位内容。
- `DocumentTocPanel`：渲染当前文档目录。

`DocumentTocPanel` 必须在当前 `<Plate>` 上下文内或可访问当前 Plate editor 的范围内渲染。这样它才能使用 Plate 的编辑器状态和 TOC 插件状态。若右侧面板保持在 `PlateEditor` 外部，则需要把目录面板的渲染入口移入 `PlateEditor` 的 `<Plate>` 子树，再通过 props 或 portal 放置到右侧面板容器。

## 目录数据规则

目录来源为当前文档 Plate value 中的 heading 节点。

过滤规则：

- 排除 `h1`。
- 展示 `h2` 到 `h6`。
- 空标题不展示。
- 重复标题允许出现，使用 Plate heading id 作为 React key 和滚动目标。

视觉层级归一化：

- `h2` 显示为一级目录缩进。
- `h3` 显示为二级目录缩进。
- `h4` 及以下继续递进，但视觉上建议最多使用三级缩进，避免右侧面板过窄时过度凹陷。

空状态：

- 当前没有文档：显示“未选择文档”。
- 当前文档没有 `h2` 及以下标题：显示“暂无可显示目录”。

## 活跃目录

活跃目录优先使用 Plate TOC 的 `activeContentId`。

行为要求：

- 用户滚动编辑器时，目录面板中的活跃项随当前可见标题变化。
- 活跃项使用文本加深、左侧强调线或浅色背景，但不能造成布局跳动。
- 如果当前活跃标题是 `h1`，目录面板不显示 `h1`，活跃项应落到后续可见的 `h2+` 标题；若没有可见项，则不高亮。
- 点击目录项触发 smooth scroll，并使用与编辑器固定工具栏匹配的 `topOffset`。

## 滚动行为

点击目录项调用 Plate TOC 的滚动处理，不直接调用 `element.scrollIntoView` 作为首选实现。

滚动参数：

- `behavior: 'smooth'`
- `topOffset: 80`

如果实际编辑器顶部工具栏高度在工作区模式下变化，`topOffset` 可在实现阶段调整，但必须在目录和正文 TOC 间保持一致。

## UI 设计

右侧工具栏：

- AI 图标保持现状。
- 目录图标放在 AI 图标下方。
- 目录图标建议使用 `ListTree` 或语义相近的 lucide 图标。
- 两个图标尺寸、hover、active 样式一致。

目录面板：

- 宽度沿用当前右侧面板宽度，约 `340px`。
- 面板标题为“目录”。
- 内容区使用紧凑列表，适合反复浏览和点击。
- 每个目录项单行截断，保留 tooltip 可作为后续增强。
- 目录项高度稳定，避免活跃状态导致布局变化。
- 不使用大卡片或营销式布局。

## 数据流

`WorkspaceLayout` 管理右侧模式：

```text
RightToolRail click -> setRightPanelMode -> RightSidePanel render content
```

目录面板读取编辑器状态：

```text
Plate editor value -> TocPlugin headingList -> filter out h1 -> render toc items
editor scroll -> activeContentId -> update active item
toc item click -> TocPlugin scroll handler -> editor scrolls to heading
```

AI 面板与目录面板共享右侧容器，但不共享内部业务状态。

## 错误处理

- 没有当前文档时，目录面板显示空状态，不报错。
- 当前文档加载失败时，目录面板显示“文档未加载”或保持空状态。
- heading 缺少 id 时不应让面板崩溃；实现阶段应确认 Plate heading 插件是否稳定提供 id，必要时沿用 TocPlugin 的 heading 结果而不是自己构造 id。
- 滚动目标不存在时忽略点击，不抛出用户可见错误。

## 测试策略

组件测试：

- 右侧工具栏能在 AI、目录、折叠三种状态间切换。
- AI 和目录面板互斥展示。
- 当前激活工具图标有 active 样式。
- 目录面板不展示 `h1`。
- 目录面板展示 `h2`、`h3`，并按归一化层级缩进。
- 没有 `h2+` 标题时展示空状态。

编辑器集成测试：

- 当前文档 value 变化后目录列表更新。
- 滚动编辑器时活跃目录项变化。
- 点击目录项触发对应 heading 的滚动处理。

手动验证：

- 打开含 `h1/h2/h3/h4` 的文档。
- 点击右侧目录图标，确认只展示 `h2+`。
- 滚动长文档，确认高亮随滚动切换。
- 点击目录项，确认编辑器滚动到对应标题。
- AI 面板和目录面板切换时，编辑区宽度变化稳定，无明显跳动。

## 已确认决策

- 展示方式：复用右侧面板区域。
- 右侧同一时间只展示一个面板。
- 目录图标放在 AI 图标下方。
- 目录不包含一级标题。
- 目录活跃项随文档滚动切换。
- 点击目录项滚动到对应标题。
- 基于 PlateJS TOC 机制设计，不重新手写标题解析和滚动机制。

---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 外观设置设计

## 背景

设置面板当前只有“存储”配置。用户希望新增“外观”设置项，支持：

- 主题：亮色、暗色、跟随系统。
- 页面宽度：标准、全宽。标准保持当前编辑器默认文档宽度；全宽让正文占编辑器区域的 75%。

本次只设计设置面板和编辑器宽度能力，不扩展其他外观项。

## 目标

- 在设置面板左侧新增“外观”，并与“存储”形成清晰的左右布局。
- 主题设置复用现有主题系统，选择后立即影响应用外观和 Tauri 窗口主题。
- 页面宽度作为全局应用设置保存，所有工作区一致生效。
- 设置搜索具备真实过滤能力，能命中外观相关设置项。
- 保持“标准”宽度完全兼容当前编辑器表现。

## 非目标

- 不新增按工作区保存的页面宽度。
- 不把主题重复写入 Tauri `settings.json`。
- 不重新设计设置面板整体视觉体系。
- 不处理字体、字号、行距、工具栏密度等其他外观配置。

## 设计方案

采用轻量集成现有设置模型。

主题继续由 `next-themes` 管理。当前 `components/theme-provider.tsx` 已经通过 `next-themes` 处理 `light`、`dark`、`system`，并把解析后的主题同步给 Tauri 窗口，所以设置面板只需要调用 `setTheme()`。

页面宽度进入现有 `AppSettings`：

```ts
interface AppSettings {
  schemaVersion: 1;
  storage: {
    defaultProvider: 'local';
  };
  appearance: {
    pageWidthMode: 'standard' | 'wide';
  };
}
```

默认值为：

```ts
appearance: {
  pageWidthMode: 'standard',
}
```

旧设置文件如果缺少 `appearance`，读取后按默认值补齐，避免升级后报“应用设置格式损坏”。

## 设置面板

`WorkspaceSettingsDialog` 扩展为多设置项结构：

- 左侧导航：
  - 外观
  - 存储
- 右侧内容：
  - 当前选中“外观”时显示主题和页面宽度。
  - 当前选中“存储”时保留现有本地存储配置。

“外观”面板包含两组控件：

- 主题：分段选择“跟随系统 / 亮色 / 暗色”。
- 页面宽度：分段选择“标准 / 全宽”。

搜索行为：

- 输入为空时显示全部设置项，默认选中“外观”。
- 输入命中某个设置分类或字段时，只显示匹配分类和字段。
- 搜索词覆盖：
  - 外观、主题、亮色、暗色、系统、跟随系统。
  - 页面宽度、文档宽度、阅读宽度、标准、全宽、75%。
  - 保留现有存储相关搜索词。
- 如果当前选中项被搜索过滤隐藏，则自动切到第一个可见设置项。
- 没有匹配项时显示“未找到设置”空状态。

## 数据流

页面宽度的数据流如下：

1. 工作区布局初始化时调用 `readAppSettings()`。
2. 读取到 `appearance.pageWidthMode` 后存入布局状态。
3. 布局把 `pageWidthMode` 传给 `PlateEditor`。
4. `PlateEditor` 把宽度模式映射到 `Editor` 的展示 variant 或 class。
5. 用户在设置面板点击“应用”或“确定”后调用 `saveAppSettings()`。
6. 保存成功后通过回调更新工作区布局状态，编辑器立即应用新宽度。

非 Tauri 环境不调用原生命令，使用默认 `standard`，保证 Web 预览和单元测试稳定。

主题的数据流如下：

1. 设置面板读取 `useTheme()` 的 `theme`。
2. 用户选择主题后调用 `setTheme('system' | 'light' | 'dark')`。
3. `ThemeProvider` 继续负责 class 切换、本地持久化和 Tauri 窗口同步。

## 编辑器宽度

标准模式保持现有 workspace 编辑器宽度不变：

- 当前 `Editor` 的默认 padding 和内容宽度不调整。
- 现有文档布局、滚动条和工具栏表现不应回归。

全宽模式新增 workspace 专用宽度：

- 正文区域占编辑器滚动区域的 75%。
- 通过左右各 `12.5%` padding 实现。
- 小屏幕仍保留安全内边距，避免内容贴边。
- 该模式只影响 workspace 编辑器，不改变 demo 编辑器或其他静态渲染组件。

## 错误处理

- 读取设置失败：设置面板显示错误信息，保留默认设置，允许用户关闭弹窗。
- 保存设置失败：弹窗保持打开，底部显示错误信息，不覆盖当前 UI 选择。
- 设置版本不支持：沿用现有“应用设置版本不支持”错误。
- 页面宽度值非法：保存端拒绝，前端回退到 `standard`。

## 测试计划

- `WorkspaceSettingsDialog`：
  - 渲染“外观”和“存储”导航项。
  - 默认显示“外观”面板。
  - 搜索“主题”“全宽”“亮色”能显示外观相关内容。
  - 搜索无结果时显示空状态。
  - 切换页面宽度并应用时保存 `appearance.pageWidthMode`。
  - 切换主题时调用 `setTheme()`。

- `WorkspaceLayout`：
  - 初始化读取 `AppSettings.appearance.pageWidthMode`。
  - 保存设置后实时更新传给 `PlateEditor` 的宽度模式。
  - 非 Tauri 环境使用默认 `standard`。

- `PlateEditor` / `Editor`：
  - 标准模式沿用现有 class。
  - 全宽模式使用 75% 内容宽度。

- Tauri settings：
  - 缺少 `appearance` 的旧设置可以成功读取并补默认值。
  - 保存非法 `pageWidthMode` 返回错误。
  - 默认设置包含 `appearance.pageWidthMode = standard`。

## 验收标准

- 右下角设置菜单进入设置面板后，可以看到“外观”和“存储”。
- 主题可在设置面板内切换为亮色、暗色、跟随系统，并立即生效。
- 页面宽度可在标准和全宽之间切换，点击“应用”或“确定”后编辑器立即变化。
- 标准宽度与当前编辑器默认宽度一致。
- 全宽模式下正文宽度约为编辑器区域的 75%。
- 设置面板搜索不是假搜索，能过滤外观和存储配置。

---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 可拖拽工作区侧栏设计

## 背景

工作区当前左侧目录树固定为 `280px`，右侧 AI/目录面板固定为 `340px`。在不同屏幕宽度和不同工作流下，用户需要临时放大目录树或右侧辅助信息，但不能让编辑区被过度挤压。

## 目标

- 左侧目录树和右侧面板支持横向拖拽调整宽度。
- 当前默认宽度就是最小宽度：左侧 `280px`，右侧 `340px`。
- 控制最大宽度：左侧 `420px`，右侧 `520px`。
- hover 和拖拽反馈克制，仅显示细窄分隔线和轻微强调色。
- 面板折叠后再次展开保留最近一次宽度。
- 刷新页面后保留用户设置的宽度。

## 非目标

- 不改动左侧工具栏、右侧工具栏和编辑器内容布局。
- 不提供设置面板中的宽度配置项。
- 不实现多套布局预设。

## 交互设计

左侧目录树和编辑器之间、编辑器和右侧面板之间各放置一个独立拖拽手柄。手柄实际命中宽度为 `10px`，视觉线条默认近乎不可见；鼠标 hover 时显示 `2px` 蓝色线条，拖拽时提高透明度并禁止文本选择。

手柄使用 `role="separator"` 和 `aria-orientation="vertical"`，支持键盘微调：左右方向键每次调整 `16px`，`Home` 回到最小宽度，`End` 调到最大宽度。键盘能力避免鼠标拖拽成为唯一入口。

左侧目录折叠时不显示左侧手柄；右侧面板关闭时不显示右侧手柄。面板再次打开时使用上次宽度。

## 状态与存储

新增工作区布局宽度状态：

- `leftSidebarWidth`：默认 `280`，范围 `280-420`
- `rightPanelWidth`：默认 `340`，范围 `340-520`

宽度持久化到 `localStorage`：

- `refinex-wiki:workspace:left-sidebar-width`
- `refinex-wiki:workspace:right-panel-width`

读取时会校验数字并夹紧到允许范围，避免旧值或异常值破坏布局。

## 组件边界

- `workspace-layout.tsx` 负责持有宽度状态、插入左右拖拽手柄，并把宽度传给左右面板。
- `workspace-sidebar.tsx` 接收 `width`，只负责渲染目录树区域。
- `ai-side-panel.tsx` 的 `RightSidePanel` 接收 `width`，只负责渲染 AI/目录面板内容。
- 新增 `workspace-resize-handle.tsx` 封装拖拽和键盘交互，避免把 pointer 事件细节散落在布局文件中。

## 测试

扩展 `workspace-layout.test.tsx`：

- 默认左侧宽度为 `280px`，右侧打开后宽度为 `340px`。
- 拖拽左侧手柄时宽度被限制在 `280-420px`。
- 拖拽右侧手柄时宽度被限制在 `340-520px`。
- 本地存储存在越界值时会被夹紧。
- 折叠/展开面板后仍保留宽度。

完成后运行相关单测，并通过浏览器检查 hover、拖拽、折叠和展开效果。

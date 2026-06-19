---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Refinex Wiki 终端面板设计

## 背景

Refinex Wiki 已经具备左侧工具栏、Git 面板、Git 日志底部抽屉、差异视图和 Tauri v2 桌面运行时。现在需要新增一个接近 IDEA 体验的终端面板：入口放在左下角 Git 历史图标上方，点击后在底部打开与 Git 日志一致的面板块，默认工作目录为当前工作区根目录，支持亮色/暗色主题和多 Tab。

本设计只覆盖第一版可交付能力：真实交互式本地终端、多 Tab、主题一致、底部布局复用和生命周期管理。分屏终端、命令历史搜索、shell profile 设置、右键菜单、完整 shell integration 标记等高级能力留到后续阶段。

## 研究结论

VS Code 的终端产品形态是内嵌终端面板，默认从工作区根目录启动，并通过 shell integration 扩展链接、错误检测、当前目录检测和命令导航等能力。xterm.js 官方定位是网页终端模拟器，不是 shell；要与 bash/zsh 等进程交互，需要连接 PTY。node-pty 的官方文档说明它提供 pseudo-terminal 读写和 resize，并被 VS Code 使用。

IntelliJ IDEA 的终端是内置 Terminal 插件提供的工具窗口。JetBrains 文档说明 Classic 终端基于 JediTerm，用户输入直接发送到底层 shell；JetBrains 2025 新终端架构仍强调标准 xterm/VT100 兼容、TUI 程序可靠性和 IDE 工具窗口集成。

Tauri 的 shell 插件可以 spawn/execute 命令，但不是完整 PTY。要支持 `vim`、`less`、`top`、自动补全、Ctrl+C、窗口 resize、ANSI/TUI 程序，后端需要真正的 pseudo-terminal。

参考来源：

- VS Code Terminal Basics: https://code.visualstudio.com/docs/terminal/basics
- xterm.js: https://github.com/xtermjs/xterm.js
- node-pty: https://github.com/microsoft/node-pty
- IntelliJ IDEA Terminal: https://www.jetbrains.com/help/idea/terminal-emulator.html
- JetBrains Terminal 新架构: https://blog.jetbrains.com/idea/2025/04/jetbrains-terminal-a-new-architecture/
- portable-pty: https://docs.rs/portable-pty/latest/portable_pty/
- Tauri shell API: https://tauri.app/reference/javascript/shell/

## 方案选择

采用“xterm.js 前端渲染 + Rust portable-pty 后端 + Tauri IPC/事件流”的架构。

前端使用：

- `@xterm/xterm`：终端模拟器。
- `@xterm/addon-fit`：根据容器尺寸计算 cols/rows。
- `@xterm/addon-web-links`：识别终端输出中的 URL。

后端使用：

- `portable-pty`：跨平台 PTY。macOS/Linux 使用系统 PTY，Windows 使用 ConPTY 相关能力。
- Tauri command：创建、写入、resize、关闭终端会话。
- Tauri event 或 channel：从后端持续推送 PTY 输出、退出状态和错误。

不使用 `@tauri-apps/plugin-shell` 承担主终端能力，因为它更适合受限命令执行，不具备 IDE 级交互式终端需要的 PTY 行为。

## 用户界面

左侧工具栏：

- 保留顶部目录按钮和 Git 面板按钮。
- 在左下角 Git 历史图标上方新增终端图标，建议使用 lucide `SquareTerminal`。
- 终端面板打开时，终端图标使用与当前 Git 历史激活态一致的蓝色高亮。
- Git 历史和终端共用底部工具区，同一时间只展开一个底部面板，避免底部空间堆叠。

底部终端面板：

- 外层复用 Git 日志面板的视觉规则：`rounded-lg border bg-background shadow-sm`、与编辑块/侧边块一致的间距、同样的上下高度拖拽句柄。
- Header 左侧显示终端图标和标题 `终端`，后面显示当前工作区名。
- Header 中部或左侧紧随标题展示 Tab 列表。Tab 使用 IDEA 风格的紧凑 pill，例如 `本地`、`本地 2`，每个 Tab 有关闭按钮。
- Header 右侧提供新增 Tab、更多菜单和关闭面板按钮。第一版新增 Tab 使用默认系统 shell，不提供 profile 下拉配置。
- 内容区只显示当前激活 Tab 的 xterm 实例。

主题：

- 终端背景、前景、选区、光标、ANSI 基础色从 CSS 变量映射。
- 亮色主题下背景与编辑区/面板一致。
- 暗色主题下终端背景与底部面板一致，不出现白色终端底、不出现与卡片不一致的色差。
- 主题切换时更新 xterm `theme` option，并触发 redraw/fit。

滚动条：

- 使用 xterm.js 自身 viewport，但通过外层样式和主题尽量保持细滚动条质感。
- 不引入粗大的浏览器默认滚动条。

## 终端会话模型

前端维护：

```ts
type TerminalTab = {
  id: string;
  title: string;
  cwd: string;
  status: 'starting' | 'running' | 'exited' | 'error';
};
```

后端维护：

```rust
struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}
```

每个 session 包含 PTY master/writer、子进程句柄、reader thread 控制信息和当前尺寸。

默认 shell：

- macOS/Linux：优先 `$SHELL`，缺失时 macOS 使用 `/bin/zsh`，Linux 使用 `/bin/bash` 或 `/bin/sh`。
- Windows：优先 PowerShell，缺失时使用 `cmd.exe`。

默认 cwd：

- 使用当前 `workspace.snapshot.rootPath`。
- 后端 canonicalize 路径，确认目录存在且为当前工作区根目录或允许的工作区路径。

## 后端命令

新增 Tauri 命令：

- `terminal_spawn(root_path, cols, rows) -> TerminalSessionInfo`
- `terminal_write(session_id, data) -> ()`
- `terminal_resize(session_id, cols, rows) -> ()`
- `terminal_kill(session_id) -> ()`

新增事件：

- `terminal:data`：payload `{ sessionId, data }`
- `terminal:exit`：payload `{ sessionId, code }`
- `terminal:error`：payload `{ sessionId, message }`

输出读取：

- 每个 PTY reader thread 从 master 持续读取字节。
- 输出用 UTF-8 lossless/lossy 策略转换为字符串后推送给前端；二进制控制序列保持原始终端语义。
- session kill、子进程退出、读失败时清理状态并发出 exit/error。

Resize：

- 前端 `ResizeObserver` 触发 `FitAddon.fit()`。
- 读取 xterm 当前 cols/rows 后调用 `terminal_resize`。
- 后端通过 PTY resize API 更新终端尺寸。

## 前端组件边界

新增组件：

- `components/workspace/terminal-panel.tsx`
  - 负责面板 UI、Tab header、关闭/新增/切换。
  - 不直接持有 Rust 细节，只调用 workspace API。

- `components/workspace/xterm-terminal.tsx`
  - client-only 动态加载 xterm。
  - 管理 Terminal、FitAddon、WebLinksAddon、输入输出绑定、theme 更新和 resize。

新增 API 封装：

- `terminalSpawn`
- `terminalWrite`
- `terminalResize`
- `terminalKill`
- `listenTerminalData`
- `listenTerminalExit`
- `listenTerminalError`

`workspace-layout.tsx` 调整：

- 增加底部面板模式：`'git-log' | 'terminal' | null`。
- Git 历史和终端入口切换同一个底部区域。
- 终端高度使用独立 localStorage key 或复用统一 bottom panel 高度。第一版建议独立存储 `terminalHeight`，避免影响用户已调整好的 Git 日志高度。

## 错误处理

- 非 Tauri 环境：终端入口可展示不可用状态，不尝试创建 PTY。
- 未打开工作区：点击终端显示空状态，引导先打开工作区。
- PTY 创建失败：在面板内显示错误信息，并保留新增 Tab 按钮方便重试。
- shell 不存在：后端返回明确错误。
- session 异常退出：Tab 状态显示 `已退出`，终端保留输出，用户可以关闭或新建 Tab。
- 面板关闭：默认不 kill session，只隐藏面板；关闭 Tab 才 kill session。应用退出时由后端统一清理。

## 安全边界

- 终端只在用户已打开的本地工作区根目录启动。
- 后端不接受任意 shell 参数输入，第一版不支持前端指定 shell 路径。
- 不把终端输出写入日志，避免泄露命令输出或环境变量。
- 不自动执行任何命令，只启动用户默认 shell。
- 关闭 Tab 时终止对应进程，避免后台残留。

## 测试与验证

前端测试：

- `WorkspaceLayout`：终端图标出现在 Git 历史图标上方；点击后打开终端面板；再次点击切换/关闭行为正确。
- `TerminalPanel`：新增 Tab、切换 Tab、关闭 Tab、空状态、错误状态。
- `XtermTerminal`：mock xterm，验证 `onData -> terminalWrite`、resize -> `terminalResize`、theme 变化更新 option。

Rust 测试：

- shell 选择逻辑。
- root path 校验。
- session id 创建和状态清理。
- resize 参数边界。

手工验证：

- `npm run test:run`
- `npm run lint`
- `npm run build`
- `cargo test`
- `npm run desktop:dev` 下实际打开终端，执行 `pwd`、`ls`、`git status`、Ctrl+C、resize、多 Tab、暗色/亮色切换。

## 非目标

- 不在第一版实现终端分屏。
- 不在第一版实现完整 shell integration 命令标记。
- 不在第一版实现命令历史搜索。
- 不在第一版实现终端 profile 配置。
- 不在第一版支持远程终端或 SSH 会话。

## 验收标准

- 左下角终端入口位置和激活态符合截图方向。
- 终端面板与 Git 日志面板同一视觉体系，底部块不是悬浮层。
- 默认 cwd 是当前工作区路径，`pwd` 可验证。
- 至少两个终端 Tab 可同时运行，互不串流。
- 亮色/暗色主题下终端背景、文字、边框与应用一致。
- PTY 支持交互式输入、Ctrl+C、窗口 resize。
- 关闭 Tab 后后端 session 被清理。

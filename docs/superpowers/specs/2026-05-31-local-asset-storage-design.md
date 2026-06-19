---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 本地资产存储设计

日期：2026-05-31

## 背景

Refinex Wiki 当前是 Next.js 16、React 19 与 Tauri v2 的桌面工作区应用。工作区内容以 `.plate.json` 文档保存，工作区私有元数据已经放在 `<workspace>/.refinex/workspace.json`，文档树扫描会跳过 `.refinex`。

当前媒体上传链路来自 Plate/UploadThing 示例：工具栏或拖拽插入媒体文件时，Plate 先插入 `PlaceholderPlugin` 占位节点；上传完成后，前端把占位节点替换为包含 `type`、`url`、`isUpload`、`name` 等字段的媒体节点。Plate 官方媒体文档也建议通过自定义 `useUploadFile` hook 接入自己的上传服务，并在完成后将 placeholder 转成图片、视频、音频或文件节点。

本次目标是设计本地上传与本地资产存储。后续会扩展 OSS 存储和自定义 API 存储，但本次不实现远程存储。

## 已确认决策

- 本地附件必须跟随工作区迁移。
- 本地资源落点为 `<workspace>/.refinex/assets`。
- 编辑删除媒体节点后保存文档时，要自动清理未被引用的本地资源。
- 删除文档或目录时，也要同步清理只被目标文档引用的本地资源。
- 文档里的资源引用格式为 `refinex-asset://<assetId>`。
- 设置入口命名为“存储”。
- 存储配置采用应用全局默认值加工作区覆盖的两层模型；本次设置面板只开放全局默认值。

## 非目标

- 不实现 OSS 存储。
- 不实现自定义 API 存储。
- 不做手动孤儿资源清理入口。
- 不允许用户把本地资源目录配置到工作区外部。
- 不把 `.refinex/assets` 暴露到文档树。

## 目录与数据模型

本地资产目录结构：

```text
<workspace>/.refinex/assets/
  index.json
  files/
    ab/
      ab12cd...ef.png
```

`index.json` 记录资产索引：

```ts
{
  schemaVersion: 1,
  assets: {
    "<assetId>": {
      id: "<assetId>",
      storage: "local",
      relativePath: ".refinex/assets/files/ab/ab12cd...ef.png",
      originalName: "image.png",
      mediaType: "image/png",
      size: 12345,
      createdAt: "2026-05-31T17:30:00Z",
      sha256: "optional-content-hash"
    }
  }
}
```

Plate 文档节点保存稳定的内部引用：

```ts
{
  type: "img" | "video" | "audio" | "file",
  url: "refinex-asset://<assetId>",
  isUpload: true,
  name: "原始文件名",
  children: [{ text: "" }]
}
```

约束：

- `assetId` 由 Rust 端生成，不接受前端传入路径。
- 资产文件必须位于 `<workspace>/.refinex/assets/files` 下。
- 所有读写删除都要对路径做 canonicalize 与 `starts_with` 校验。
- `.refinex` 继续作为工作区私有目录，不参与文档树展示和普通文档操作。

## 上传流程

1. 工具栏、拖拽或粘贴继续调用 `PlaceholderPlugin.insert.media(files)`。
2. `PlaceholderElement` 调用新的 `useUploadFile`。
3. 在 Tauri workspace 模式下，`useUploadFile` 调用 `upload_workspace_asset(rootPath, filePayload)`。
4. Rust 端校验工作区、文件名、MIME、大小，写入 `.refinex/assets/files/...` 并更新 `index.json`。
5. 前端收到 `{ id, url, name, type, size }`。
6. 现有 placeholder 替换逻辑继续插入媒体节点，`url` 使用 `refinex-asset://<assetId>`。

非 Tauri 或非 workspace 场景保留现有 UploadThing/mock 路径，以免破坏 demo 页面。

## 展示流程

新增资产解析层：

```ts
resolveAssetUrl(rootPath: string, url: string): Promise<string>
```

解析规则：

- `http://`、`https://`、`data:`、`blob:` 等外部或浏览器原生 URL 保持不变。
- `refinex-asset://<assetId>` 调用 `resolve_workspace_asset(rootPath, assetId)`。
- Rust 根据 `index.json` 返回绝对文件路径。
- 前端使用 Tauri `convertFileSrc(absolutePath)` 转成可被 `<img>`、`<video>`、`<audio>` 和 `<a href>` 使用的 URL。

Tauri v2 的 `convertFileSrc` 需要启用 asset protocol，并配置访问 scope。本期采用静态窄范围 `$HOME/**/.refinex/assets/files/**/*`，只允许 WebView 加载用户主目录下工作区的本地资产文件，不开放整个 `$HOME` 或任意磁盘路径。若后续需要支持主目录外工作区，再评估动态 scope 或 Rust 受控读取 + Blob URL fallback。

## 保存与删除同步

保存文档时：

1. Rust 读取磁盘上的旧 envelope。
2. Rust 从旧内容和新内容中提取 `refinex-asset://<assetId>` 集合。
3. 找出旧内容中存在、新内容中不存在的候选 assetId。
4. 保存新 envelope。
5. 对候选 assetId 执行 `cleanup_unreferenced_assets(rootPath, candidateIds)`。
6. 清理时扫描工作区所有 `.plate.json`，确认没有其他文档仍引用该 assetId 后，删除文件并更新 `index.json`。

删除文档或目录时：

1. Rust 在删除前收集目标文档或目录内所有 `.plate.json` 的 assetId。
2. 删除文档或目录。
3. 对收集到的 assetId 执行全工作区引用扫描。
4. 只删除无引用资源。

保存内容的优先级高于垃圾清理。清理失败不能阻塞文档保存；应返回 warning 或由前端 toast 提示。

## 设置面板

在 `components/workspace/ai-side-panel.tsx` 的右下角设置菜单中新增 `设置...` 菜单项。点击打开新的 `WorkspaceSettingsDialog`，采用类似 IDEA 的左右布局：

- 标题：`设置`
- 左侧分类：首期只有 `存储`
- 右侧面板：存储配置
- 底部按钮：`取消`、`应用`、`确定`

存储面板首期字段：

- `全局存储方式`：只启用 `本地存储`；`OSS 存储` 和 `自定义 API` 作为禁用预留项。
- `本地资源目录`：只读显示 `<workspace>/.refinex/assets`。
- `引用格式`：只读显示 `refinex-asset://<assetId>`。
- `清理策略`：只读显示“保存和删除时自动清理未引用资源”。

现有主题菜单继续保留，不和设置弹窗耦合。

## 配置持久化

应用全局设置写入 Tauri AppLocalData，例如：

```ts
{
  schemaVersion: 1,
  storage: {
    defaultProvider: "local"
  }
}
```

建议新增 Rust 命令：

- `read_app_settings`
- `save_app_settings`

工作区覆盖字段先进入类型设计，但 UI 本次不开放编辑。后续可在 `<workspace>/.refinex/workspace.json` 中增加 `storageOverride`。

## 安全与边界

- 不信任前端路径、文件名和 MIME。
- 文件名仅作为展示名保存；磁盘路径由 `assetId` 和安全扩展名生成。
- 扩展名来自原始文件名或 MIME 白名单映射，不能包含路径分隔符。
- 上传大小上限应在 Rust 端校验，前端只做体验提示。
- `resolve_workspace_asset` 只能解析 `index.json` 中存在的 assetId。
- 删除资产必须先确认该资产仍位于 `.refinex/assets/files` 下。
- 清理引用扫描只认 `refinex-asset://`，不会删除外链资源。

## 测试计划

Rust 侧：

- 上传图片、视频、音频、PDF 和普通文件后生成索引与物理文件。
- 拒绝工作区外路径和路径穿越。
- `resolve_workspace_asset` 只能解析索引内资产。
- 保存文档删除媒体节点后，未引用资源被删除。
- 多文档共享同一 assetId 时，删除一个文档不删除共享资源。
- 删除目录时只清理无引用资源。
- `index.json` 损坏时能安全失败或备份重建，不能误删文件。

前端侧：

- Tauri workspace 模式下 `useUploadFile` 调用本地上传。
- 非 Tauri/demo 模式保留现有 UploadThing/mock 流程。
- 图片、视频、音频、文件节点能解析 `refinex-asset://` 并渲染。
- 解析失败时展示可理解的错误状态。
- 设置菜单出现 `设置...`，弹窗默认选中 `存储`。
- `取消` 不保存，`应用` 保存但不关闭，`确定` 保存并关闭。

视觉验证：

- 设置弹窗在桌面宽度下左右布局稳定。
- 窄宽度下文本不溢出按钮、输入框或内容区。
- 存储面板禁用项、只读字段和底部按钮状态清晰。

## 研究依据

- Plate 官方媒体文档：媒体插件组合包含 `ImagePlugin`、`VideoPlugin`、`AudioPlugin`、`FilePlugin`、`PlaceholderPlugin`；自定义上传 hook 在完成后将 placeholder 替换为媒体节点。
- UploadThing 官方文档：Next.js `FileRouter` 通过 `createUploadthing` 定义上传端点，React helper 的 `uploadFiles` 返回包含 `name`、`size`、`key`、`url` 等字段的上传结果。
- Tauri v2 官方 API：`convertFileSrc(filePath)` 可把设备文件路径转为 WebView 可加载 URL，但需要启用 `assetProtocol` 和 scope。
- `reference/plate-main` 源码：`use-upload-file.ts`、`media-placeholder-node.tsx`、`media-toolbar-button.tsx` 与当前仓库上传链路同源，都是 placeholder + UploadThing 完成后替换节点。
- 当前仓库源码：`src-tauri/src/workspace.rs` 已将 `.refinex/workspace.json` 作为工作区私有元数据，并在文档树扫描和节点操作中跳过 `.refinex`。

## 实现顺序建议

1. Rust 资产索引、上传、解析、引用扫描与清理命令。
2. 验证 Tauri asset protocol 动态 scope；若范围过宽则实现 Rust 受控读取 + Blob URL fallback。
3. 前端 workspace API 类型与本地上传 adapter。
4. 媒体节点 URL 解析与渲染接入。
5. 保存和删除流程接入清理。
6. 设置菜单与 `WorkspaceSettingsDialog`。
7. Focused tests 与浏览器视觉验证。

---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 目录文档树拖拽排序设计

## 背景

当前工作区目录树按文件系统创建时间排序，新建文档或目录会追加到同层末尾，但用户无法手动调整顺序，也无法通过拖拽把文档或目录移动到其他目录下。

本次目标是为左侧目录文档树设计专业、稳定、克制的拖拽排序能力，覆盖：

- 文档同层级拖拽排序。
- 文档跨层级拖拽排序。
- 目录拖拽排序，并带着目录下的文档和子目录整体移动。

## 设计结论

采用 `.refinex/workspace.json` 中的 `sortOrder` 存储目录树手动排序信息，不把排序字段写入每个文档 JSON。

原因：

- 排序是同一父级下兄弟节点之间的关系，不是文档内容。
- 目录也需要排序，但目录没有文档 JSON。
- 目录整体移动不应重写子树内所有文档内容。
- 现有工作区设计已经预留 `sortOrder` 给 Notion 式手动排序。

拖拽交互采用“整行可拖 + 三段落点”，不展示六点拖拽句柄：

- 行上半区：插入到目标节点之前。
- 行中间区：仅目录可接收，表示放入该目录。
- 行下半区：插入到目标节点之后。

搜索过滤状态下禁用拖拽排序，避免用户在不完整树上判断错误层级。

## 持久化模型

保留 `schemaVersion: 1`，在现有 `sortOrder` 对象内引入结构化子字段：

```json
{
  "schemaVersion": 1,
  "recentDocumentPath": "docs/guide.plate.json",
  "expandedPaths": ["docs"],
  "sortOrder": {
    "version": 1,
    "nodes": {
      "docs": {
        "parentPath": "",
        "rank": 1024
      },
      "docs/guide.plate.json": {
        "parentPath": "docs",
        "rank": 1024
      },
      "docs/spring": {
        "parentPath": "docs",
        "rank": 2048
      }
    }
  }
}
```

字段说明：

- `sortOrder.version`：排序模型版本，便于后续迁移。
- `sortOrder.nodes`：以工作区相对路径为 key 的排序记录。
- `parentPath`：节点当前父级的工作区相对路径，根层级为空字符串。
- `rank`：节点在父级内的稀疏排序值。

不为每个节点强制写入排序记录。缺失记录的节点仍按当前文件系统排序回退规则展示。用户第一次拖拽某个父级后，后端会为该父级内相关兄弟节点补齐必要排序记录。

## 排序算法

同一父级内使用整数稀疏 rank，初始步长为 `1024`：

- 插入到最后：`previous.rank + 1024`。
- 插入到最前：`next.rank / 2`，如果结果不可用则触发父级局部重排。
- 插入到两个节点之间：`floor((previous.rank + next.rank) / 2)`。
- 如果相邻 rank 间隔小于等于 `1`，只对目标父级的兄弟节点重排为 `1024, 2048, 3072...`。

性能边界：

- 普通拖拽只更新被拖动节点的 `parentPath` 和 `rank`。
- rank 空隙耗尽时，只更新目标父级兄弟节点，不重排全树。
- 目录跨层级移动时，文件系统负责整体移动目录；排序元数据只更新被移动目录的排序记录，以及子树中已存在排序记录的 path key 前缀。

说明：

- `1024` 步长可以减少常规插入时更新兄弟节点的次数。
- 重复在同一个极小区间插入会触发局部重排，这是可接受的最小复杂度方案。
- 暂不引入全局稳定 `nodeId`。它能减少目录移动时的 path key 更新，但需要处理外部文件系统变更后的身份恢复，当前阶段复杂度过高。

## 后端命令

新增一个统一 Tauri 命令：

```rust
move_workspace_node(
    root_path: String,
    node_path: String,
    target_parent_path: String,
    before_path: Option<String>,
    after_path: Option<String>,
) -> Result<WorkspaceSnapshot, String>
```

约束：

- `node_path`、`target_parent_path`、`before_path`、`after_path` 必须在工作区内。
- `target_parent_path` 必须是目录或根层级。
- 目录不能移动到自己或自己的后代目录内。
- 同一目标目录下存在同名文件或目录时失败，不自动重命名。
- `before_path` 和 `after_path` 至多用于表达目标父级内的相邻节点；不能指向目标父级之外的节点。

处理流程：

1. 校验所有路径并解析节点类型。
2. 如果节点有未保存内容，前端在调用前先保存当前文档。
3. 用 `fs::rename` 移动文件或目录。
4. 读取并更新 `.refinex/workspace.json` 的 `sortOrder`。
5. 必要时对目标父级做局部 rank 重排。
6. 返回新的 `WorkspaceSnapshot`，前端用后端结果刷新目录树。

## 前端交互

推荐使用项目已安装的 `react-dnd`：

- 根部使用 `DndProvider` 和 `HTML5Backend`。
- 每个树行使用 `useDrag` 作为拖拽源。
- 每个树行使用 `useDrop` 作为落点。
- 用 `hover` 计算当前鼠标处于上半区、中间区还是下半区。
- 用 `canDrop` 屏蔽非法落点。
- 用 `drop` 触发 `onMoveNode`，最终调用 Tauri 命令。

不引入常驻或 hover 显示的六点拖拽句柄。整行可拖，但以下区域需要避免误触：

- 重命名输入框。
- 操作菜单按钮。
- 右键菜单和下拉菜单。

视觉反馈：

- 拖动源行降低透明度或轻微虚化。
- before/after 落点显示 2px 蓝色细插入线，起点对齐目标行文本区域。
- inside 落点只对目录出现，目标目录行使用浅蓝背景和细描边。
- 非法落点不显示插入线，鼠标样式为不可放置。
- 拖拽到折叠目录中间区域停留约 450ms 后自动展开。
- 拖拽接近树容器顶部或底部时自动滚动。

## 前端数据流

新增类型：

```ts
export type WorkspaceMovePosition = 'before' | 'after' | 'inside';

export interface WorkspaceMoveRequest {
  nodePath: string;
  targetPath: string;
  position: WorkspaceMovePosition;
}
```

组件流向：

1. `DocumentTree` 负责拖拽预览状态和落点判断。
2. `WorkspaceSidebar` 将 `onMoveNode` 传入 `DocumentTree`。
3. `useWorkspace.moveNode` 负责保存当前脏文档、调用 API、更新 snapshot。
4. `workspace-api.moveWorkspaceNode` 调用 Tauri 命令。
5. 后端返回最新 `WorkspaceSnapshot`，前端替换当前树。

## 边界行为

- 拖动文档到目录中间区域：文档成为该目录最后一个子节点。
- 拖动文档到节点上方或下方：文档进入目标节点的父级，并排在目标节点前或后。
- 拖动目录到目录中间区域：目录及其全部子树移动到目标目录最后。
- 拖动目录到节点上方或下方：目录及其全部子树移动到目标节点的父级，并排在目标节点前或后。
- 拖动目录到自己或后代目录：禁止。
- 搜索过滤状态：禁用拖拽排序。
- 当前打开文档被移动：移动成功后重新定位并保持打开。
- 当前打开文档所在目录被移动：移动成功后根据新路径重新定位并保持打开。
- 移动失败：保持原树不变，展示错误提示，并从磁盘刷新树。

## 测试方案

Rust 单元测试：

- 同层文档排序只更新目标父级排序。
- 文档移动到目录内后，文件路径和 snapshot 正确。
- 目录移动到其他目录内后，子文档和子目录仍存在。
- 目录移动到自身或后代目录时失败。
- 同名冲突时失败。
- rank 空隙足够时只更新被拖动节点。
- rank 空隙耗尽时只重排目标父级。
- `sortOrder` 缺失或损坏时回退到创建时间排序。

前端测试：

- `DocumentTree` 在搜索状态下不启用拖拽。
- before/after/inside hover 状态渲染正确。
- 非法目录落点不会调用移动回调。
- drop 后用正确的 `nodePath`、`targetPath`、`position` 调用 `onMoveNode`。
- 当前文档移动后仍保持选中。

人工验证：

- 同层文档排序。
- 文档拖入目录。
- 目录拖入目录并保留子树。
- 折叠目录悬停展开。
- 靠近顶部和底部自动滚动。
- 拖拽失败后树状态恢复。

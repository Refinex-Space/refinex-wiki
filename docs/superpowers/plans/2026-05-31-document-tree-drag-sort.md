---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 目录文档树拖拽排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为左侧目录文档树实现整行拖拽排序、跨层级移动和目录子树整体移动。

**Architecture:** 排序关系存储在 `.refinex/workspace.json` 的 `sortOrder` 中，后端负责路径校验、文件移动和稀疏 rank 更新，前端只负责拖拽落点计算和调用统一移动 API。目录树交互采用项目已安装的 `react-dnd`，不展示六点拖拽句柄。

**Tech Stack:** Rust/Tauri commands, serde_json metadata, React 19, TypeScript, react-dnd, react-dnd-html5-backend, Vitest, Testing Library, Cargo tests.

---

## File Map

- Modify: `src-tauri/src/workspace.rs`
  - Add sort-order structs and helpers.
  - Sort workspace children by manual rank with creation-time fallback.
  - Add `move_workspace_node` Tauri command.
  - Add Rust unit tests for sorting, moving, rebalance, invalid targets, and conflicts.
- Modify: `src-tauri/src/lib.rs`
  - Register `workspace::move_workspace_node`.
- Modify: `components/workspace/workspace-types.ts`
  - Add `WorkspaceMovePosition`, `WorkspaceMoveRequest`, and command result typing.
- Modify: `components/workspace/workspace-api.ts`
  - Add `moveWorkspaceNode`.
  - Extend API wrapper test.
- Modify: `components/workspace/use-workspace.ts`
  - Add `moveNode`.
  - Save dirty current document before moving.
  - Refresh and preserve selected document when paths change.
- Modify: `components/workspace/workspace-sidebar.tsx`
  - Pass `workspace.moveNode` into `DocumentTree`.
- Modify: `components/workspace/document-tree.tsx`
  - Add `DndProvider`, row drag/drop hooks, drop indicators, directory auto-expand, and search-state drag disablement.
- Modify: `components/workspace/__tests__/document-tree.test.tsx`
  - Add drag behavior tests using a test backend-friendly wrapper strategy.
- Modify: `components/workspace/__tests__/workspace-api.test.ts`
  - Assert Tauri payload for `moveWorkspaceNode`.
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`
  - Add one integration-level assertion that `moveNode` is wired from layout/sidebar into the tree if existing mocks make this practical.

---

### Task 1: Backend Sort Order Model

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Write failing Rust tests for manual order and rank rebalance**

Append these tests inside the existing `#[cfg(test)] mod tests` in `src-tauri/src/workspace.rs`:

```rust
#[test]
fn load_snapshot_uses_manual_sort_order_before_creation_time() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    fs::write(
        temp_dir.path().join("A.plate.json"),
        r#"{"schemaVersion":1,"title":"A","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .expect("写入 A 文档失败");
    std::thread::sleep(std::time::Duration::from_millis(20));
    fs::write(
        temp_dir.path().join("B.plate.json"),
        r#"{"schemaVersion":1,"title":"B","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .expect("写入 B 文档失败");
    fs::create_dir_all(temp_dir.path().join(".refinex")).expect("创建元数据目录失败");
    fs::write(
        temp_dir.path().join(".refinex/workspace.json"),
        r#"{
  "schemaVersion": 1,
  "recentDocumentPath": null,
  "expandedPaths": [],
  "sortOrder": {
    "version": 1,
    "nodes": {
      "A.plate.json": { "parentPath": "", "rank": 2048 },
      "B.plate.json": { "parentPath": "", "rank": 1024 }
    }
  }
}"#,
    )
    .expect("写入排序元数据失败");

    let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");
    let paths = snapshot
        .nodes
        .iter()
        .map(|node| node.relative_path.as_str())
        .collect::<Vec<_>>();

    assert_eq!(paths, vec!["B.plate.json", "A.plate.json"]);
}

#[test]
fn sparse_rank_rebalances_only_target_parent_when_gap_is_exhausted() {
    let mut sort_order = WorkspaceSortOrder::default();
    sort_order.nodes.insert(
        "docs/a.plate.json".to_string(),
        WorkspaceSortRecord {
            parent_path: "docs".to_string(),
            rank: 1024,
        },
    );
    sort_order.nodes.insert(
        "docs/b.plate.json".to_string(),
        WorkspaceSortRecord {
            parent_path: "docs".to_string(),
            rank: 1025,
        },
    );
    sort_order.nodes.insert(
        "other/c.plate.json".to_string(),
        WorkspaceSortRecord {
            parent_path: "other".to_string(),
            rank: 1024,
        },
    );

    let rank = assign_rank_with_rebalance(
        &mut sort_order,
        "docs/moved.plate.json",
        "docs",
        Some("docs/a.plate.json"),
        Some("docs/b.plate.json"),
    );

    assert_eq!(rank, 2048);
    assert_eq!(sort_order.nodes["docs/a.plate.json"].rank, 1024);
    assert_eq!(sort_order.nodes["docs/moved.plate.json"].rank, 2048);
    assert_eq!(sort_order.nodes["docs/b.plate.json"].rank, 3072);
    assert_eq!(sort_order.nodes["other/c.plate.json"].rank, 1024);
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd src-tauri && cargo test load_snapshot_uses_manual_sort_order_before_creation_time sparse_rank_rebalances_only_target_parent_when_gap_is_exhausted
```

Expected: FAIL because `WorkspaceSortOrder`, `WorkspaceSortRecord`, and `assign_rank_with_rebalance` do not exist, and snapshot loading still ignores `sortOrder`.

- [ ] **Step 3: Add sort order structs and parsing helpers**

In `src-tauri/src/workspace.rs`, near `WorkspaceMetadata`, add:

```rust
const SORT_ORDER_STEP: i64 = 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSortOrder {
    version: u32,
    nodes: std::collections::BTreeMap<String, WorkspaceSortRecord>,
}

impl Default for WorkspaceSortOrder {
    fn default() -> Self {
        Self {
            version: 1,
            nodes: std::collections::BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSortRecord {
    parent_path: String,
    rank: i64,
}

fn read_sort_order(metadata: &WorkspaceMetadata) -> WorkspaceSortOrder {
    serde_json::from_value(Value::Object(metadata.sort_order.clone())).unwrap_or_default()
}

fn write_sort_order(metadata: &mut WorkspaceMetadata, sort_order: &WorkspaceSortOrder) -> io::Result<()> {
    let value = serde_json::to_value(sort_order)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;

    metadata.sort_order = match value {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };

    Ok(())
}
```

Then change `build_workspace_snapshot` to read metadata and pass sort order into `read_children`:

```rust
fn build_workspace_snapshot(root: &Path) -> std::io::Result<WorkspaceSnapshot> {
    let metadata = ensure_workspace_metadata(root)?;
    let sort_order = read_sort_order(&metadata);
    let root_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Workspace")
        .to_string();

    Ok(WorkspaceSnapshot {
        root_path: root.to_string_lossy().to_string(),
        root_name,
        nodes: read_children(root, root, &sort_order)?,
    })
}
```

- [ ] **Step 4: Update child reading and sorting**

Change `read_children` signature and recursive call:

```rust
fn read_children(
    root: &Path,
    dir: &Path,
    sort_order: &WorkspaceSortOrder,
) -> std::io::Result<Vec<WorkspaceNode>> {
    let mut nodes = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_skip_entry(&file_name) {
            continue;
        }

        let sort_timestamp = read_sort_timestamp(&path)?;

        if path.is_dir() {
            let children = read_children(root, &path, sort_order)?;
            nodes.push((
                build_directory_node(root, &path, file_name, children)?,
                sort_timestamp,
            ));
        } else if is_plate_document_file(&path) {
            nodes.push((build_document_node(root, &path, file_name)?, sort_timestamp));
        }
    }

    let parent_path = to_relative_path(root, dir);
    nodes.sort_by(|(left, left_timestamp), (right, right_timestamp)| {
        compare_workspace_nodes(
            &parent_path,
            left,
            *left_timestamp,
            right,
            *right_timestamp,
            sort_order,
        )
    });

    Ok(nodes.into_iter().map(|(node, _)| node).collect())
}

fn compare_workspace_nodes(
    parent_path: &str,
    left: &WorkspaceNode,
    left_timestamp: u128,
    right: &WorkspaceNode,
    right_timestamp: u128,
    sort_order: &WorkspaceSortOrder,
) -> std::cmp::Ordering {
    let left_rank = sort_order
        .nodes
        .get(&left.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);
    let right_rank = sort_order
        .nodes
        .get(&right.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);

    match (left_rank, right_rank) {
        (Some(left), Some(right)) => left.cmp(&right),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left_timestamp
            .cmp(&right_timestamp)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
    }
}
```

- [ ] **Step 5: Add rank assignment helper**

Add this helper below `compare_workspace_nodes`:

```rust
fn assign_rank_with_rebalance(
    sort_order: &mut WorkspaceSortOrder,
    moved_path: &str,
    parent_path: &str,
    previous_path: Option<&str>,
    next_path: Option<&str>,
) -> i64 {
    let previous_rank = previous_path.and_then(|path| {
        sort_order
            .nodes
            .get(path)
            .filter(|record| record.parent_path == parent_path)
            .map(|record| record.rank)
    });
    let next_rank = next_path.and_then(|path| {
        sort_order
            .nodes
            .get(path)
            .filter(|record| record.parent_path == parent_path)
            .map(|record| record.rank)
    });

    let candidate = match (previous_rank, next_rank) {
        (Some(previous), Some(next)) if next - previous > 1 => Some(previous + ((next - previous) / 2)),
        (Some(previous), None) => Some(previous + SORT_ORDER_STEP),
        (None, Some(next)) if next > 1 => Some(next / 2),
        (None, None) => Some(SORT_ORDER_STEP),
        _ => None,
    };

    if let Some(rank) = candidate {
        sort_order.nodes.insert(
            moved_path.to_string(),
            WorkspaceSortRecord {
                parent_path: parent_path.to_string(),
                rank,
            },
        );
        return rank;
    }

    rebalance_parent_ranks(sort_order, moved_path, parent_path, previous_path, next_path)
}

fn rebalance_parent_ranks(
    sort_order: &mut WorkspaceSortOrder,
    moved_path: &str,
    parent_path: &str,
    previous_path: Option<&str>,
    next_path: Option<&str>,
) -> i64 {
    let mut ordered_paths = sort_order
        .nodes
        .iter()
        .filter(|(path, record)| record.parent_path == parent_path && path.as_str() != moved_path)
        .map(|(path, record)| (path.clone(), record.rank))
        .collect::<Vec<_>>();

    ordered_paths.sort_by(|left, right| left.1.cmp(&right.1).then_with(|| left.0.cmp(&right.0)));

    let insert_index = if let Some(previous_path) = previous_path {
        ordered_paths
            .iter()
            .position(|(path, _)| path == previous_path)
            .map(|index| index + 1)
            .unwrap_or(ordered_paths.len())
    } else if let Some(next_path) = next_path {
        ordered_paths
            .iter()
            .position(|(path, _)| path == next_path)
            .unwrap_or(0)
    } else {
        ordered_paths.len()
    };

    ordered_paths.insert(insert_index, (moved_path.to_string(), 0));

    let mut moved_rank = SORT_ORDER_STEP;
    for (index, (path, _)) in ordered_paths.iter().enumerate() {
        let rank = ((index as i64) + 1) * SORT_ORDER_STEP;
        if path == moved_path {
            moved_rank = rank;
        }
        sort_order.nodes.insert(
            path.clone(),
            WorkspaceSortRecord {
                parent_path: parent_path.to_string(),
                rank,
            },
        );
    }

    moved_rank
}
```

- [ ] **Step 6: Fix all `read_children` call sites**

Update existing calls such as `rename_workspace_node` directory branch:

```rust
let metadata = ensure_workspace_metadata(&root)
    .map_err(|error| format!("初始化工作区失败：{error}"))?;
let sort_order = read_sort_order(&metadata);
build_directory_node(
    &root,
    &target,
    safe_name.clone(),
    read_children(&root, &target, &sort_order).unwrap_or_default(),
)
```

- [ ] **Step 7: Run backend tests**

Run:

```bash
cd src-tauri && cargo test load_snapshot_uses_manual_sort_order_before_creation_time sparse_rank_rebalances_only_target_parent_when_gap_is_exhausted
cd src-tauri && cargo test
cd src-tauri && cargo fmt --check
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat：添加工作区手动排序模型"
```

---

### Task 2: Backend Move Command

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for move behavior**

Append tests inside `src-tauri/src/workspace.rs`:

```rust
#[test]
fn moves_document_into_directory_and_returns_sorted_snapshot() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    fs::create_dir(temp_dir.path().join("docs")).expect("创建目录失败");
    fs::write(
        temp_dir.path().join("guide.plate.json"),
        r#"{"schemaVersion":1,"title":"指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .expect("写入文档失败");

    let snapshot = move_workspace_node(
        temp_dir.path().to_string_lossy().to_string(),
        temp_dir.path().join("guide.plate.json").to_string_lossy().to_string(),
        temp_dir.path().join("docs").to_string_lossy().to_string(),
        None,
        None,
    )
    .expect("移动文档失败");

    assert!(temp_dir.path().join("docs/guide.plate.json").is_file());
    assert!(!temp_dir.path().join("guide.plate.json").exists());
    assert_eq!(
        snapshot.nodes[0].children.as_ref().unwrap()[0].relative_path,
        "docs/guide.plate.json"
    );
}

#[test]
fn moves_directory_with_children_and_rejects_descendant_target() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    fs::create_dir_all(temp_dir.path().join("docs/child")).expect("创建子目录失败");
    fs::create_dir(temp_dir.path().join("target")).expect("创建目标目录失败");
    fs::write(
        temp_dir.path().join("docs/child/a.plate.json"),
        r#"{"schemaVersion":1,"title":"A","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .expect("写入文档失败");

    let error = move_workspace_node(
        temp_dir.path().to_string_lossy().to_string(),
        temp_dir.path().join("docs").to_string_lossy().to_string(),
        temp_dir.path().join("docs/child").to_string_lossy().to_string(),
        None,
        None,
    )
    .expect_err("目录不应移动到自己的后代目录");

    assert_eq!(error, "不能将目录移动到自身或其子目录内");

    move_workspace_node(
        temp_dir.path().to_string_lossy().to_string(),
        temp_dir.path().join("docs").to_string_lossy().to_string(),
        temp_dir.path().join("target").to_string_lossy().to_string(),
        None,
        None,
    )
    .expect("移动目录失败");

    assert!(temp_dir.path().join("target/docs/child/a.plate.json").is_file());
}

#[test]
fn rejects_move_when_target_name_exists() {
    let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
    fs::create_dir(temp_dir.path().join("target")).expect("创建目标目录失败");
    fs::write(
        temp_dir.path().join("guide.plate.json"),
        r#"{"schemaVersion":1,"title":"指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .expect("写入文档失败");
    fs::write(
        temp_dir.path().join("target/guide.plate.json"),
        r#"{"schemaVersion":1,"title":"已有","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
    )
    .expect("写入已有文档失败");

    let error = move_workspace_node(
        temp_dir.path().to_string_lossy().to_string(),
        temp_dir.path().join("guide.plate.json").to_string_lossy().to_string(),
        temp_dir.path().join("target").to_string_lossy().to_string(),
        None,
        None,
    )
    .expect_err("同名文件不应被覆盖");

    assert_eq!(error, "目标位置已存在同名节点");
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd src-tauri && cargo test moves_document_into_directory_and_returns_sorted_snapshot moves_directory_with_children_and_rejects_descendant_target rejects_move_when_target_name_exists
```

Expected: FAIL because `move_workspace_node` is not implemented.

- [ ] **Step 3: Add command signature and target helpers**

In `src-tauri/src/workspace.rs`, add public command near other Tauri commands:

```rust
#[tauri::command]
pub fn move_workspace_node(
    root_path: String,
    node_path: String,
    target_parent_path: String,
    before_path: Option<String>,
    after_path: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let root = canonical_workspace_root(&root_path)?;
    let (root, source, kind) = resolve_workspace_node(&root.to_string_lossy(), &node_path)?;
    let target_parent = resolve_target_parent(&root, &target_parent_path)?;

    if kind == WorkspaceNodeKind::Directory && is_same_or_descendant(&source, &target_parent) {
        return Err("不能将目录移动到自身或其子目录内".to_string());
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| "无法读取节点名称".to_string())?
        .to_os_string();
    let destination = target_parent.join(file_name);

    if destination.exists() && destination != source {
        return Err("目标位置已存在同名节点".to_string());
    }

    let before = resolve_optional_sibling(&root, before_path.as_deref())?;
    let after = resolve_optional_sibling(&root, after_path.as_deref())?;
    validate_sibling_parent(&target_parent, before.as_deref())?;
    validate_sibling_parent(&target_parent, after.as_deref())?;

    let old_relative_path = to_relative_path(&root, &source);
    let new_relative_path = to_relative_path(&root, &destination);
    let target_parent_relative_path = to_relative_path(&root, &target_parent);

    fs::rename(&source, &destination).map_err(|error| format!("移动节点失败：{error}"))?;

    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;
    let mut sort_order = read_sort_order(&metadata);
    rewrite_sort_order_path_prefix(&mut sort_order, &old_relative_path, &new_relative_path);
    assign_rank_with_rebalance(
        &mut sort_order,
        &new_relative_path,
        &target_parent_relative_path,
        after.as_ref().map(|path| to_relative_path(&root, path)).as_deref(),
        before.as_ref().map(|path| to_relative_path(&root, path)).as_deref(),
    );
    write_sort_order(&mut metadata, &sort_order)
        .map_err(|error| format!("更新排序元数据失败：{error}"))?;
    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存排序元数据失败：{error}"))?;

    build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
}
```

Add helpers:

```rust
fn resolve_target_parent(root: &Path, target_parent_path: &str) -> Result<PathBuf, String> {
    if target_parent_path.trim().is_empty() {
        return Ok(root.to_path_buf());
    }

    let parent = resolve_existing_path(root, target_parent_path)?;
    if !parent.is_dir() {
        return Err("目标父级不是目录".to_string());
    }

    Ok(parent)
}

fn resolve_optional_sibling(root: &Path, path: Option<&str>) -> Result<Option<PathBuf>, String> {
    path.map(|value| resolve_existing_path(root, value)).transpose()
}

fn resolve_existing_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let candidate = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else {
        root.join(path)
    };
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "目标节点不存在".to_string())?;

    if !canonical.starts_with(root) {
        return Err("路径必须位于工作区内".to_string());
    }

    Ok(canonical)
}

fn validate_sibling_parent(target_parent: &Path, sibling: Option<&Path>) -> Result<(), String> {
    if let Some(sibling) = sibling {
        if sibling.parent() != Some(target_parent) {
            return Err("排序相邻节点必须位于目标父级内".to_string());
        }
    }

    Ok(())
}

fn is_same_or_descendant(source: &Path, target: &Path) -> bool {
    target == source || target.starts_with(source)
}
```

- [ ] **Step 4: Add metadata write and path-prefix rewrite helpers**

Add:

```rust
fn write_workspace_metadata(root: &Path, metadata: &WorkspaceMetadata) -> io::Result<()> {
    let metadata_path = root.join(".refinex/workspace.json");
    write_json_pretty(&metadata_path, metadata)
}

fn rewrite_sort_order_path_prefix(
    sort_order: &mut WorkspaceSortOrder,
    old_prefix: &str,
    new_prefix: &str,
) {
    let affected = sort_order
        .nodes
        .iter()
        .filter_map(|(path, record)| {
            if path == old_prefix || path.starts_with(&format!("{old_prefix}/")) {
                Some((path.clone(), record.clone()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    for (path, _) in &affected {
        sort_order.nodes.remove(path);
    }

    for (path, mut record) in affected {
        let suffix = path.strip_prefix(old_prefix).unwrap_or("");
        let next_path = format!("{new_prefix}{suffix}");
        if record.parent_path == parent_relative_path(old_prefix) {
            record.parent_path = parent_relative_path(new_prefix);
        } else if record.parent_path == old_prefix || record.parent_path.starts_with(&format!("{old_prefix}/")) {
            let parent_suffix = record.parent_path.strip_prefix(old_prefix).unwrap_or("");
            record.parent_path = format!("{new_prefix}{parent_suffix}");
        }
        sort_order.nodes.insert(next_path, record);
    }
}

fn parent_relative_path(relative_path: &str) -> String {
    Path::new(relative_path)
        .parent()
        .and_then(|parent| parent.to_str())
        .unwrap_or("")
        .to_string()
}
```

- [ ] **Step 5: Register the command**

In `src-tauri/src/lib.rs`, add this entry to `tauri::generate_handler!`:

```rust
workspace::move_workspace_node,
```

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd src-tauri && cargo test moves_document_into_directory_and_returns_sorted_snapshot moves_directory_with_children_and_rejects_descendant_target rejects_move_when_target_name_exists
cd src-tauri && cargo test
cd src-tauri && cargo fmt --check
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs
git commit -m "feat：实现工作区节点移动命令"
```

---

### Task 3: Frontend API and Workspace State

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/workspace-sidebar.tsx`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Write failing API wrapper test**

In `components/workspace/__tests__/workspace-api.test.ts`, import `moveWorkspaceNode` and add one more mocked result in the command chain:

```ts
import {
  createImportedPlateDocuments,
  createPlateDocument,
  createWorkspaceDirectory,
  createWorkspaceRoot,
  deleteWorkspaceNode,
  ensureWorkspace,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  moveWorkspaceNode,
  readMarkdownSourceFiles,
  readPlateDocument,
  readAppSettings,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  saveAppSettings,
  savePlateDocument,
  uploadWorkspaceAsset,
} from '../workspace-api';
```

Add this mock after the delete mock:

```ts
.mockResolvedValueOnce({
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [],
})
```

Call the API after `deleteWorkspaceNode`:

```ts
await moveWorkspaceNode('/repo', {
  nodePath: '/repo/guide.plate.json',
  targetPath: '/repo/docs',
  position: 'inside',
});
```

Then insert this assertion after the delete assertion and increment following call numbers by one:

```ts
expect(invokeMock).toHaveBeenNthCalledWith(11, 'move_workspace_node', {
  rootPath: '/repo',
  nodePath: '/repo/guide.plate.json',
  targetParentPath: '/repo/docs',
  beforePath: null,
  afterPath: null,
});
```

- [ ] **Step 2: Run API test and verify failure**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because `moveWorkspaceNode` and move types do not exist.

- [ ] **Step 3: Add move types**

In `components/workspace/workspace-types.ts`, add:

```ts
export type WorkspaceMovePosition = 'before' | 'after' | 'inside';

export interface WorkspaceMoveRequest {
  nodePath: string;
  targetPath: string;
  position: WorkspaceMovePosition;
}
```

- [ ] **Step 4: Add API wrapper**

In `components/workspace/workspace-api.ts`, import `WorkspaceMoveRequest` and add:

```ts
export async function moveWorkspaceNode(
  rootPath: string,
  request: WorkspaceMoveRequest,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('move_workspace_node', {
    rootPath,
    nodePath: request.nodePath,
    targetParentPath: request.position === 'inside' ? request.targetPath : getParentPath(request.targetPath),
    beforePath: request.position === 'before' ? request.targetPath : null,
    afterPath: request.position === 'after' ? request.targetPath : null,
  });
}

function getParentPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : '';
}
```

- [ ] **Step 5: Add workspace state handler**

In `components/workspace/use-workspace.ts`, import `moveWorkspaceNode` and `WorkspaceMoveRequest`, then add:

```ts
const moveNode = React.useCallback(
  async (request: WorkspaceMoveRequest) => {
    if (!snapshot) {
      return;
    }

    if (saveState === 'dirty' || saveState === 'saving') {
      await saveCurrentDocumentNow(draftEnvelope);
    }

    const movedSnapshot = await moveWorkspaceNode(snapshot.rootPath, request);
    setSnapshot(movedSnapshot);

    if (!currentDocument) {
      return;
    }

    const movedDocument = findDocumentByPreviousPath(
      movedSnapshot.nodes,
      currentDocument,
      request,
    );

    if (movedDocument) {
      setCurrentDocument(movedDocument);
    } else if (!findNodeByAbsolutePath(movedSnapshot.nodes, currentDocument.absolutePath)) {
      resetDocumentState();
    }
  },
  [
    currentDocument,
    draftEnvelope,
    resetDocumentState,
    saveCurrentDocumentNow,
    saveState,
    snapshot,
  ],
);
```

Add helper functions near the bottom:

```ts
function findNodeByAbsolutePath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.absolutePath === absolutePath) {
      return node;
    }

    const child = node.children
      ? findNodeByAbsolutePath(node.children, absolutePath)
      : null;

    if (child) {
      return child;
    }
  }

  return null;
}

function findDocumentByPreviousPath(
  nodes: WorkspaceNode[],
  currentDocument: WorkspaceNode,
  request: WorkspaceMoveRequest,
) {
  const movedFileName = currentDocument.absolutePath.split('/').pop();

  if (!movedFileName) {
    return null;
  }

  return flattenWorkspaceNodes(nodes).find((node) => {
    return (
      node.kind === 'document' &&
      node.name === currentDocument.name &&
      node.title === currentDocument.title &&
      node.absolutePath.endsWith(`/${movedFileName}`) &&
      (currentDocument.absolutePath === request.nodePath ||
        currentDocument.absolutePath.startsWith(`${request.nodePath}/`))
    );
  }) ?? null;
}

function flattenWorkspaceNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.children ? flattenWorkspaceNodes(node.children) : []),
  ]);
}
```

Return `moveNode` from `useWorkspace`.

- [ ] **Step 6: Wire sidebar**

In `components/workspace/workspace-sidebar.tsx`, pass:

```tsx
onMoveNode={workspace.moveNode}
```

to `DocumentTree`.

- [ ] **Step 7: Run frontend API tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
npx eslint components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/use-workspace.ts components/workspace/workspace-sidebar.tsx components/workspace/__tests__/workspace-api.test.ts
```

Expected: tests and lint pass.

- [ ] **Step 8: Commit**

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/use-workspace.ts components/workspace/workspace-sidebar.tsx components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat：接入目录树移动 API"
```

---

### Task 4: DocumentTree Drag UI

**Files:**
- Modify: `components/workspace/document-tree.tsx`
- Modify: `components/workspace/__tests__/document-tree.test.tsx`

- [ ] **Step 1: Add failing tests for drag disablement and callback shape**

In `components/workspace/__tests__/document-tree.test.tsx`, add:

```tsx
it('disables drag sorting while search results are filtered', () => {
  render(
    <DocumentTree
      currentDocumentPath={null}
      nodes={nodes}
      searchQuery="入门"
      onCreateDirectory={vi.fn()}
      onCreateDocument={vi.fn()}
      onDeleteNode={vi.fn()}
      onImportMarkdown={vi.fn()}
      onMoveNode={vi.fn()}
      onRenameNode={vi.fn()}
      onSelectDocument={vi.fn()}
    />,
  );

  expect(screen.getByTestId('tree-row-guides')).toHaveAttribute('draggable', 'false');
});

it('calls onMoveNode with inside position when a document is dropped onto a directory center', () => {
  const onMoveNode = vi.fn();

  render(
    <DocumentTree
      currentDocumentPath={null}
      nodes={nodes}
      searchQuery=""
      onCreateDirectory={vi.fn()}
      onCreateDocument={vi.fn()}
      onDeleteNode={vi.fn()}
      onImportMarkdown={vi.fn()}
      onMoveNode={onMoveNode}
      onRenameNode={vi.fn()}
      onSelectDocument={vi.fn()}
    />,
  );

  fireEvent.dragStart(screen.getByTestId('tree-row-readme'));
  fireEvent.dragEnter(screen.getByTestId('tree-row-guides'), {
    clientY: 16,
  });
  fireEvent.drop(screen.getByTestId('tree-row-guides'), {
    clientY: 16,
  });

  expect(onMoveNode).toHaveBeenCalledWith({
    nodePath: '/repo/README.plate.json',
    targetPath: '/repo/Guides',
    position: 'inside',
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:run -- components/workspace/__tests__/document-tree.test.tsx
```

Expected: FAIL because `onMoveNode`, drag data attributes, and drag/drop behavior do not exist.

- [ ] **Step 3: Add props and local drag state**

In `components/workspace/document-tree.tsx`, import `DndProvider`, `useDrag`, `useDrop`, `HTML5Backend`, and move types:

```tsx
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type {
  WorkspaceMovePosition,
  WorkspaceMoveRequest,
  WorkspaceNode,
} from './workspace-types';
```

Add props:

```ts
onMoveNode: (request: WorkspaceMoveRequest) => Promise<void> | void;
```

Add constants and state:

```ts
const TREE_NODE_DND_TYPE = 'workspace-tree-node';

interface DraggedTreeNode {
  node: WorkspaceNode;
}

interface DropPreview {
  targetPath: string;
  position: WorkspaceMovePosition;
}
```

In `DocumentTree`, add:

```tsx
const [dropPreview, setDropPreview] = React.useState<DropPreview | null>(null);
const dragDisabled = searchQuery.trim().length > 0;
```

Wrap tree content:

```tsx
return (
  <DndProvider backend={HTML5Backend}>
    <div className="flex min-h-full flex-col py-1">
      {treeContent}
    </div>
    <DeleteNodeDialog ... />
  </DndProvider>
);
```

- [ ] **Step 4: Pass drag props into TreeNode**

Add to `TreeNodeProps`:

```ts
dragDisabled: boolean;
dropPreview: DropPreview | null;
onDropPreviewChange: (preview: DropPreview | null) => void;
onMoveNode: (request: WorkspaceMoveRequest) => Promise<void> | void;
```

Pass the props at every `TreeNode` call.

- [ ] **Step 5: Implement row drag/drop hooks**

Inside `TreeNode`, before `return`, add:

```tsx
const rowRef = React.useRef<HTMLDivElement>(null);
const [{ isDragging }, drag] = useDrag(
  () => ({
    type: TREE_NODE_DND_TYPE,
    item: { node } satisfies DraggedTreeNode,
    canDrag: () => !dragDisabled && !isEditing,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }),
  [dragDisabled, isEditing, node],
);
const [, drop] = useDrop(
  () => ({
    accept: TREE_NODE_DND_TYPE,
    canDrop: (item: DraggedTreeNode) => canDropOnNode(item.node, node),
    hover: (item: DraggedTreeNode, monitor) => {
      if (!rowRef.current || !monitor.isOver({ shallow: true })) {
        return;
      }

      const position = getDropPosition(rowRef.current, monitor.getClientOffset()?.y, node);
      if (!position || !canDropOnNode(item.node, node, position)) {
        onDropPreviewChange(null);
        return;
      }

      onDropPreviewChange({ targetPath: node.absolutePath, position });
    },
    drop: (item: DraggedTreeNode, monitor) => {
      if (!rowRef.current || !monitor.isOver({ shallow: true })) {
        return;
      }

      const position = getDropPosition(rowRef.current, monitor.getClientOffset()?.y, node);
      if (!position || !canDropOnNode(item.node, node, position)) {
        return;
      }

      onDropPreviewChange(null);
      void onMoveNode({
        nodePath: item.node.absolutePath,
        targetPath: node.absolutePath,
        position,
      });
    },
  }),
  [node, onDropPreviewChange, onMoveNode],
);

drag(drop(rowRef));
```

Attach `rowRef` and `data-testid` to the row:

```tsx
<div
  ref={rowRef}
  className={cn(
    'group/tree-row relative flex h-8 w-full items-center rounded-lg text-sm transition-colors hover:bg-muted',
    isCurrent && 'bg-accent',
    isDragging && 'opacity-45',
    dropPreview?.targetPath === node.absolutePath &&
      dropPreview.position === 'inside' &&
      'bg-[#eef4ff] outline outline-1 outline-[#3574f0]/25',
  )}
  data-testid={`tree-row-${node.id}`}
  draggable={!dragDisabled && !isEditing}
>
```

- [ ] **Step 6: Add drop indicator helpers**

Add helpers near the bottom of `document-tree.tsx`:

```tsx
function getDropPosition(
  row: HTMLElement,
  clientY: number | undefined,
  target: WorkspaceNode,
): WorkspaceMovePosition | null {
  if (clientY === undefined) {
    return null;
  }

  const rect = row.getBoundingClientRect();
  const offset = clientY - rect.top;
  const topZone = rect.height * 0.28;
  const bottomZone = rect.height * 0.72;

  if (offset <= topZone) {
    return 'before';
  }

  if (offset >= bottomZone) {
    return 'after';
  }

  return target.kind === 'directory' ? 'inside' : null;
}

function canDropOnNode(
  dragged: WorkspaceNode,
  target: WorkspaceNode,
  position?: WorkspaceMovePosition,
) {
  if (dragged.absolutePath === target.absolutePath) {
    return false;
  }

  if (
    dragged.kind === 'directory' &&
    target.absolutePath.startsWith(`${dragged.absolutePath}/`)
  ) {
    return false;
  }

  if (position === 'inside' && target.kind !== 'directory') {
    return false;
  }

  return true;
}
```

Render before/after indicators inside the row:

```tsx
{dropPreview?.targetPath === node.absolutePath &&
dropPreview.position !== 'inside' ? (
  <span
    aria-hidden="true"
    className={cn(
      'pointer-events-none absolute left-8 right-2 h-0.5 rounded-full bg-[#3574f0]',
      dropPreview.position === 'before' ? 'top-0' : 'bottom-0',
    )}
  />
) : null}
```

- [ ] **Step 7: Add auto-expand on inside hover**

Inside `TreeNode`, add:

```tsx
React.useEffect(() => {
  if (
    !isDirectory ||
    isExpanded ||
    dropPreview?.targetPath !== node.absolutePath ||
    dropPreview.position !== 'inside'
  ) {
    return;
  }

  const timer = window.setTimeout(() => {
    onExpandedChange((previous) => {
      const next = new Set(previous);
      next.add(node.id);
      return next;
    });
  }, 450);

  return () => window.clearTimeout(timer);
}, [
  dropPreview,
  isDirectory,
  isExpanded,
  node.absolutePath,
  node.id,
  onExpandedChange,
]);
```

- [ ] **Step 8: Run document tree tests and lint**

Run:

```bash
npm run test:run -- components/workspace/__tests__/document-tree.test.tsx
npx eslint components/workspace/document-tree.tsx components/workspace/__tests__/document-tree.test.tsx
```

Expected: tests and lint pass.

- [ ] **Step 9: Commit**

```bash
git add components/workspace/document-tree.tsx components/workspace/__tests__/document-tree.test.tsx
git commit -m "feat：实现目录树拖拽交互"
```

---

### Task 5: Integration Verification and Polish

**Files:**
- Modify as needed only if verification finds issues:
  - `components/workspace/document-tree.tsx`
  - `components/workspace/use-workspace.ts`
  - `src-tauri/src/workspace.rs`

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run test:run
npm run lint
cd src-tauri && cargo test
cd src-tauri && cargo fmt --check
```

Expected:

- Vitest passes.
- ESLint passes.
- Cargo tests pass.
- Cargo formatting passes.

- [ ] **Step 2: Build desktop web bundle**

Run:

```bash
npm run build:desktop:web
```

Expected: static desktop web build succeeds.

- [ ] **Step 3: Manual Tauri verification**

Run:

```bash
npm run desktop:dev
```

Verify these flows in the running app:

- Drag a document above another document in the same parent.
- Drag a document below another document in the same parent.
- Drag a document into a directory.
- Drag a directory above or below another node.
- Drag a directory into another directory and confirm all descendants remain visible.
- Try dragging a directory into its own child and confirm no drop indicator appears.
- Search for a document and confirm rows are not draggable.
- Drag near the tree panel top and bottom and confirm the panel scrolls.
- Confirm no six-dot drag handle is visible.

- [ ] **Step 4: Fix verification issues with targeted tests**

For each issue found, add or adjust the smallest focused test first, then fix the implementation. Use these commands after each fix:

```bash
npm run test:run -- components/workspace/__tests__/document-tree.test.tsx
cd src-tauri && cargo test
```

Expected: the focused failing test passes before moving on.

- [ ] **Step 5: Final commit**

```bash
git status --short
git add components/workspace src-tauri/src docs/superpowers/plans/2026-05-31-document-tree-drag-sort.md
git commit -m "feat：完善目录树拖拽排序"
```

Only create this final commit if Task 5 changed files after the Task 1-4 commits. If there are no changes, skip this commit and keep the existing task commits.

---

## Self-Review

- Spec coverage:
  - `workspace.json` sort storage is covered by Task 1.
  - 1024 sparse rank and parent-local rebalance are covered by Task 1 tests and helpers.
  - Document same-level sorting is covered by Task 2 command and Task 4 row drop positions.
  - Document cross-level sorting is covered by Task 2 and Task 4 inside drop.
  - Directory subtree movement is covered by Task 2.
  - No six-dot handle is covered by Task 4 UI design and Task 5 manual verification.
  - Search-mode drag disablement is covered by Task 4.
- Placeholder scan:
  - No placeholder implementation steps remain.
- Type consistency:
  - `WorkspaceMovePosition`, `WorkspaceMoveRequest`, `moveWorkspaceNode`, and `moveNode` names are consistent across tasks.

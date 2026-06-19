---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Native Plate Workspace Design

## Context

The previous Markdown document edit/save design made `.md` and `.mdx` files the primary editable document format. That path requires Markdown deserialization on open and Markdown serialization on save. It also risks losing information for Plate-specific nodes such as comments, suggestions, embeds, columns, dates, math, and future AI metadata.

Plate's documented editor model is a structured `Value` node array. The `@platejs/markdown` package is a conversion layer between Markdown strings and Plate content structure. In the local Plate source, `MarkdownPlugin` exposes `deserialize`, `serialize`, and paste parser behavior. It is useful for import, export, and paste handling, but it should not be the primary persistence model for a rich desktop editor that aims to open documents instantly.

This spec supersedes:

- `docs/superpowers/specs/2026-05-30-markdown-document-edit-save-design.md`
- `docs/superpowers/plans/2026-05-30-markdown-document-edit-save.md`

The implementation should first revert the Markdown-primary feature commits while preserving the Tauri initialization, workspace UI, workspace switcher, and Islands layout work.

## Decision

Refinex Wiki will use a native Plate workspace model.

- Editable documents are `*.plate.json`.
- Markdown files are not displayed in the workspace tree.
- Markdown files are supported only as import sources.
- Workspaces map to real filesystem directories.
- Workspace behavior metadata lives in `.refinex/workspace.json`.
- Document content is stored as Plate native `Value`, wrapped in a small product envelope.

This keeps the editing hot path native:

```text
open document -> read JSON envelope -> use Plate Value -> edit -> save JSON envelope
```

No Markdown conversion should run during normal open or save.

## Workspace Model

A workspace is a real directory chosen by the user.

Visible workspace tree nodes:

- Real folders.
- `*.plate.json` documents.

Ignored entries:

- `.refinex/`
- `.git/`
- `node_modules/`
- `target/`
- `dist/`
- `build/`
- `.md`
- `.mdx`
- Plain `.json`
- Any other unsupported file type.

The filesystem remains transparent. Users can back up, sync, or Git-manage the workspace. Refinex Wiki adds only a hidden metadata folder for UI and workspace behavior.

## Workspace Metadata

Each workspace has:

```text
.refinex/workspace.json
```

Initial schema:

```json
{
  "schemaVersion": 1,
  "recentDocumentPath": "docs/guide.plate.json",
  "expandedPaths": ["docs", "docs/spring"],
  "sortOrder": {}
}
```

Field meaning:

- `schemaVersion`: workspace metadata schema version.
- `recentDocumentPath`: relative path to the last opened native document.
- `expandedPaths`: relative folder paths expanded in the sidebar.
- `sortOrder`: reserved for Notion-like manual ordering.

The metadata file stores workspace UI and behavior state only. It must not store document body content.

If `.refinex/workspace.json` is missing, create it. If it is corrupt, back it up as `workspace.corrupt.<timestamp>.json` and rebuild default metadata.

## Document Format

Native documents use the `.plate.json` extension.

Example:

```json
{
  "schemaVersion": 1,
  "title": "文档标题",
  "createdAt": "2026-05-30T13:00:00.000Z",
  "updatedAt": "2026-05-30T13:00:00.000Z",
  "content": [
    {
      "type": "p",
      "children": [{ "text": "" }]
    }
  ]
}
```

Field meaning:

- `schemaVersion`: document schema version.
- `title`: display title in the sidebar and window title.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.
- `content`: Plate native `Value`.

The sidebar displays `title`, not the filename. The filename is a stable storage identity. Renaming the title should not require renaming the file in the first phase.

Default empty document content:

```json
[
  {
    "type": "p",
    "children": [{ "text": "" }]
  }
]
```

## User Workflows

### Open Workspace

1. User selects a directory.
2. Tauri validates that the path is a directory.
3. Refinex Wiki ensures `.refinex/workspace.json` exists.
4. Tauri scans only visible workspace tree nodes.
5. Frontend renders folders and `*.plate.json` documents.
6. If `recentDocumentPath` exists and is valid, the app may reopen that document.

### Open Native Document

1. User clicks a `*.plate.json` document.
2. Tauri validates the document is inside the workspace.
3. Tauri reads and validates the envelope.
4. Frontend passes `envelope.content` directly to `PlateEditor`.
5. `PlateEditor` initializes with the native Plate `Value`.

No Markdown conversion is allowed in this path.

### Save Native Document

1. `PlateEditor` emits Plate `Value` changes.
2. `useWorkspace` updates the current envelope:
   - `content = value`
   - `updatedAt = now`
3. Debounced save writes the envelope back to the same `*.plate.json`.
4. `Cmd/Ctrl + S` saves immediately.
5. Switching documents saves dirty content first.

No Markdown serialization is allowed in this path.

### Create Document

1. User chooses "新建文档" in the current folder.
2. Tauri creates a unique `*.plate.json` filename.
3. The envelope uses title `未命名文档` or a user-provided title.
4. The tree refreshes and the new document opens.

Filename conflicts use suffixes:

```text
未命名文档.plate.json
未命名文档-1.plate.json
未命名文档-2.plate.json
```

### Create Folder

1. User chooses "新建目录" in the current folder.
2. Tauri creates a real folder.
3. The tree refreshes and the folder can contain native documents.

### Import Markdown

Markdown import is a conversion workflow, not an editing mode.

1. User triggers "导入 Markdown" from a target folder.
2. User selects one or more `.md` or `.mdx` files.
3. Tauri reads each selected source file as text.
4. Frontend converts each Markdown string to Plate `Value` using `MarkdownPlugin`.
5. Frontend builds native document envelopes.
6. Tauri writes one `*.plate.json` document per envelope into the target folder.
7. Source `.md/.mdx` files are not moved, deleted, or copied.
8. The tree refreshes.
9. The first successfully imported document may open automatically.

Naming rules:

- Output filename uses the source Markdown filename stem.
- Conflicts append `-1`, `-2`, and so on.
- Document `title` uses the first Markdown H1.
- If no H1 exists, `title` uses the source filename stem.

Example:

```text
Spring AI.md -> Spring AI.plate.json
Spring AI.md -> Spring AI-1.plate.json
```

## Components

### Tauri Workspace Commands

Expected commands:

- `ensure_workspace(root_path)`
- `load_workspace_tree(root_path)`
- `read_plate_document(root_path, document_path)`
- `save_plate_document(root_path, document_path, envelope)`
- `create_plate_document(root_path, parent_path, title)`
- `create_workspace_directory(root_path, parent_path, name)`
- `read_markdown_source_files(source_paths[])`
- `create_imported_plate_documents(root_path, target_dir, documents[])`

Rust remains the authority for filesystem access and path safety. Every command must canonicalize paths and reject access outside the workspace.

Markdown import is the only exception where read access may target files outside the workspace, because the user explicitly chooses source files through the file picker. This exception is read-only. All generated `*.plate.json` writes must still be inside the workspace target directory.

### Frontend API Layer

The frontend API layer wraps Tauri commands with typed functions:

- `ensureWorkspace`
- `loadWorkspaceTree`
- `readPlateDocument`
- `savePlateDocument`
- `createPlateDocument`
- `createWorkspaceDirectory`
- `readMarkdownSourceFiles`
- `createImportedPlateDocuments`

Previous Markdown-primary wrappers (`readDocument`, `saveDocument`) should be removed or replaced. The names should make the native Plate format explicit.

### Workspace State Layer

`useWorkspace` owns orchestration:

- current workspace snapshot
- workspace metadata
- current document node
- current document envelope
- load state
- save state
- dirty tracking
- debounced save
- save-before-switch
- create document/folder
- Markdown import orchestration

It should not store Markdown source text as document state.

Markdown import orchestration is:

```text
select source files
-> readMarkdownSourceFiles
-> MarkdownPlugin.deserialize in the frontend
-> build Plate document envelopes
-> createImportedPlateDocuments
-> refresh tree
```

### Plate Editor

Workspace mode props:

```ts
interface PlateEditorProps {
  documentKey?: string;
  value?: Value;
  onValueChange?: (value: Value) => void;
  onSaveRequested?: () => void;
  variant?: 'demo' | 'workspace';
}
```

Workspace mode initializes directly from `value`.

`MarkdownPlugin` can remain in `EditorKit` for paste/import/export affordances, but `PlateEditor` should not deserialize Markdown during normal document open and should not serialize Markdown during normal save.

## Error Handling

Workspace errors:

- Missing workspace metadata: create default metadata.
- Corrupt workspace metadata: back up and rebuild.
- Workspace path missing: show recoverable open-workspace error.
- Workspace path is not a directory: show recoverable open-workspace error.

Document errors:

- Invalid JSON: show "文档格式损坏".
- Unsupported `schemaVersion`: show "文档版本不兼容".
- Missing or invalid `content`: show "文档内容格式无效".
- Save failure: keep editor content and dirty state, show save error.
- Path outside workspace: reject in Rust.

Import errors:

- If one Markdown file fails, continue importing the remaining files.
- Show success and failure counts.
- Preserve source paths and error messages for failed items.
- Never delete or modify source Markdown files.

## Revert Strategy

Before implementation, revert the Markdown-primary commits on `dev`:

- `f2142a6 feat：添加 Markdown 文档读写命令`
- `f767733 feat：添加前端 Markdown 文档读写接口`
- `c5c27a8 feat：加载选中的 Markdown 文档`
- `39ca303 feat：接入 Plate Markdown 文档内容`
- `4cf0a3e feat：支持 Markdown 文档自动保存`
- `ef2018b feat：切换文档前保存未保存内容`

Do not revert:

- Tauri initialization.
- Workspace main layout.
- Workspace switcher/menu.
- Islands-style layout.
- Left/right tool rail UI.

The old Markdown design and plan remain as historical docs, but this spec is the new authority.

## Testing

### Rust Tests

Cover:

- Workspace tree includes folders and `*.plate.json`.
- Workspace tree ignores `.md` and `.mdx`.
- Workspace tree ignores `.refinex`.
- `ensure_workspace` creates `.refinex/workspace.json`.
- Corrupt workspace metadata is backed up and replaced.
- Valid Plate document reads successfully.
- Valid Plate document saves successfully.
- Invalid document envelope is rejected.
- Workspace-outside paths are rejected.
- Markdown source file reads accept only `.md/.mdx`.
- Imported Plate document creation writes only inside the workspace.
- Multi-file imported document creation creates `*.plate.json` files.
- Imported document creation does not modify source Markdown files.

### Frontend Tests

Cover:

- Sidebar displays `title` from envelope.
- Clicking a native document passes `Value` to `PlateEditor`.
- Editing calls `savePlateDocument` with updated envelope content.
- Dirty content saves before switching documents.
- Save failure keeps editor content visible.
- New document creates and opens a native document.
- Markdown import refreshes tree and displays generated native documents.
- `.md/.mdx` source files are not rendered as tree nodes.

### Verification Commands

Run:

```bash
npm run test:run
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests
npx eslint app/page.tsx app/editor/page.tsx components/workspace/**/*.ts components/workspace/**/*.tsx components/editor/plate-editor.tsx vitest.config.ts
npm run build
npm run desktop:build -- --no-bundle
```

## Non-Goals

First phase does not include:

- Direct Markdown editing.
- Showing `.md/.mdx` in the workspace tree.
- Saving or syncing back to Markdown.
- Recursive Markdown folder import.
- Markdown import preview.
- Virtual Notion-style database storage.
- Rename-title-to-filename synchronization.
- Full manual ordering UI.
- Collaboration storage changes.

## Open Product Notes

These are intentionally deferred:

- Whether title edits should optionally rename the underlying file.
- Whether Markdown export should be exposed in the toolbar.
- Whether imported Markdown should preserve original source path metadata.
- Whether future work should store document icons, covers, and manual order in `.refinex/workspace.json`.

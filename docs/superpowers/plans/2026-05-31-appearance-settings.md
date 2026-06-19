---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# 外观设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置面板新增“外观”，支持主题切换和全局页面宽度配置，并让 workspace 编辑器立即响应页面宽度变化。

**Architecture:** 主题继续使用 `next-themes`，设置面板只调用 `setTheme()`。页面宽度写入现有 `AppSettings.appearance.pageWidthMode`，由 `WorkspaceLayout` 读取并传给 `PlateEditor`，最终映射到 `Editor` 的 workspace 宽度 variant。

**Tech Stack:** Next.js 16、React 19、next-themes、Vitest、Testing Library、Tauri 2、Rust Serde。

---

## File Structure

- Modify: `components/workspace/workspace-types.ts`
  - 增加 `PageWidthMode`、`AppearanceSettings`，扩展 `AppSettings`。
- Modify: `src-tauri/src/settings.rs`
  - 增加 `AppearanceSettings`，用 Serde default 兼容旧 `settings.json`，保存时校验 `pageWidthMode`。
- Modify: `components/workspace/workspace-api.ts`
  - 保持现有命令封装，必要时只调整类型导入。
- Modify: `components/workspace/workspace-layout.tsx`
  - 读取全局 app settings，维护 `pageWidthMode` 状态，传给 `PlateEditor` 和设置弹窗回调链路。
- Modify: `components/workspace/ai-side-panel.tsx`
  - 给 `RightToolRail` 增加设置保存回调属性，传入 `WorkspaceSettingsDialog`。
- Modify: `components/workspace/workspace-settings-dialog.tsx`
  - 新增“外观”导航、主题分段控件、页面宽度分段控件、跨分类真实搜索。
- Modify: `components/editor/plate-editor.tsx`
  - 新增 `pageWidthMode` prop，并选择标准或全宽编辑器 variant。
- Modify: `components/ui/editor.tsx`
  - 新增 workspace 专用 75% 正文宽度 variant。
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`
  - 覆盖设置面板外观 UI、搜索、主题切换、页面宽度保存与实时传递。
- Test: `components/workspace/__tests__/workspace-api.test.ts`
  - 更新 `AppSettings` 调用断言。
- Test: `components/editor/__tests__/plate-editor.test.tsx`
  - 覆盖 `pageWidthMode` 到 editor variant 的映射。
- Test: `src-tauri/src/settings.rs`
  - 增加 Serde 兼容和非法宽度值校验单元测试。

---

### Task 1: Extend AppSettings Schema

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `src-tauri/src/settings.rs`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Update TypeScript settings types**

Change `components/workspace/workspace-types.ts`:

```ts
export type PageWidthMode = 'standard' | 'wide';

export interface AppearanceSettings {
  pageWidthMode: PageWidthMode;
}

export interface AppSettings {
  schemaVersion: 1;
  storage: {
    defaultProvider: 'local';
  };
  appearance: AppearanceSettings;
}
```

- [ ] **Step 2: Write Rust settings tests before implementation**

Append these tests to `src-tauri/src/settings.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_legacy_settings_without_appearance() {
        let settings: AppSettings = serde_json::from_str(
            r#"{"schemaVersion":1,"storage":{"defaultProvider":"local"}}"#,
        )
        .expect("legacy settings should deserialize");

        assert_eq!(settings.appearance.page_width_mode, "standard");
    }

    #[test]
    fn rejects_invalid_page_width_mode() {
        let settings = AppSettings {
            schema_version: 1,
            storage: StorageSettings {
                default_provider: "local".to_string(),
            },
            appearance: AppearanceSettings {
                page_width_mode: "compact".to_string(),
            },
        };

        assert_eq!(
            validate_app_settings(&settings),
            Err("页面宽度模式不支持".to_string()),
        );
    }

    #[test]
    fn default_settings_include_standard_page_width() {
        let settings = default_app_settings();

        assert_eq!(settings.appearance.page_width_mode, "standard");
    }
}
```

- [ ] **Step 3: Run Rust tests and verify failure**

Run:

```bash
cd src-tauri && cargo test settings
```

Expected: FAIL because `AppearanceSettings`, `appearance`, and `validate_app_settings` are not defined yet.

- [ ] **Step 4: Implement Rust schema and validation**

Change `src-tauri/src/settings.rs` to add appearance support:

```rust
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub storage: StorageSettings,
    #[serde(default)]
    pub appearance: AppearanceSettings,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub default_provider: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub page_width_mode: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            page_width_mode: "standard".to_string(),
        }
    }
}
```

Update `save_app_settings`:

```rust
pub fn save_app_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    validate_app_settings(&settings)?;

    let path = settings_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建应用设置目录".to_string())?;
    }

    let json =
        serde_json::to_string_pretty(&settings).map_err(|_| "无法序列化应用设置".to_string())?;
    fs::write(&path, format!("{json}\n")).map_err(|_| "无法保存应用设置".to_string())?;

    Ok(settings)
}
```

Add validation:

```rust
fn validate_app_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.schema_version != 1 {
        return Err("应用设置版本不支持".to_string());
    }

    if settings.storage.default_provider != "local" {
        return Err("当前仅支持本地存储".to_string());
    }

    if settings.appearance.page_width_mode != "standard"
        && settings.appearance.page_width_mode != "wide"
    {
        return Err("页面宽度模式不支持".to_string());
    }

    Ok(())
}
```

Update default settings:

```rust
fn default_app_settings() -> AppSettings {
    AppSettings {
        schema_version: 1,
        storage: StorageSettings {
            default_provider: "local".to_string(),
        },
        appearance: AppearanceSettings::default(),
    }
}
```

- [ ] **Step 5: Update TypeScript API test settings payloads**

In `components/workspace/__tests__/workspace-api.test.ts`, update mocked and asserted settings objects:

```ts
{
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
  appearance: { pageWidthMode: 'standard' },
}
```

The `saveAppSettings` call should become:

```ts
await saveAppSettings({
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
  appearance: { pageWidthMode: 'standard' },
});
```

The invocation assertion should become:

```ts
expect(invokeMock).toHaveBeenNthCalledWith(12, 'save_app_settings', {
  settings: {
    schemaVersion: 1,
    storage: { defaultProvider: 'local' },
    appearance: { pageWidthMode: 'standard' },
  },
});
```

- [ ] **Step 6: Run schema tests**

Run:

```bash
cd src-tauri && cargo test settings
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit schema changes**

```bash
git add components/workspace/workspace-types.ts src-tauri/src/settings.rs components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat：扩展外观设置模型"
```

---

### Task 2: Wire Page Width To Workspace Editor

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/ai-side-panel.tsx`
- Modify: `components/editor/plate-editor.tsx`
- Modify: `components/ui/editor.tsx`
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`
- Test: `components/editor/__tests__/plate-editor.test.tsx`

- [ ] **Step 1: Update PlateEditor mock for page width assertions**

In `components/workspace/__tests__/workspace-layout.test.tsx`, update the `PlateEditor` mock:

```tsx
vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    onTocSnapshotChange,
    pageWidthMode,
  }: {
    onTocSnapshotChange?: (snapshot: unknown) => void;
    pageWidthMode?: string;
  }) => (
    <button
      data-page-width-mode={pageWidthMode}
      data-testid="plate-editor"
      type="button"
      onClick={() =>
        onTocSnapshotChange?.({
          activeContentId: 'h2-a',
          items: [
            {
              depth: 1,
              id: 'h2-a',
              originalDepth: 2,
              title: '背景',
              type: 'h2',
            },
          ],
          scrollToHeading: vi.fn(),
        })
      }
    >
      editor
    </button>
  ),
}));
```

- [ ] **Step 2: Add failing workspace layout tests**

Add tests to `components/workspace/__tests__/workspace-layout.test.tsx`:

```tsx
it('passes persisted page width mode to the workspace editor', async () => {
  const user = userEvent.setup();
  readAppSettingsMock.mockResolvedValueOnce({
    schemaVersion: 1,
    storage: { defaultProvider: 'local' },
    appearance: { pageWidthMode: 'wide' },
  });
  readPlateDocumentMock.mockResolvedValueOnce({
    envelope: {
      schemaVersion: 1,
      title: '项目说明',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z',
      content: [{ children: [{ text: '正文' }], type: 'p' }],
    },
    modifiedAt: 1,
    path: '/repo/README.plate.json',
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('项目说明'));

  expect(await screen.findByTestId('plate-editor')).toHaveAttribute(
    'data-page-width-mode',
    'wide',
  );
});

```

- [ ] **Step 3: Run layout tests and verify failure**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because `pageWidthMode` is not read or passed yet.

- [ ] **Step 4: Add editor width types and variants**

In `components/workspace/workspace-types.ts`, use the `PageWidthMode` type from Task 1.

In `components/ui/editor.tsx`, add a workspace-wide variant:

```ts
workspaceWide:
  'size-full px-6 pt-4 pb-72 text-base sm:px-[12.5%]',
```

Keep existing `default` unchanged:

```ts
default:
  'size-full px-16 pt-4 pb-72 text-base sm:px-[max(64px,calc(50%-350px))]',
```

- [ ] **Step 5: Pass page width through PlateEditor**

Update `components/editor/plate-editor.tsx`:

```ts
import type { PageWidthMode } from '@/components/workspace/workspace-types';
```

Extend props:

```ts
interface PlateEditorProps {
  documentKey?: string;
  pageWidthMode?: PageWidthMode;
  value?: Value;
  onSaveRequested?: () => void;
  onTocSnapshotChange?: (snapshot: DocumentTocSnapshot) => void;
  onValueChange?: (value: Value) => void;
  variant?: 'demo' | 'workspace';
  workspaceRootPath?: string | null;
}
```

Set default and editor variant:

```tsx
export function PlateEditor({
  documentKey,
  onSaveRequested,
  onTocSnapshotChange,
  onValueChange,
  pageWidthMode = 'standard',
  value,
  variant = 'demo',
  workspaceRootPath,
}: PlateEditorProps) {
  const isWorkspaceEditor = variant === 'workspace';
  const editorVariant = isWorkspaceEditor
    ? pageWidthMode === 'wide'
      ? 'workspaceWide'
      : 'default'
    : 'demo';
```

Use the computed variant:

```tsx
<Editor
  variant={editorVariant}
  onKeyDown={(event) => {
    if (
      isWorkspaceEditor &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 's'
    ) {
      event.preventDefault();
      onSaveRequested?.();
    }
  }}
/>
```

- [ ] **Step 6: Load settings in WorkspaceLayout and pass to editor**

Update imports in `components/workspace/workspace-layout.tsx`:

```ts
import { readAppSettings, setAppWindowTitle } from './workspace-api';
import type {
  AppSettings,
  DocumentSaveState,
  PageWidthMode,
  WorkspaceSnapshot,
} from './workspace-types';
```

Add default settings near constants:

```ts
const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
  appearance: { pageWidthMode: 'standard' },
};
```

Add state in `WorkspaceLayout`:

```ts
const [pageWidthMode, setPageWidthMode] = React.useState<PageWidthMode>(
  DEFAULT_APP_SETTINGS.appearance.pageWidthMode,
);
```

Add effect:

```ts
React.useEffect(() => {
  let cancelled = false;

  async function loadSettings() {
    if (!isTauriRuntime) {
      setPageWidthMode(DEFAULT_APP_SETTINGS.appearance.pageWidthMode);
      return;
    }

    try {
      const settings = await readAppSettings();

      if (!cancelled) {
        setPageWidthMode(settings.appearance.pageWidthMode);
      }
    } catch {
      if (!cancelled) {
        setPageWidthMode(DEFAULT_APP_SETTINGS.appearance.pageWidthMode);
      }
    }
  }

  void loadSettings();

  return () => {
    cancelled = true;
  };
}, [isTauriRuntime]);
```

Pass to editor:

```tsx
<PlateEditor
  documentKey={`${workspace.documentContent?.path ?? workspace.currentDocument.absolutePath}:${workspace.documentVersion}`}
  pageWidthMode={pageWidthMode}
  value={workspace.draftEnvelope.content}
  variant="workspace"
  workspaceRootPath={workspace.snapshot?.rootPath ?? null}
  onSaveRequested={() => void workspace.saveCurrentDocumentNow()}
  onTocSnapshotChange={handleTocSnapshotChange}
  onValueChange={workspace.updateDocumentValue}
/>
```

Pass callback into right rail:

```tsx
<RightToolRail
  mode={workspace.rightPanelMode}
  workspaceRootPath={workspace.snapshot?.rootPath ?? null}
  onModeChange={workspace.setRightPanelMode}
  onSettingsSaved={(settings) =>
    setPageWidthMode(settings.appearance.pageWidthMode)
  }
/>
```

- [ ] **Step 7: Thread settings save callback through RightToolRail**

Update `components/workspace/ai-side-panel.tsx` imports:

```ts
import type { AppSettings } from './workspace-types';
```

Extend props:

```ts
interface RightToolRailProps {
  mode: RightPanelMode;
  workspaceRootPath: string | null;
  onModeChange: (mode: RightPanelMode) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}
```

Pass to dialog:

```tsx
<WorkspaceSettingsDialog
  open={settingsOpen}
  workspaceRootPath={workspaceRootPath}
  onOpenChange={setSettingsOpen}
  onSettingsSaved={onSettingsSaved}
/>
```

- [ ] **Step 8: Add PlateEditor variant tests**

Add tests to `components/editor/__tests__/plate-editor.test.tsx`:

```tsx
it('uses the default editor width for standard workspace pages', () => {
  render(
    <PlateEditor
      documentKey="/repo/guide.plate.json:1"
      pageWidthMode="standard"
      value={[{ children: [{ text: '正文' }], type: 'p' }]}
      variant="workspace"
    />,
  );

  expect(screen.getByTestId('editor-surface')).toHaveAttribute(
    'data-variant',
    'default',
  );
});

it('uses the wide editor width for wide workspace pages', () => {
  render(
    <PlateEditor
      documentKey="/repo/guide.plate.json:1"
      pageWidthMode="wide"
      value={[{ children: [{ text: '正文' }], type: 'p' }]}
      variant="workspace"
    />,
  );

  expect(screen.getByTestId('editor-surface')).toHaveAttribute(
    'data-variant',
    'workspaceWide',
  );
});
```

- [ ] **Step 9: Run editor and layout tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit page width data flow**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/ai-side-panel.tsx components/editor/plate-editor.tsx components/ui/editor.tsx components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat：接入编辑器页面宽度设置"
```

---

### Task 3: Build Appearance Settings UI And Search

**Files:**
- Modify: `components/workspace/workspace-settings-dialog.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Hoist next-themes mock so theme calls are assertable**

In `components/workspace/__tests__/workspace-layout.test.tsx`, replace the current `next-themes` mock with:

```tsx
const { setThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: setThemeMock,
    theme: 'light',
  }),
}));
```

Add `setThemeMock.mockReset();` inside `beforeEach`.

- [ ] **Step 2: Update default settings in tests**

In `beforeEach`, update app settings mocks:

```ts
readAppSettingsMock.mockResolvedValue({
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
  appearance: { pageWidthMode: 'standard' },
});
saveAppSettingsMock.mockResolvedValue({
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
  appearance: { pageWidthMode: 'standard' },
});
```

Update any remaining `saveAppSettingsMock` assertions to include:

```ts
appearance: { pageWidthMode: 'standard' },
```

- [ ] **Step 3: Add failing settings UI tests**

Add tests to `components/workspace/__tests__/workspace-layout.test.tsx`:

```tsx
it('opens appearance settings from the settings menu by default', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(screen.getByText('设置...'));

  expect(await screen.findByRole('dialog', { name: '设置' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: '跟随系统' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: '亮色' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: '暗色' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: '标准' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: '全宽' })).toBeTruthy();
});

it('filters appearance settings with the settings search input', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(screen.getByText('设置...'));

  const searchInput = await screen.findByRole('searchbox', {
    name: '搜索设置',
  });

  await user.type(searchInput, '主题');

  expect(screen.getByText('主题')).toBeTruthy();
  expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
  expect(screen.queryByText('本地存储配置')).toBeNull();

  await user.clear(searchInput);
  await user.type(searchInput, '全宽');

  expect(screen.getByText('页面宽度')).toBeTruthy();
  expect(screen.getByRole('radio', { name: '全宽' })).toBeTruthy();
});

it('switches app theme from appearance settings', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(screen.getByText('设置...'));
  await user.click(await screen.findByRole('radio', { name: '暗色' }));

  expect(setThemeMock).toHaveBeenCalledWith('dark');
});

it('updates workspace editor page width after settings are applied', async () => {
  const user = userEvent.setup();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  readPlateDocumentMock.mockResolvedValueOnce({
    envelope: {
      schemaVersion: 1,
      title: '项目说明',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z',
      content: [{ children: [{ text: '正文' }], type: 'p' }],
    },
    modifiedAt: 1,
    path: '/repo/README.plate.json',
  });
  saveAppSettingsMock.mockResolvedValueOnce({
    schemaVersion: 1,
    storage: { defaultProvider: 'local' },
    appearance: { pageWidthMode: 'wide' },
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('项目说明'));
  expect(await screen.findByTestId('plate-editor')).toHaveAttribute(
    'data-page-width-mode',
    'standard',
  );

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(screen.getByText('设置...'));
  await user.click(await screen.findByRole('radio', { name: '全宽' }));
  await user.click(screen.getByRole('button', { name: '应用' }));

  expect(await screen.findByTestId('plate-editor')).toHaveAttribute(
    'data-page-width-mode',
    'wide',
  );
});
```

- [ ] **Step 4: Run settings UI tests and verify failure**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because the appearance panel and controls are not implemented.

- [ ] **Step 5: Add settings dialog props, defaults, and section model**

Update `components/workspace/workspace-settings-dialog.tsx` imports:

```ts
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { AppSettings, PageWidthMode } from './workspace-types';
```

Extend props:

```ts
interface WorkspaceSettingsDialogProps {
  open: boolean;
  workspaceRootPath: string | null;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}
```

Update default settings:

```ts
const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
  appearance: {
    pageWidthMode: 'standard',
  },
};
```

Add section types:

```ts
type SettingsSectionId = 'appearance' | 'storage';

const SETTINGS_SECTIONS = [
  {
    id: 'appearance' as const,
    label: '外观',
    terms: ['外观', '主题', '亮色', '暗色', '系统', '页面宽度', '标准', '全宽'],
  },
  {
    id: 'storage' as const,
    label: '存储',
    terms: STORAGE_SEARCH_TERMS,
  },
];
```

- [ ] **Step 6: Add appearance search field definitions**

Add near storage field definitions:

```ts
const APPEARANCE_FIELD_DEFINITIONS = [
  {
    id: 'theme',
    label: '主题',
    terms: ['主题', '亮色', '暗色', '系统', '跟随系统', 'light', 'dark', 'system'],
  },
  {
    id: 'page-width',
    label: '页面宽度',
    terms: ['页面宽度', '文档宽度', '阅读宽度', '标准', '全宽', '75%'],
  },
];
```

- [ ] **Step 7: Add settings section state and visibility**

Inside `WorkspaceSettingsDialog`:

```ts
const { setTheme, theme } = useTheme();
const [activeSectionId, setActiveSectionId] =
  React.useState<SettingsSectionId>('appearance');
```

Compute matches:

```ts
const appearanceSectionMatches = matchesSearchTerms(
  normalizedSearchQuery,
  SETTINGS_SECTIONS.find((section) => section.id === 'appearance')?.terms ?? [],
);
const matchingAppearanceFields = hasSearchQuery
  ? APPEARANCE_FIELD_DEFINITIONS.filter((field) =>
      matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
    )
  : APPEARANCE_FIELD_DEFINITIONS;
const shouldShowAppearanceSection =
  !hasSearchQuery ||
  appearanceSectionMatches ||
  matchingAppearanceFields.length > 0;
const visibleAppearanceFields =
  hasSearchQuery && matchingAppearanceFields.length > 0 && !appearanceSectionMatches
    ? matchingAppearanceFields
    : APPEARANCE_FIELD_DEFINITIONS;
const visibleSections = SETTINGS_SECTIONS.filter((section) =>
  section.id === 'appearance'
    ? shouldShowAppearanceSection
    : shouldShowStorageSection,
);
const activeSection = visibleSections.some(
  (section) => section.id === activeSectionId,
)
  ? activeSectionId
  : visibleSections[0]?.id;
```

Add effect to reset when opening:

```ts
React.useEffect(() => {
  if (open) {
    setActiveSectionId('appearance');
  }
}, [open]);
```

- [ ] **Step 8: Preserve appearance while changing storage**

Update storage select setter:

```ts
setSettings((current) => ({
  ...current,
  schemaVersion: 1,
  storage: { defaultProvider: value as 'local' },
}))
```

- [ ] **Step 9: Save callback after settings apply**

Update `handleApply`:

```ts
if (!isTauriRuntime()) {
  setSaveState('saved');
  onSettingsSaved?.(settings);
  return;
}

try {
  const savedSettings = await saveAppSettings(settings);

  setSettings(savedSettings);
  onSettingsSaved?.(savedSettings);
  setSaveState('saved');
} catch (error) {
  setSaveState('error');
  setErrorMessage(error instanceof Error ? error.message : '无法保存应用设置');
}
```

- [ ] **Step 10: Render navigation buttons for both sections**

Replace the single storage button with:

```tsx
{visibleSections.map((section) => (
  <button
    key={section.id}
    className={cn(
      'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors',
      activeSection === section.id
        ? 'bg-[#3574f0] text-white shadow-sm'
        : 'text-muted-foreground hover:bg-background hover:text-foreground',
    )}
    type="button"
    onClick={() => setActiveSectionId(section.id)}
  >
    {section.id === 'appearance' ? <Palette size={15} /> : <Database size={15} />}
    {section.label}
  </button>
))}
```

- [ ] **Step 11: Render appearance section**

Add this branch before the storage section:

```tsx
{activeSection === 'appearance' ? (
  <>
    <div className="mb-5 max-w-[620px]">
      <h2 className="text-[15px] font-semibold">外观</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        调整应用主题和编辑器页面宽度。
      </p>
    </div>

    <div className="max-w-[620px] space-y-6">
      {visibleAppearanceFields.some((field) => field.id === 'theme') ? (
        <section className="border-b pb-5">
          <h3 className="text-sm font-medium">主题</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            跟随系统会同步当前操作系统外观。
          </p>
          <div className="mt-3 grid w-fit grid-cols-3 rounded-md border bg-muted/30 p-0.5">
            <SegmentedRadioButton
              checked={(theme ?? 'system') === 'system'}
              icon={<Monitor size={14} />}
              label="跟随系统"
              name="settings-theme"
              onClick={() => setTheme('system')}
            />
            <SegmentedRadioButton
              checked={theme === 'light'}
              icon={<Sun size={14} />}
              label="亮色"
              name="settings-theme"
              onClick={() => setTheme('light')}
            />
            <SegmentedRadioButton
              checked={theme === 'dark'}
              icon={<Moon size={14} />}
              label="暗色"
              name="settings-theme"
              onClick={() => setTheme('dark')}
            />
          </div>
        </section>
      ) : null}

      {visibleAppearanceFields.some((field) => field.id === 'page-width') ? (
        <section>
          <h3 className="text-sm font-medium">页面宽度</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            控制文档正文宽度，不改变左右侧栏宽度。
          </p>
          <div className="mt-3 grid w-fit grid-cols-2 rounded-md border bg-muted/30 p-0.5">
            <SegmentedRadioButton
              checked={settings.appearance.pageWidthMode === 'standard'}
              label="标准"
              name="settings-page-width"
              onClick={() => updatePageWidthMode('standard')}
            />
            <SegmentedRadioButton
              checked={settings.appearance.pageWidthMode === 'wide'}
              label="全宽"
              name="settings-page-width"
              onClick={() => updatePageWidthMode('wide')}
            />
          </div>
        </section>
      ) : null}
    </div>
  </>
) : null}
```

Add helper inside component:

```ts
function updatePageWidthMode(pageWidthMode: PageWidthMode) {
  setSettings((current) => ({
    ...current,
    appearance: {
      ...current.appearance,
      pageWidthMode,
    },
  }));
}
```

Add component at bottom:

```tsx
function SegmentedRadioButton({
  checked,
  icon,
  label,
  name,
  onClick,
}: {
  checked: boolean;
  icon?: React.ReactNode;
  label: string;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        'flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-[5px] px-3 text-xs transition-colors',
        checked
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <span className="sr-only">{name}</span>
      {icon}
      {label}
    </button>
  );
}
```

- [ ] **Step 12: Render storage only when active**

Change the existing storage render condition from `shouldShowStorageSection` to:

```tsx
{activeSection === 'storage' ? (
  // existing storage content
) : null}
```

Keep the empty state condition:

```tsx
{!activeSection ? (
  <div className="flex h-full max-w-[620px] flex-col items-center justify-center text-center">
    <Search className="mb-3 text-muted-foreground" size={26} />
    <h2 className="text-sm font-medium">未找到设置</h2>
    <p className="mt-1 text-xs text-muted-foreground">
      没有匹配“{searchQuery}”的设置项。
    </p>
  </div>
) : null}
```

- [ ] **Step 13: Run settings tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 14: Commit settings UI changes**

```bash
git add components/workspace/workspace-settings-dialog.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat：新增外观设置面板"
```

---

### Task 4: Final Verification

**Files:**
- Verify: all files changed in Tasks 1-3.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/workspace-layout.test.tsx components/editor/__tests__/plate-editor.test.tsx
cd src-tauri && cargo test settings
```

Expected: PASS.

- [ ] **Step 2: Run build verification**

Run:

```bash
npm run build:desktop:web
```

Expected: PASS.

- [ ] **Step 3: Run targeted lint**

Run:

```bash
npx eslint components/workspace/workspace-settings-dialog.tsx components/workspace/workspace-layout.tsx components/workspace/ai-side-panel.tsx components/editor/plate-editor.tsx components/ui/editor.tsx components/workspace/__tests__/workspace-layout.test.tsx components/workspace/__tests__/workspace-api.test.ts components/editor/__tests__/plate-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Manual browser verification**

Start or reuse the dev server:

```bash
npm run dev
```

Open the app, then verify:

- Right-bottom settings menu opens the settings dialog.
- “外观” is the default settings section.
- Theme buttons switch light, dark, and system.
- Page width “标准” keeps the current editor width.
- Page width “全宽” expands the editor content to about 75% of the editor area.
- Search for “主题”, “全宽”, and “引用” filters to the correct settings.

- [ ] **Step 5: Commit verification fixes if needed**

If verification requires fixes, stage only the files changed by those fixes. Use this exact command when fixes touch all feature files:

```bash
git add components/workspace/workspace-types.ts src-tauri/src/settings.rs components/workspace/workspace-api.ts components/workspace/workspace-layout.tsx components/workspace/ai-side-panel.tsx components/workspace/workspace-settings-dialog.tsx components/editor/plate-editor.tsx components/ui/editor.tsx components/workspace/__tests__/workspace-layout.test.tsx components/workspace/__tests__/workspace-api.test.ts components/editor/__tests__/plate-editor.test.tsx
git commit -m "fix：完善外观设置验证问题"
```

If no fixes are needed, do not create an empty commit.

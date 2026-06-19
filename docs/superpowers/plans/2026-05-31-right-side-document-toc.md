---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Right Side Document TOC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side document table-of-contents panel that is opened from a new TOC icon below the AI icon, excludes H1 headings, tracks the active heading while the editor scrolls, and scrolls to headings on click.

**Architecture:** Replace the current AI-only right panel state with a `RightPanelMode` model. Keep the visible TOC panel outside the editor layout, but add a hidden Plate-aware bridge inside `<Plate>` to read `@platejs/toc` state and expose a serializable TOC snapshot plus a scroll callback to the workspace shell.

**Tech Stack:** React 19, Next.js 16, TypeScript, Vitest, Testing Library, PlateJS `@platejs/toc`, lucide-react, Tailwind CSS.

---

## File Structure

- Modify `components/workspace/use-workspace.ts`
  - Replace `isAiPanelCollapsed` with `rightPanelMode: 'ai' | 'toc' | null`.
  - Expose `setRightPanelMode`.
- Modify `components/workspace/workspace-layout.tsx`
  - Own the current TOC snapshot state.
  - Pass `onTocSnapshotChange` into `PlateEditor`.
  - Render right panel content and tool rail.
- Replace `components/workspace/ai-side-panel.tsx`
  - Keep the file path for low churn, but change exports to right-panel primitives:
    - `RightPanelMode`
    - `RightToolRail`
    - `RightSidePanel`
    - `AiPanelContent`
- Create `components/workspace/document-toc-panel.tsx`
  - Render the right-side TOC panel from a TOC snapshot.
  - Handle empty document and empty heading states.
- Create `components/editor/document-toc-bridge.tsx`
  - Use Plate TOC hooks inside `<Plate>`.
  - Filter out H1 headings.
  - Normalize visual depth.
  - Expose `scrollToHeading(id)` through a snapshot callback.
- Modify `components/editor/plate-editor.tsx`
  - Add `onTocSnapshotChange`.
  - Render `DocumentTocBridge` only for `variant="workspace"`.
- Add `components/editor/__tests__/document-toc-bridge.test.tsx`
  - Unit-test filtering, depth normalization, active id filtering, and scroll callback.
- Modify `components/editor/__tests__/plate-editor.test.tsx`
  - Verify the bridge is mounted for workspace editor only.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`
  - Verify AI/TOC panel switching and mutual exclusion.
- Add `components/workspace/__tests__/document-toc-panel.test.tsx`
  - Verify empty states, H2+ rendering, active item state, and click behavior.

## Task 1: Right Panel Mode And Rail

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Modify: `components/workspace/ai-side-panel.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Write failing tests for right panel mode switching**

Add these tests to `components/workspace/__tests__/workspace-layout.test.tsx` after the existing AI panel test:

```tsx
it('switches between ai and document toc from the right tool rail', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  expect(screen.getByTestId('right-tool-rail')).toBeTruthy();
  expect(screen.queryByTestId('ai-panel-island')).toBeNull();
  expect(screen.queryByTestId('document-toc-panel')).toBeNull();

  await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

  expect(screen.getByTestId('ai-panel-island')).toBeTruthy();
  expect(screen.queryByTestId('document-toc-panel')).toBeNull();

  await user.click(screen.getByRole('button', { name: '展开目录面板' }));

  expect(screen.queryByTestId('ai-panel-island')).toBeNull();
  expect(screen.getByTestId('document-toc-panel')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: '折叠目录面板' }));

  expect(screen.queryByTestId('ai-panel-island')).toBeNull();
  expect(screen.queryByTestId('document-toc-panel')).toBeNull();
});

it('keeps the active right tool visually highlighted', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '展开目录面板' }));

  expect(screen.getByTestId('toc-panel-icon-button').className).toContain(
    'bg-[#3574f0]',
  );
  expect(screen.getByTestId('ai-panel-icon-button').className).not.toContain(
    'bg-[#3574f0]',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because `展开目录面板`, `document-toc-panel`, and `toc-panel-icon-button` do not exist yet.

- [ ] **Step 3: Replace AI collapsed state with right panel mode**

In `components/workspace/use-workspace.ts`, replace:

```ts
const [isAiPanelCollapsed, setAiPanelCollapsed] = React.useState(true);
```

with:

```ts
const [rightPanelMode, setRightPanelMode] = React.useState<
  'ai' | 'toc' | null
>(null);
```

In the returned object, replace:

```ts
isAiPanelCollapsed,
setAiPanelCollapsed,
```

with:

```ts
rightPanelMode,
setRightPanelMode,
```

- [ ] **Step 4: Replace AI-only side panel with right panel primitives**

Replace the contents of `components/workspace/ai-side-panel.tsx` with:

```tsx
import { Bot, ListTree, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentTocPanel } from './document-toc-panel';
import type { DocumentTocSnapshot } from '../editor/document-toc-bridge';
import type { WorkspaceNode } from './workspace-types';

export type RightPanelMode = 'ai' | 'toc' | null;

interface RightSidePanelProps {
  currentDocument: WorkspaceNode | null;
  mode: RightPanelMode;
  tocSnapshot: DocumentTocSnapshot | null;
}

interface RightToolRailProps {
  mode: RightPanelMode;
  onModeChange: (mode: RightPanelMode) => void;
}

export function RightSidePanel({
  currentDocument,
  mode,
  tocSnapshot,
}: RightSidePanelProps) {
  if (!mode) {
    return null;
  }

  return (
    <aside
      className="flex h-full w-[340px] shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm"
      data-testid={mode === 'ai' ? 'ai-panel-island' : 'document-toc-panel'}
    >
      {mode === 'ai' ? (
        <AiPanelContent currentDocument={currentDocument} />
      ) : (
        <DocumentTocPanel
          currentDocument={currentDocument}
          snapshot={tocSnapshot}
        />
      )}
    </aside>
  );
}

export function RightToolRail({ mode, onModeChange }: RightToolRailProps) {
  const nextMode = (targetMode: Exclude<RightPanelMode, null>) =>
    mode === targetMode ? null : targetMode;

  return (
    <nav
      className="flex h-full w-8 shrink-0 flex-col items-center gap-2 py-1"
      data-testid="right-tool-rail"
    >
      <button
        aria-label={mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
        className={rightToolButtonClassName(mode === 'ai')}
        data-testid="ai-panel-icon-button"
        type="button"
        onClick={() => onModeChange(nextMode('ai'))}
      >
        <span
          aria-hidden="true"
          className="size-[17px] bg-current"
          data-testid="ai-panel-icon"
          style={{
            WebkitMask: "url('/icons/ai-panel.svg') center / contain no-repeat",
            mask: "url('/icons/ai-panel.svg') center / contain no-repeat",
          }}
        />
      </button>

      <button
        aria-label={mode === 'toc' ? '折叠目录面板' : '展开目录面板'}
        className={rightToolButtonClassName(mode === 'toc')}
        data-testid="toc-panel-icon-button"
        type="button"
        onClick={() => onModeChange(nextMode('toc'))}
      >
        <ListTree size={17} />
      </button>
    </nav>
  );
}

function AiPanelContent({ currentDocument }: { currentDocument: WorkspaceNode | null }) {
  return (
    <>
      <header className="flex h-12 items-center border-b px-3">
        <span className="truncate text-sm font-medium">AI 助手</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            {currentDocument?.title || currentDocument?.name || '未选择文档'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI 能力尚未接入。
          </p>
        </div>

        <div className="grid gap-2">
          <Button className="justify-start" type="button" variant="outline">
            <Sparkles size={15} />
            总结此页面
          </Button>
          <Button className="justify-start" type="button" variant="outline">
            <Bot size={15} />
            解释选中内容
          </Button>
          <Button className="justify-start" type="button" variant="outline">
            <ListTree size={15} />
            生成大纲
          </Button>
        </div>

        <textarea
          className="mt-auto min-h-24 resize-none rounded-md border bg-background p-3 text-sm outline-none"
          disabled
          placeholder="使用 AI 处理各种任务..."
        />
      </div>
    </>
  );
}

function rightToolButtonClassName(active: boolean) {
  return cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
    active && 'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
  );
}
```

This references `DocumentTocPanel` and `DocumentTocSnapshot`, which will be created in later tasks. During this task, use a temporary minimal `DocumentTocPanel` file from Step 5 so tests can compile.

- [ ] **Step 5: Add temporary TOC panel and type so Task 1 compiles**

Create `components/editor/document-toc-bridge.tsx`:

```tsx
'use client';

export interface DocumentTocItem {
  depth: number;
  id: string;
  title: string;
  type: string;
}

export interface DocumentTocSnapshot {
  activeContentId: string | null;
  items: DocumentTocItem[];
  scrollToHeading: (id: string) => void;
}
```

Create `components/workspace/document-toc-panel.tsx`:

```tsx
import type { DocumentTocSnapshot } from '@/components/editor/document-toc-bridge';

import type { WorkspaceNode } from './workspace-types';

interface DocumentTocPanelProps {
  currentDocument: WorkspaceNode | null;
  snapshot: DocumentTocSnapshot | null;
}

export function DocumentTocPanel({
  currentDocument,
  snapshot,
}: DocumentTocPanelProps) {
  return (
    <>
      <header className="flex h-12 items-center border-b px-3">
        <span className="truncate text-sm font-medium">目录</span>
      </header>
      <div className="min-h-0 flex-1 p-3 text-sm">
        {!currentDocument ? '未选择文档' : snapshot?.items.length ? '目录加载中' : '暂无可显示目录'}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Wire right panel primitives into WorkspaceLayout**

In `components/workspace/workspace-layout.tsx`, replace:

```ts
import { AiSidePanel } from './ai-side-panel';
```

with:

```ts
import {
  RightSidePanel,
  RightToolRail,
} from './ai-side-panel';
```

Replace the bottom AI render:

```tsx
<AiSidePanel
  currentDocument={workspace.currentDocument}
  isCollapsed={workspace.isAiPanelCollapsed}
  onCollapsedChange={workspace.setAiPanelCollapsed}
/>
```

with:

```tsx
<RightSidePanel
  currentDocument={workspace.currentDocument}
  mode={workspace.rightPanelMode}
  tocSnapshot={null}
/>
<RightToolRail
  mode={workspace.rightPanelMode}
  onModeChange={workspace.setRightPanelMode}
/>
```

- [ ] **Step 7: Run tests to verify Task 1 passes**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add components/workspace/use-workspace.ts components/workspace/ai-side-panel.tsx components/workspace/workspace-layout.tsx components/workspace/document-toc-panel.tsx components/editor/document-toc-bridge.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "实现右侧面板模式切换"
```

## Task 2: Plate TOC Bridge

**Files:**
- Modify: `components/editor/document-toc-bridge.tsx`
- Test: `components/editor/__tests__/document-toc-bridge.test.tsx`

- [ ] **Step 1: Write failing tests for filtering, active id, and scroll**

Create `components/editor/__tests__/document-toc-bridge.test.tsx`:

```tsx
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DocumentTocBridge,
  normalizeDocumentTocItems,
  resolveActiveDocumentTocId,
  type DocumentTocSnapshot,
} from '../document-toc-bridge';

const onContentScrollMock = vi.fn();
let tocStateMock = {
  activeContentId: 'h2-a',
  headingList: [
    { depth: 1, id: 'h1-title', path: [0], title: '文档标题', type: 'h1' },
    { depth: 2, id: 'h2-a', path: [1], title: '背景', type: 'h2' },
    { depth: 3, id: 'h3-a', path: [2], title: '细节', type: 'h3' },
    { depth: 4, id: 'h4-a', path: [3], title: '更深层', type: 'h4' },
  ],
  onContentScroll: onContentScrollMock,
};

vi.mock('@platejs/toc/react', () => ({
  useTocElementState: () => tocStateMock,
}));

describe('document toc bridge', () => {
  beforeEach(() => {
    onContentScrollMock.mockReset();
    tocStateMock = {
      activeContentId: 'h2-a',
      headingList: [
        { depth: 1, id: 'h1-title', path: [0], title: '文档标题', type: 'h1' },
        { depth: 2, id: 'h2-a', path: [1], title: '背景', type: 'h2' },
        { depth: 3, id: 'h3-a', path: [2], title: '细节', type: 'h3' },
        { depth: 4, id: 'h4-a', path: [3], title: '更深层', type: 'h4' },
      ],
      onContentScroll: onContentScrollMock,
    };
  });

  it('filters out h1 and normalizes visual depth from h2', () => {
    expect(normalizeDocumentTocItems(tocStateMock.headingList)).toEqual([
      {
        depth: 1,
        id: 'h2-a',
        originalDepth: 2,
        title: '背景',
        type: 'h2',
      },
      {
        depth: 2,
        id: 'h3-a',
        originalDepth: 3,
        title: '细节',
        type: 'h3',
      },
      {
        depth: 3,
        id: 'h4-a',
        originalDepth: 4,
        title: '更深层',
        type: 'h4',
      },
    ]);
  });

  it('ignores active h1 because it is not visible in the side toc', () => {
    const items = normalizeDocumentTocItems(tocStateMock.headingList);

    expect(resolveActiveDocumentTocId('h1-title', items)).toBeNull();
    expect(resolveActiveDocumentTocId('h2-a', items)).toBe('h2-a');
  });

  it('publishes a toc snapshot and scroll callback from Plate state', async () => {
    const user = userEvent.setup();
    const onSnapshotChange = vi.fn();

    function Harness() {
      const [snapshot, setSnapshot] = React.useState<DocumentTocSnapshot | null>(
        null,
      );

      return (
        <>
          <div id="h2-a">背景</div>
          <DocumentTocBridge
            onSnapshotChange={(nextSnapshot) => {
              setSnapshot(nextSnapshot);
              onSnapshotChange(nextSnapshot);
            }}
          />
          <button
            type="button"
            onClick={() => snapshot?.scrollToHeading('h2-a')}
          >
            scroll
          </button>
        </>
      );
    }

    render(<Harness />);

    expect(onSnapshotChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activeContentId: 'h2-a',
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'h2-a', title: '背景' }),
        ]),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'scroll' }));

    expect(onContentScrollMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'h2-a',
      'smooth',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:run -- components/editor/__tests__/document-toc-bridge.test.tsx
```

Expected: FAIL because the exported bridge, normalizer, and active resolver are not implemented yet.

- [ ] **Step 3: Implement the Plate TOC bridge**

Replace `components/editor/document-toc-bridge.tsx` with:

```tsx
'use client';

import * as React from 'react';

import type { Heading } from '@platejs/toc';
import { useTocElementState } from '@platejs/toc/react';

export interface DocumentTocItem {
  depth: number;
  id: string;
  originalDepth: number;
  title: string;
  type: string;
}

export interface DocumentTocSnapshot {
  activeContentId: string | null;
  items: DocumentTocItem[];
  scrollToHeading: (id: string) => void;
}

interface DocumentTocBridgeProps {
  onSnapshotChange: (snapshot: DocumentTocSnapshot) => void;
}

export function DocumentTocBridge({
  onSnapshotChange,
}: DocumentTocBridgeProps) {
  const state = useTocElementState();
  const items = React.useMemo(
    () => normalizeDocumentTocItems(state.headingList),
    [state.headingList],
  );
  const activeContentId = resolveActiveDocumentTocId(
    state.activeContentId ?? null,
    items,
  );
  const scrollToHeading = React.useCallback(
    (id: string) => {
      const target = document.getElementById(id);

      if (!target) {
        return;
      }

      state.onContentScroll(target, id, 'smooth');
    },
    [state],
  );

  React.useEffect(() => {
    onSnapshotChange({
      activeContentId,
      items,
      scrollToHeading,
    });
  }, [activeContentId, items, onSnapshotChange, scrollToHeading]);

  return null;
}

export function normalizeDocumentTocItems(
  headingList: Heading[],
): DocumentTocItem[] {
  return headingList
    .filter((heading) => heading.type !== 'h1' && heading.title.trim())
    .map((heading) => ({
      depth: Math.min(Math.max(heading.depth - 1, 1), 3),
      id: heading.id,
      originalDepth: heading.depth,
      title: heading.title,
      type: heading.type,
    }));
}

export function resolveActiveDocumentTocId(
  activeContentId: string | null,
  items: DocumentTocItem[],
) {
  if (!activeContentId) {
    return null;
  }

  return items.some((item) => item.id === activeContentId)
    ? activeContentId
    : null;
}
```

- [ ] **Step 4: Run bridge tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/document-toc-bridge.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add components/editor/document-toc-bridge.tsx components/editor/__tests__/document-toc-bridge.test.tsx
git commit -m "实现 Plate 目录状态桥接"
```

## Task 3: Document TOC Panel UI

**Files:**
- Modify: `components/workspace/document-toc-panel.tsx`
- Test: `components/workspace/__tests__/document-toc-panel.test.tsx`

- [ ] **Step 1: Write failing tests for panel rendering and click behavior**

Create `components/workspace/__tests__/document-toc-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentTocPanel } from '../document-toc-panel';
import type { WorkspaceNode } from '../workspace-types';

const currentDocument: WorkspaceNode = {
  absolutePath: '/repo/guide.plate.json',
  id: 'guide',
  kind: 'document',
  name: 'guide.plate.json',
  relativePath: 'guide.plate.json',
  title: '指南',
};

describe('DocumentTocPanel', () => {
  it('shows empty state when no document is selected', () => {
    render(<DocumentTocPanel currentDocument={null} snapshot={null} />);

    expect(screen.getByText('未选择文档')).toBeTruthy();
  });

  it('shows empty state when no h2 plus headings exist', () => {
    render(
      <DocumentTocPanel
        currentDocument={currentDocument}
        snapshot={{
          activeContentId: null,
          items: [],
          scrollToHeading: vi.fn(),
        }}
      />,
    );

    expect(screen.getByText('暂无可显示目录')).toBeTruthy();
  });

  it('renders toc items with active state and normalized indentation', async () => {
    const user = userEvent.setup();
    const scrollToHeading = vi.fn();

    render(
      <DocumentTocPanel
        currentDocument={currentDocument}
        snapshot={{
          activeContentId: 'h3-a',
          items: [
            {
              depth: 1,
              id: 'h2-a',
              originalDepth: 2,
              title: '背景',
              type: 'h2',
            },
            {
              depth: 2,
              id: 'h3-a',
              originalDepth: 3,
              title: '细节',
              type: 'h3',
            },
          ],
          scrollToHeading,
        }}
      />,
    );

    expect(screen.queryByText('文档标题')).toBeNull();
    expect(screen.getByRole('button', { name: '背景' }).className).toContain(
      'pl-3',
    );
    expect(screen.getByRole('button', { name: '细节' }).className).toContain(
      'pl-6',
    );
    expect(
      screen.getByRole('button', { name: '细节' }).getAttribute('aria-current'),
    ).toBe('location');

    await user.click(screen.getByRole('button', { name: '背景' }));

    expect(scrollToHeading).toHaveBeenCalledWith('h2-a');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:run -- components/workspace/__tests__/document-toc-panel.test.tsx
```

Expected: FAIL because the temporary panel does not render actual items.

- [ ] **Step 3: Implement the final TOC panel UI**

Replace `components/workspace/document-toc-panel.tsx` with:

```tsx
import type {
  DocumentTocItem,
  DocumentTocSnapshot,
} from '@/components/editor/document-toc-bridge';
import { cn } from '@/lib/utils';

import type { WorkspaceNode } from './workspace-types';

interface DocumentTocPanelProps {
  currentDocument: WorkspaceNode | null;
  snapshot: DocumentTocSnapshot | null;
}

export function DocumentTocPanel({
  currentDocument,
  snapshot,
}: DocumentTocPanelProps) {
  return (
    <>
      <header className="flex h-12 items-center border-b px-3">
        <span className="truncate text-sm font-medium">目录</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {!currentDocument ? (
          <TocEmptyState title="未选择文档" description="打开文档后显示目录。" />
        ) : !snapshot || snapshot.items.length === 0 ? (
          <TocEmptyState
            title="暂无可显示目录"
            description="目录从二级标题开始显示。"
          />
        ) : (
          <nav aria-label="文档目录" className="grid gap-0.5">
            {snapshot.items.map((item) => (
              <TocItemButton
                key={item.id}
                active={item.id === snapshot.activeContentId}
                item={item}
                onClick={() => snapshot.scrollToHeading(item.id)}
              />
            ))}
          </nav>
        )}
      </div>
    </>
  );
}

function TocItemButton({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: DocumentTocItem;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? 'location' : undefined}
      className={cn(
        'flex h-8 w-full items-center truncate rounded-md pr-2 text-left text-sm transition-colors',
        tocDepthClassName(item.depth),
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      title={item.title}
      type="button"
      onClick={onClick}
    >
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function TocEmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function tocDepthClassName(depth: number) {
  if (depth <= 1) {
    return 'pl-3';
  }

  if (depth === 2) {
    return 'pl-6';
  }

  return 'pl-9';
}
```

- [ ] **Step 4: Run panel tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/document-toc-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add components/workspace/document-toc-panel.tsx components/workspace/__tests__/document-toc-panel.test.tsx
git commit -m "实现右侧文档目录面板"
```

## Task 4: Integrate TOC Bridge With PlateEditor

**Files:**
- Modify: `components/editor/plate-editor.tsx`
- Modify: `components/editor/__tests__/plate-editor.test.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Write failing PlateEditor bridge test**

In `components/editor/__tests__/plate-editor.test.tsx`, add this mock after the existing `settings-dialog` mock:

```tsx
const { documentTocBridgeMock } = vi.hoisted(() => ({
  documentTocBridgeMock: vi.fn(),
}));

vi.mock('@/components/editor/document-toc-bridge', () => ({
  DocumentTocBridge: ({
    onSnapshotChange,
  }: {
    onSnapshotChange: (snapshot: unknown) => void;
  }) => {
    documentTocBridgeMock(onSnapshotChange);

    return <div data-testid="document-toc-bridge" />;
  },
}));
```

In the `beforeEach`, add:

```ts
documentTocBridgeMock.mockClear();
```

Add these tests:

```tsx
it('mounts document toc bridge for workspace editor', () => {
  const onTocSnapshotChange = vi.fn();

  render(
    <PlateEditor
      documentKey="/repo/guide.plate.json:1"
      value={[{ children: [{ text: '标题' }], type: 'h1' }]}
      variant="workspace"
      onTocSnapshotChange={onTocSnapshotChange}
    />,
  );

  expect(screen.getByTestId('document-toc-bridge')).toBeTruthy();
  expect(documentTocBridgeMock).toHaveBeenCalledWith(onTocSnapshotChange);
});

it('does not mount document toc bridge for demo editor', () => {
  render(<PlateEditor variant="demo" />);

  expect(screen.queryByTestId('document-toc-bridge')).toBeNull();
});
```

- [ ] **Step 2: Run PlateEditor tests to verify they fail**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx
```

Expected: FAIL because `PlateEditor` has no `onTocSnapshotChange` prop and does not mount the bridge.

- [ ] **Step 3: Add TOC bridge prop to PlateEditor**

In `components/editor/plate-editor.tsx`, add imports:

```ts
import type { DocumentTocSnapshot } from '@/components/editor/document-toc-bridge';
import { DocumentTocBridge } from '@/components/editor/document-toc-bridge';
```

Extend `PlateEditorProps`:

```ts
onTocSnapshotChange?: (snapshot: DocumentTocSnapshot) => void;
```

Add the prop to the function signature:

```ts
onTocSnapshotChange,
```

Inside `<Plate>`, after `</EditorContainer>` and before `<SettingsDialog />`, add:

```tsx
{variant === 'workspace' && onTocSnapshotChange ? (
  <DocumentTocBridge onSnapshotChange={onTocSnapshotChange} />
) : null}
```

- [ ] **Step 4: Run PlateEditor tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Write failing workspace integration test for TOC snapshot rendering**

Update the `PlateEditor` mock in `components/workspace/__tests__/workspace-layout.test.tsx` from:

```tsx
vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: () => <div data-testid="plate-editor" />,
}));
```

to:

```tsx
vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    onTocSnapshotChange,
  }: {
    onTocSnapshotChange?: (snapshot: unknown) => void;
  }) => (
    <button
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

Add this test to `components/workspace/__tests__/workspace-layout.test.tsx`:

```tsx
it('renders toc snapshot from the active Plate editor in the right toc panel', async () => {
  const user = userEvent.setup();
  readPlateDocumentMock.mockResolvedValueOnce({
    envelope: {
      schemaVersion: 1,
      title: '项目说明',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z',
      content: [{ children: [{ text: '项目说明' }], type: 'h1' }],
    },
    modifiedAt: 1,
    path: '/repo/README.plate.json',
  });
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByText('项目说明'));
  await user.click(await screen.findByTestId('plate-editor'));
  await user.click(screen.getByRole('button', { name: '展开目录面板' }));

  expect(screen.getByRole('button', { name: '背景' })).toBeTruthy();
});
```

- [ ] **Step 6: Run workspace integration test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because `WorkspaceLayout` still passes `tocSnapshot={null}` and does not forward `onTocSnapshotChange`.

- [ ] **Step 7: Wire TOC snapshot through WorkspaceLayout**

In `components/workspace/workspace-layout.tsx`, add:

```ts
import type { DocumentTocSnapshot } from '@/components/editor/document-toc-bridge';
```

Inside `WorkspaceLayout`, after `const workspace = useWorkspace(initialSnapshot);`, add:

```ts
const [tocSnapshot, setTocSnapshot] =
  React.useState<DocumentTocSnapshot | null>(null);
```

Add a reset effect:

```ts
React.useEffect(() => {
  setTocSnapshot(null);
}, [workspace.currentDocument?.absolutePath]);
```

In the `PlateEditor` props, add:

```tsx
onTocSnapshotChange={setTocSnapshot}
```

In `RightSidePanel`, replace:

```tsx
tocSnapshot={null}
```

with:

```tsx
tocSnapshot={tocSnapshot}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add components/editor/plate-editor.tsx components/editor/__tests__/plate-editor.test.tsx components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "接入右侧目录与 Plate 编辑器状态"
```

## Task 5: Final Verification

**Files:**
- No planned code changes.

- [ ] **Step 1: Run all focused tests**

Run:

```bash
npm run test:run -- components/editor/__tests__/document-toc-bridge.test.tsx components/editor/__tests__/plate-editor.test.tsx components/workspace/__tests__/document-toc-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run lint on touched files**

Run:

```bash
npm run lint -- components/editor/document-toc-bridge.tsx components/editor/plate-editor.tsx components/editor/__tests__/document-toc-bridge.test.tsx components/editor/__tests__/plate-editor.test.tsx components/workspace/ai-side-panel.tsx components/workspace/document-toc-panel.tsx components/workspace/workspace-layout.tsx components/workspace/use-workspace.ts components/workspace/__tests__/document-toc-panel.test.tsx components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Manual desktop/browser verification**

Run:

```bash
npm run dev
```

Then verify in the app:

```text
1. Open a workspace document containing h1, h2, h3, and h4 headings.
2. Confirm the right rail shows the AI icon and the TOC icon below it.
3. Click the TOC icon.
4. Confirm the panel title is “目录”.
5. Confirm h1 is not listed.
6. Confirm h2, h3, and h4 are listed with increasing indentation.
7. Scroll the editor and confirm the active TOC item changes.
8. Click a TOC item and confirm the editor scrolls to the matching heading.
9. Click the AI icon and confirm the TOC panel is replaced by the AI panel.
10. Click the active icon again and confirm the right panel collapses.
```

Expected: all checks pass. If the in-app browser cannot open localhost, record the blocker and complete manual verification in the running desktop/browser surface.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git status --short
```

Expected: only the planned files are changed, and `git status --short` is clean after the final commit.

## Self-Review

Spec coverage:

- Right rail AI/TOC mutual exclusion: Task 1.
- TOC icon below AI icon: Task 1.
- Reuse right panel area: Task 1 and Task 4.
- Exclude H1: Task 2 and Task 3.
- Active item follows Plate TOC state: Task 2 and Task 4.
- Click TOC item scrolls to heading: Task 2 and Task 3.
- Preserve inline `toc` block: no task modifies `components/ui/toc-node.tsx` or `components/editor/plugins/toc-kit.tsx`.

Placeholder scan:

- No `TBD`.
- No `TODO`.
- No unspecified "add tests" steps.

Type consistency:

- `DocumentTocSnapshot` is defined in `components/editor/document-toc-bridge.tsx`.
- `RightPanelMode` is defined in `components/workspace/ai-side-panel.tsx`.
- `WorkspaceLayout` owns `tocSnapshot` and passes it to `RightSidePanel`.

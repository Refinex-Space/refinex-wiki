---
owner: refinex
updated: 2026-06-19
status: deprecated
referenced_by: docs/README.md#historical-superpowers-plans
---
# Resizable Workspace Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restrained drag-to-resize behavior for the left document tree panel and the right AI/TOC panel, with min/max limits and persisted widths.

**Architecture:** Keep width ownership in `WorkspaceLayout`, pass explicit pixel widths into `WorkspaceSidebar` and `RightSidePanel`, and isolate pointer/keyboard resize behavior in a focused `WorkspaceResizeHandle` component. Widths are stored in `localStorage`, parsed defensively, and clamped before use.

**Tech Stack:** React 19, Next.js 16, TypeScript, Vitest, Testing Library, Tailwind CSS.

---

## File Structure

- Create `components/workspace/workspace-resize-handle.tsx`
  - Renders an accessible vertical separator.
  - Owns pointer drag lifecycle and keyboard nudging.
  - Calls `onResize(nextWidth)` with already-clamped values.
- Modify `components/workspace/workspace-layout.tsx`
  - Defines width limits and storage keys.
  - Reads persisted widths through a lazy `useState` initializer.
  - Persists valid width changes to `localStorage`.
  - Inserts left and right resize handles only when the corresponding panel is visible.
- Modify `components/workspace/workspace-sidebar.tsx`
  - Accepts `width: number`.
  - Applies inline width style instead of fixed `w-[280px]`.
- Modify `components/workspace/ai-side-panel.tsx`
  - `RightSidePanel` accepts `width: number`.
  - Applies inline width style instead of fixed `w-[340px]`.
- Modify `components/workspace/__tests__/workspace-layout.test.tsx`
  - Adds width default, clamp, persistence, collapse/expand retention, and keyboard tests.

## Task 1: Layout Width State And Persistence Tests

**Files:**
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/workspace-sidebar.tsx`
- Modify: `components/workspace/ai-side-panel.tsx`

- [ ] **Step 1: Write failing tests for default and persisted widths**

In `components/workspace/__tests__/workspace-layout.test.tsx`, update the import:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
```

Add these tests before `keeps the sidebar toggle in the left tool rail`:

```tsx
it('uses default widths for the resizable workspace panels', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  const sidebar = screen.getByTestId('workspace-sidebar');

  expect(sidebar).toHaveStyle({ width: '280px' });

  await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

  expect(screen.getByTestId('ai-panel-island')).toHaveStyle({
    width: '340px',
  });
});

it('loads persisted panel widths and clamps invalid stored values', async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    'refinex-wiki:workspace:left-sidebar-width',
    '999',
  );
  window.localStorage.setItem(
    'refinex-wiki:workspace:right-panel-width',
    '120',
  );

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  expect(screen.getByTestId('workspace-sidebar')).toHaveStyle({
    width: '420px',
  });

  await user.click(screen.getByRole('button', { name: '展开目录面板' }));

  expect(screen.getByTestId('document-toc-panel')).toHaveStyle({
    width: '340px',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because `workspace-sidebar` test id and inline panel widths do not exist yet.

- [ ] **Step 3: Add width constants and persistence helpers**

In `components/workspace/workspace-layout.tsx`, add after the props interface:

```tsx
const LEFT_PANEL_WIDTH = {
  defaultValue: 280,
  max: 420,
  min: 280,
};

const RIGHT_PANEL_WIDTH = {
  defaultValue: 340,
  max: 520,
  min: 340,
};

const WORKSPACE_PANEL_WIDTH_STORAGE_KEYS = {
  left: 'refinex-wiki:workspace:left-sidebar-width',
  right: 'refinex-wiki:workspace:right-panel-width',
};

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredPanelWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const parsed = Number(window.localStorage.getItem(key));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampPanelWidth(parsed, min, max);
}

function writeStoredPanelWidth(key: string, value: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, String(value));
}
```

Inside `WorkspaceLayout`, add state before `tocSnapshotState`:

```tsx
const [leftSidebarWidth, setLeftSidebarWidth] = React.useState(() =>
  readStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.left,
    LEFT_PANEL_WIDTH.defaultValue,
    LEFT_PANEL_WIDTH.min,
    LEFT_PANEL_WIDTH.max,
  ),
);
const [rightPanelWidth, setRightPanelWidth] = React.useState(() =>
  readStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.right,
    RIGHT_PANEL_WIDTH.defaultValue,
    RIGHT_PANEL_WIDTH.min,
    RIGHT_PANEL_WIDTH.max,
  ),
);
```

Add resize callbacks in `WorkspaceLayout`:

```tsx
const handleLeftSidebarResize = React.useCallback((nextWidth: number) => {
  const clampedWidth = clampPanelWidth(
    nextWidth,
    LEFT_PANEL_WIDTH.min,
    LEFT_PANEL_WIDTH.max,
  );

  setLeftSidebarWidth(clampedWidth);
  writeStoredPanelWidth(WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.left, clampedWidth);
}, []);

const handleRightPanelResize = React.useCallback((nextWidth: number) => {
  const clampedWidth = clampPanelWidth(
    nextWidth,
    RIGHT_PANEL_WIDTH.min,
    RIGHT_PANEL_WIDTH.max,
  );

  setRightPanelWidth(clampedWidth);
  writeStoredPanelWidth(WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.right, clampedWidth);
}, []);
```

- [ ] **Step 4: Pass width into existing panels**

In `components/workspace/workspace-layout.tsx`, change:

```tsx
<WorkspaceSidebar workspace={workspace} />
```

to:

```tsx
<WorkspaceSidebar width={leftSidebarWidth} workspace={workspace} />
```

Change the right panel call to include width:

```tsx
<RightSidePanel
  currentDocument={workspace.currentDocument}
  mode={workspace.rightPanelMode}
  tocSnapshot={tocSnapshot}
  width={rightPanelWidth}
/>
```

In `components/workspace/workspace-sidebar.tsx`, change props to:

```tsx
interface WorkspaceSidebarProps {
  width: number;
  workspace: ReturnType<typeof useWorkspace>;
}

export function WorkspaceSidebar({ width, workspace }: WorkspaceSidebarProps) {
```

Change the `aside` to:

```tsx
<aside
  className={cn(
    'flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm transition-[width]',
    workspace.isSidebarCollapsed ? 'hidden' : null,
  )}
  data-testid="workspace-sidebar"
  style={workspace.isSidebarCollapsed ? undefined : { width }}
>
```

In `components/workspace/ai-side-panel.tsx`, change props to:

```tsx
interface RightSidePanelProps {
  currentDocument: WorkspaceNode | null;
  mode: RightPanelMode;
  tocSnapshot: DocumentTocSnapshot | null;
  width: number;
}
```

Change the function signature to include `width`, and the `aside` to:

```tsx
<aside
  className="flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm"
  data-testid={mode === 'ai' ? 'ai-panel-island' : 'document-toc-panel'}
  style={{ width }}
>
```

- [ ] **Step 5: Run tests to verify this task passes**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS for the two new width tests and no regressions in the existing workspace layout tests.

- [ ] **Step 6: Commit task 1**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/workspace-sidebar.tsx components/workspace/ai-side-panel.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat：添加工作区面板宽度状态"
```

## Task 2: Accessible Resize Handle

**Files:**
- Create: `components/workspace/workspace-resize-handle.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Write failing tests for drag and keyboard resizing**

Add these tests before the default width test:

```tsx
it('resizes the left sidebar by dragging within configured bounds', () => {
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  const handle = screen.getByRole('separator', {
    name: '调整左侧目录宽度',
  });

  fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: 520, pointerId: 1 });
  fireEvent.pointerUp(document, { pointerId: 1 });

  expect(screen.getByTestId('workspace-sidebar')).toHaveStyle({
    width: '420px',
  });
  expect(window.localStorage.getItem(
    'refinex-wiki:workspace:left-sidebar-width',
  )).toBe('420');
});

it('resizes the right panel by dragging within configured bounds', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

  const handle = screen.getByRole('separator', {
    name: '调整右侧面板宽度',
  });

  fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: 600, pointerId: 1 });
  fireEvent.pointerUp(document, { pointerId: 1 });

  expect(screen.getByTestId('ai-panel-island')).toHaveStyle({
    width: '520px',
  });
  expect(window.localStorage.getItem(
    'refinex-wiki:workspace:right-panel-width',
  )).toBe('520');
});

it('supports keyboard resizing from the separator handles', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  const handle = screen.getByRole('separator', {
    name: '调整左侧目录宽度',
  });

  handle.focus();
  await user.keyboard('{ArrowRight}{ArrowRight}{Home}{End}');

  expect(screen.getByTestId('workspace-sidebar')).toHaveStyle({
    width: '420px',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because separator handles are not rendered yet.

- [ ] **Step 3: Create `WorkspaceResizeHandle`**

Create `components/workspace/workspace-resize-handle.tsx`:

```tsx
'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface WorkspaceResizeHandleProps {
  'aria-label': string;
  className?: string;
  direction: 'left' | 'right';
  max: number;
  min: number;
  value: number;
  onResize: (width: number) => void;
}

function clampWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function WorkspaceResizeHandle({
  'aria-label': ariaLabel,
  className,
  direction,
  max,
  min,
  value,
  onResize,
}: WorkspaceResizeHandleProps) {
  const dragStateRef = React.useRef<{
    startPointerX: number;
    startWidth: number;
  } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const delta =
        direction === 'left'
          ? event.clientX - dragState.startPointerX
          : dragState.startPointerX - event.clientX;

      onResize(clampWidth(dragState.startWidth + delta, min, max));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [direction, isDragging, max, min, onResize]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStateRef.current = {
      startPointerX: event.clientX,
      startWidth: value,
    };
    setIsDragging(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      onResize(min);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onResize(max);
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();

    const keyboardDelta = event.key === 'ArrowRight' ? 16 : -16;
    const signedDelta = direction === 'left' ? keyboardDelta : -keyboardDelta;

    onResize(clampWidth(value + signedDelta, min, max));
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={cn(
        'group flex h-full w-2.5 shrink-0 cursor-col-resize items-center justify-center outline-none',
        className,
      )}
      role="separator"
      tabIndex={0}
      data-dragging={isDragging ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-12 w-px rounded-full bg-border/0 transition-[background-color,width,opacity] duration-150',
          'group-hover:w-0.5 group-hover:bg-[#3574f0]/60',
          'group-focus-visible:w-0.5 group-focus-visible:bg-[#3574f0]/70',
          isDragging && 'w-0.5 bg-[#3574f0]/80',
        )}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify handle implementation compiles**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: still FAIL because `WorkspaceLayout` has not inserted the handles.

## Task 3: Integrate Resize Handles Into Workspace Layout

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`
- Test: `components/workspace/workspace-resize-handle.tsx`

- [ ] **Step 1: Insert resize handles**

In `components/workspace/workspace-layout.tsx`, add the import:

```tsx
import { WorkspaceResizeHandle } from './workspace-resize-handle';
```

After `<WorkspaceSidebar ... />`, insert:

```tsx
{workspace.isSidebarCollapsed ? null : (
  <WorkspaceResizeHandle
    aria-label="调整左侧目录宽度"
    direction="left"
    max={LEFT_PANEL_WIDTH.max}
    min={LEFT_PANEL_WIDTH.min}
    value={leftSidebarWidth}
    onResize={handleLeftSidebarResize}
  />
)}
```

Before `<RightSidePanel ... />`, insert:

```tsx
{workspace.rightPanelMode ? (
  <WorkspaceResizeHandle
    aria-label="调整右侧面板宽度"
    direction="right"
    max={RIGHT_PANEL_WIDTH.max}
    min={RIGHT_PANEL_WIDTH.min}
    value={rightPanelWidth}
    onResize={handleRightPanelResize}
  />
) : null}
```

- [ ] **Step 2: Add tests for visibility and collapse retention**

Add these tests after the keyboard resize test:

```tsx
it('only shows resize handles when the related panel is visible', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  expect(
    screen.getByRole('separator', { name: '调整左侧目录宽度' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('separator', { name: '调整右侧面板宽度' }),
  ).toBeNull();

  await user.click(screen.getByRole('button', { name: '折叠目录' }));

  expect(
    screen.queryByRole('separator', { name: '调整左侧目录宽度' }),
  ).toBeNull();

  await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

  expect(
    screen.getByRole('separator', { name: '调整右侧面板宽度' }),
  ).toBeTruthy();
});

it('keeps the resized left sidebar width after collapse and expand', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  const handle = screen.getByRole('separator', {
    name: '调整左侧目录宽度',
  });

  fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: 360, pointerId: 1 });
  fireEvent.pointerUp(document, { pointerId: 1 });

  await user.click(screen.getByRole('button', { name: '折叠目录' }));
  await user.click(screen.getByRole('button', { name: '展开目录' }));

  expect(screen.getByTestId('workspace-sidebar')).toHaveStyle({
    width: '360px',
  });
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm run test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no new lint errors.

- [ ] **Step 5: Commit implementation**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/workspace-sidebar.tsx components/workspace/ai-side-panel.tsx components/workspace/workspace-resize-handle.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat：支持工作区侧栏宽度拖拽"
```

## Task 4: Browser Verification

**Files:**
- No source files expected.

- [ ] **Step 1: Start the app if no dev server is available**

Run:

```bash
npm run dev
```

Expected: Next.js dev server prints a local URL, usually `http://localhost:3000` or an alternate port.

- [ ] **Step 2: Verify visual interaction in browser**

Open the app and check:

- Left handle appears only between目录树 and editor when the left panel is visible.
- Right handle appears only when AI or目录 panel is open.
- Hover state is a narrow blue accent line, not a large visible block.
- Dragging left panel clamps between `280px` and `420px`.
- Dragging right panel clamps between `340px` and `520px`.
- Folding and reopening panels preserves width.
- Refreshing preserves width.

- [ ] **Step 3: Check git state**

Run:

```bash
git status --short
```

Expected: clean worktree, except temporary `.superpowers/brainstorm/` files may remain untracked from design exploration and should not be committed.

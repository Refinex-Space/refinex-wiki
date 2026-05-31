import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlateEditor } from '../plate-editor';

const deserializeMock = vi.fn();
const serializeMock = vi.fn();
const getApiMock = vi.fn(() => ({
  markdown: {
    deserialize: deserializeMock,
    serialize: serializeMock,
  },
}));
const usePlateEditorMock = vi.fn();
const { documentTocBridgeMock } = vi.hoisted(() => ({
  documentTocBridgeMock: vi.fn(),
}));

vi.mock('platejs', () => ({
  normalizeStaticValue: vi.fn((value) => value),
}));

vi.mock('platejs/react', () => ({
  Plate: ({
    children,
    onChange,
  }: {
    children: React.ReactNode;
    onChange?: (event: { value: unknown[] }) => void;
  }) => (
    <button
      data-testid="plate-root"
      type="button"
      onClick={() => onChange?.({ value: [{ children: [{ text: '编辑后' }] }] })}
    >
      {children}
    </button>
  ),
  usePlateEditor: (
    options: {
      value?: unknown[] | ((editor: unknown) => unknown[]);
    },
    deps?: React.DependencyList,
  ) => {
    usePlateEditorMock(options, deps);

    if (typeof options.value === 'function') {
      options.value({ getApi: getApiMock });
    }

    return { getApi: getApiMock };
  },
}));

vi.mock('@/components/editor/editor-kit', () => ({
  EditorKit: [],
}));

vi.mock('@/components/editor/settings-dialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('@/components/ui/fixed-toolbar', () => ({
  FixedToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="fixed-toolbar">{children}</div>
  ),
}));

vi.mock('@/components/ui/fixed-toolbar-buttons', () => ({
  FixedToolbarButtons: () => <div data-testid="fixed-toolbar-buttons" />,
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

vi.mock('@/components/ui/editor', () => ({
  Editor: ({
    className,
    onKeyDown,
    variant,
  }: {
    className?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    variant?: string;
  }) => (
    <div
      className={className}
      data-testid="editor-surface"
      data-variant={variant}
      role="textbox"
      tabIndex={0}
      onKeyDown={onKeyDown}
    />
  ),
  EditorContainer: React.forwardRef<
    HTMLDivElement,
    {
      children: React.ReactNode;
      className?: string;
      onScroll?: React.UIEventHandler<HTMLDivElement>;
      variant?: string;
    }
  >(({ children, className, onScroll, variant }, ref) => (
    <div
      ref={ref}
      className={className}
      data-variant={variant}
      onScroll={onScroll}
    >
      {children}
    </div>
  )),
}));

describe('PlateEditor', () => {
  beforeEach(() => {
    deserializeMock.mockReset();
    serializeMock.mockReset();
    getApiMock.mockClear();
    usePlateEditorMock.mockClear();
    documentTocBridgeMock.mockClear();
  });

  it('initializes workspace editor with native Plate value', () => {
    const value = [{ children: [{ text: '标题' }], type: 'h1' }];

    render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        value={value}
        variant="workspace"
      />,
    );

    expect(deserializeMock).not.toHaveBeenCalled();
    expect(usePlateEditorMock.mock.calls[0]?.[0].value).toBe(value);
    expect(usePlateEditorMock.mock.calls[0]?.[1]).toEqual([
      '/repo/guide.plate.json:1',
      'workspace',
    ]);
  });

  it('emits native Plate value on workspace editor changes', () => {
    const onValueChange = vi.fn();

    render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        value={[{ children: [{ text: '标题' }], type: 'h1' }]}
        variant="workspace"
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByTestId('plate-root'));

    expect(serializeMock).not.toHaveBeenCalled();
    expect(onValueChange).toHaveBeenCalledWith([
      { children: [{ text: '编辑后' }] },
    ]);
  });

  it('requests save from the workspace keyboard shortcut', () => {
    const onSaveRequested = vi.fn();

    render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        value={[{ children: [{ text: '标题' }], type: 'h1' }]}
        variant="workspace"
        onSaveRequested={onSaveRequested}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('editor-surface'), {
      key: 's',
      metaKey: true,
    });

    expect(onSaveRequested).toHaveBeenCalledTimes(1);
  });

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

  it('keeps workspace scrollbar styling on the editor container', () => {
    const { rerender } = render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        value={[{ children: [{ text: '标题' }], type: 'h1' }]}
        variant="workspace"
      />,
    );

    expect(screen.getByTestId('fixed-toolbar')).toBeTruthy();
    expect(screen.getByTestId('fixed-toolbar-buttons')).toBeTruthy();
    expect(screen.getByTestId('plate-editor-root').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('plate-editor-root').className).toContain(
      'min-h-0',
    );
    expect(
      screen.getByTestId('editor-surface').parentElement?.className,
    ).toContain(
      'workspace-editor-shell',
    );
    expect(
      screen.getByTestId('editor-surface').parentElement?.className,
    ).toContain(
      'workspace-editor-scrollarea',
    );
    expect(
      screen.getByTestId('editor-surface').parentElement?.getAttribute(
        'data-variant',
      ),
    ).toBe('workspace');
    expect(screen.getByTestId('editor-surface').className).toBe('');

    rerender(<PlateEditor variant="demo" />);

    expect(
      screen.getByTestId('editor-surface').parentElement?.className,
    ).toBe('');
    expect(screen.getByTestId('editor-surface').className).toBe('');
  });

  it('uses the default editor width for standard workspace pages', () => {
    render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        pageWidthMode="standard"
        value={[{ children: [{ text: '正文' }], type: 'p' }]}
        variant="workspace"
      />,
    );

    expect(screen.getByTestId('editor-surface').dataset.variant).toBe(
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

    expect(screen.getByTestId('editor-surface').dataset.variant).toBe(
      'workspaceWide',
    );
  });

  it('provides workspace root path to media upload context', () => {
    render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        value={[{ children: [{ text: '正文' }], type: 'p' }]}
        variant="workspace"
        workspaceRootPath="/repo"
      />,
    );

    expect(screen.getByTestId('plate-editor-root')).toBeTruthy();
  });

  it('scrolls the workspace editor back to top from the bottom-right action', () => {
    render(
      <PlateEditor
        documentKey="/repo/guide.plate.json:1"
        value={[{ children: [{ text: '正文' }], type: 'p' }]}
        variant="workspace"
      />,
    );

    expect(screen.queryByRole('button', { name: '回到顶部' })).toBeNull();

    const scrollContainer = screen.getByTestId('editor-surface')
      .parentElement as HTMLDivElement;
    const scrollToMock = vi.fn();

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      value: 260,
      writable: true,
    });
    scrollContainer.scrollTo = scrollToMock;

    fireEvent.scroll(scrollContainer);
    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }));

    expect(scrollToMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 0,
    });
  });

  it('does not render back to top action for the demo editor', () => {
    render(<PlateEditor variant="demo" />);

    expect(screen.queryByRole('button', { name: '回到顶部' })).toBeNull();
  });

  it('keeps the workspace toolbar outside the scrolling editor surface', () => {
    const globalsSource = readFileSync(
      join(process.cwd(), 'app/globals.css'),
      'utf8',
    );
    const fixedToolbarSource = readFileSync(
      join(process.cwd(), 'components/ui/fixed-toolbar.tsx'),
      'utf8',
    );

    expect(globalsSource).toContain('.workspace-editor-shell');
    expect(globalsSource).toContain('.workspace-editor-scrollarea');
    expect(globalsSource).not.toContain(
      '.workspace-editor-shell [data-slate-editor]',
    );
    expect(globalsSource).not.toContain('margin-block: 42px 8px');
    expect(globalsSource).toContain('scrollbar-width: thin');
    expect(globalsSource).toContain('width: 5px');
    expect(globalsSource).not.toContain('border: 1px solid transparent');
    expect(globalsSource).toContain('background: transparent');
    expect(fixedToolbarSource).toContain('fixed-editor-toolbar');
    expect(fixedToolbarSource).toContain('w-full shrink-0');
    expect(fixedToolbarSource).not.toContain('p-1 pr-5');
  });

  it('does not mount document toc bridge for demo editor', () => {
    render(<PlateEditor variant="demo" />);

    expect(screen.queryByTestId('document-toc-bridge')).toBeNull();
  });
});

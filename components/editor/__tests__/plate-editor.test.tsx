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

vi.mock('@/components/ui/editor', () => ({
  Editor: ({
    onKeyDown,
    variant,
  }: {
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    variant?: string;
  }) => (
    <div
      data-testid="editor-surface"
      data-variant={variant}
      role="textbox"
      tabIndex={0}
      onKeyDown={onKeyDown}
    />
  ),
  EditorContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('PlateEditor', () => {
  beforeEach(() => {
    deserializeMock.mockReset();
    serializeMock.mockReset();
    getApiMock.mockClear();
    usePlateEditorMock.mockClear();
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
});

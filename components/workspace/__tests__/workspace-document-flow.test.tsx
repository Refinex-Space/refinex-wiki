import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Value } from 'platejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readMarkdownDocument,
  renameWorkspaceNode,
  saveMarkdownDocument,
} from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    documentKey,
    onSaveRequested,
    onValueChange,
    value,
  }: {
    documentKey?: string;
    onSaveRequested?: () => void;
    onValueChange?: (value: Value) => void;
    value?: Value;
  }) => (
    <div>
      <div data-document-key={documentKey} data-testid="plate-editor">
        {JSON.stringify(value)}
      </div>
      <button
        type="button"
        onClick={() =>
          onValueChange?.([{ type: 'p', children: [{ text: '更新正文' }] }])
        }
      >
        模拟编辑
      </button>
      <button
        type="button"
        onClick={() =>
          onValueChange?.([{ type: 'h1', children: [{ text: '新标题' }] }])
        }
      >
        模拟H1修改
      </button>
      <button type="button" onClick={() => onSaveRequested?.()}>
        模拟快捷保存
      </button>
    </div>
  ),
}));

vi.mock('@/components/editor/markdown-document', () => ({
  extractH1Text: vi.fn((value: unknown[]) => {
    const h1 = value?.find(
      (n) => typeof n === 'object' && n !== null && (n as Record<string, unknown>).type === 'h1',
    );
    if (!h1) return null;
    return (
      ((h1 as Record<string, unknown>).children as Array<Record<string, unknown>>)
        ?.map((c) => (c.text as string) ?? '')
        .join('') ?? null
    );
  }),
  markdownToPlateValue: vi.fn((markdown: string) => [
    {
      children: [
        {
          text: markdown.includes('笔记正文')
            ? '笔记正文'
            : markdown.includes('正文')
              ? '正文'
              : '',
        },
      ],
      type: 'p',
    },
  ]),
  parseMarkdownDocument: vi.fn((markdown: string, fileName: string) => ({
    body: markdown.replace(/^---[\s\S]*?---\s*/, '').trim(),
    metadata: {
      createdAt: '2026-05-30T00:00:00.000Z',
      refinexDialect: 1,
      title: fileName.includes('notes') ? '笔记' : '指南',
      updatedAt: '2026-05-30T00:00:00.000Z',
    },
  })),
  plateValueToMarkdown: vi.fn((value: Value) =>
    value
      .flatMap((node) => node.children ?? [])
      .map((child) => child.text ?? '')
      .join(''),
  ),
  sanitizeTitleForFileName: vi.fn((title: string) => title),
  serializeMarkdownDocument: vi.fn(
    ({
      body,
      metadata,
    }: {
      body: string;
      metadata: { refinexDialect: number; title: string; updatedAt: string };
    }) =>
      `---\ntitle: ${metadata.title}\nupdatedAt: ${metadata.updatedAt}\nrefinexDialect: ${metadata.refinexDialect}\n---\n\n${body}\n`,
  ),
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    loadWorkspaceTree: vi.fn().mockResolvedValue({
      rootPath: '/repo',
      rootName: 'repo',
      nodes: [
        {
          id: 'guide',
          name: '新标题.md',
          kind: 'document',
          relativePath: '新标题.md',
          absolutePath: '/repo/新标题.md',
          title: '新标题',
        },
        {
          id: 'notes',
          name: 'notes.md',
          kind: 'document',
          relativePath: 'notes.md',
          absolutePath: '/repo/notes.md',
          title: '笔记',
        },
      ],
    }),
    readMarkdownDocument: vi.fn(),
    renameWorkspaceNode: vi.fn(),
    saveMarkdownDocument: vi.fn(),
    setAppWindowTitle: vi.fn(),
  };
});

const readMarkdownDocumentMock = vi.mocked(readMarkdownDocument);
const renameWorkspaceNodeMock = vi.mocked(renameWorkspaceNode);
const saveMarkdownDocumentMock = vi.mocked(saveMarkdownDocument);

const guideMarkdown =
  '---\ntitle: 指南\ncreatedAt: 2026-05-30T00:00:00.000Z\nupdatedAt: 2026-05-30T00:00:00.000Z\nrefinexDialect: 1\n---\n\n正文\n';

const notesMarkdown =
  '---\ntitle: 笔记\ncreatedAt: 2026-05-30T00:00:00.000Z\nupdatedAt: 2026-05-30T00:00:00.000Z\nrefinexDialect: 1\n---\n\n笔记正文\n';

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'guide',
      name: 'guide.md',
      kind: 'document',
      relativePath: 'guide.md',
      absolutePath: '/repo/guide.md',
      title: '指南',
    },
    {
      id: 'notes',
      name: 'notes.md',
      kind: 'document',
      relativePath: 'notes.md',
      absolutePath: '/repo/notes.md',
      title: '笔记',
    },
  ],
};

describe('Workspace native document flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readMarkdownDocumentMock.mockReset();
    renameWorkspaceNodeMock.mockReset();
    saveMarkdownDocumentMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the selected native document into the editor', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));

    await waitFor(() => {
      expect(screen.getByTestId('plate-editor').textContent).toContain('正文');
    });

    expect(readMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/guide.md',
    );
    expect(
      screen.getByTestId('plate-editor').getAttribute('data-document-key'),
    ).toBe('1');
  });

  it('auto saves edited native content after debounce', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      modifiedAt: 2,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('plate-editor');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('模拟编辑'));

    expect(screen.getByText('有未保存更改')).toBeTruthy();

    vi.advanceTimersByTime(800);
    vi.useRealTimers();

    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.stringContaining('更新正文'),
        1,
      );
    });
    await waitFor(() => {
      expect(screen.getByText('已保存')).toBeTruthy();
    });
  });

  it('saves immediately when save is requested', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      modifiedAt: 3,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('plate-editor');
    await user.click(screen.getByText('模拟编辑'));
    await user.click(screen.getByText('模拟快捷保存'));

    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.stringContaining('更新正文'),
        1,
      );
    });
  });

  it('keeps edited content visible when save fails', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    saveMarkdownDocumentMock.mockRejectedValueOnce(
      new Error('无法保存 Markdown 文档内容'),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('plate-editor');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('模拟编辑'));

    vi.advanceTimersByTime(800);
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText('无法保存 Markdown 文档内容')).toBeTruthy();
    });

    expect(screen.getByTestId('plate-editor')).toBeTruthy();
  });

  it('saves dirty content before opening another document', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce({
        path: '/repo/guide.md',
        content: guideMarkdown,
        modifiedAt: 1,
      })
      .mockResolvedValueOnce({
        path: '/repo/notes.md',
        content: notesMarkdown,
        modifiedAt: 4,
      });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      modifiedAt: 3,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('plate-editor');
    await user.click(screen.getByText('模拟编辑'));
    await user.click(screen.getByText('笔记'));

    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.stringContaining('更新正文'),
        1,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('plate-editor').textContent).toContain(
        '笔记正文',
      );
    });
  });

  it('renames document file when H1 title changes', async () => {
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    renameWorkspaceNodeMock.mockResolvedValueOnce({
      id: 'guide',
      name: '新标题.md',
      kind: 'document' as const,
      relativePath: '新标题.md',
      absolutePath: '/repo/新标题.md',
      title: '新标题',
      children: [],
    });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/新标题.md',
      modifiedAt: 2,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('指南'));
    await screen.findByTestId('plate-editor');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('模拟H1修改'));

    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    await waitFor(() => {
      expect(renameWorkspaceNodeMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.any(String),
      );
    });
    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenLastCalledWith(
        '/repo',
        '/repo/新标题.md',
        expect.any(String),
        null,
      );
    });
  });
});

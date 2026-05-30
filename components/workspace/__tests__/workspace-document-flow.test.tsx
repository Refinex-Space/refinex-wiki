import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readDocument, saveDocument } from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    documentKey,
    markdown,
  }: {
    documentKey?: string;
    markdown?: string;
  }) => (
    <div data-document-key={documentKey} data-testid="plate-editor">
      {markdown}
    </div>
  ),
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    readDocument: vi.fn(),
    saveDocument: vi.fn(),
    setAppWindowTitle: vi.fn(),
  };
});

const readDocumentMock = vi.mocked(readDocument);
const saveDocumentMock = vi.mocked(saveDocument);

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
  ],
};

describe('Workspace document flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readDocumentMock.mockReset();
    saveDocumentMock.mockReset();
  });

  it('loads the selected markdown document into the editor', async () => {
    const user = userEvent.setup();
    let resolveDocument: (
      value: Awaited<ReturnType<typeof readDocument>>,
    ) => void = () => {};
    readDocumentMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDocument = resolve;
      }),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));

    expect(screen.getByText('正在打开文档...')).toBeTruthy();

    resolveDocument({
      path: '/repo/guide.md',
      content: '# 指南\n正文',
      modifiedAt: 1,
    });

    await waitFor(() => {
      expect(screen.getByTestId('plate-editor').textContent).toContain(
        '# 指南',
      );
    });

    expect(readDocumentMock).toHaveBeenCalledWith('/repo', '/repo/guide.md');
    expect(
      screen.getByTestId('plate-editor').getAttribute('data-document-key'),
    ).toBe('/repo/guide.md:1');
  });

  it('shows a document read error without clearing the sidebar', async () => {
    const user = userEvent.setup();
    readDocumentMock.mockRejectedValueOnce(new Error('无法读取文档内容'));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));

    await waitFor(() => {
      expect(screen.getByText('无法读取文档内容')).toBeTruthy();
    });

    expect(screen.getByText('指南')).toBeTruthy();
    expect(screen.queryByTestId('plate-editor')).toBeNull();
  });
});

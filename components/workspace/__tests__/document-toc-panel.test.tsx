import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentTocPanel } from '../document-toc-panel';
import type { WorkspaceNode } from '../workspace-types';

const currentDocument: WorkspaceNode = {
  absolutePath: '/repo/guide.md',
  id: 'guide',
  kind: 'document',
  name: 'guide.md',
  relativePath: 'guide.md',
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

  it('renders toc items with active text color and normalized indentation', async () => {
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
    expect(screen.getByRole('button', { name: '细节' }).className).toContain(
      'text-foreground',
    );
    expect(screen.getByRole('button', { name: '细节' }).className).toContain(
      'font-medium',
    );
    expect(screen.getByRole('button', { name: '背景' }).className).toContain(
      'text-muted-foreground',
    );
    expect(screen.getByRole('button', { name: '背景' }).className).not.toContain(
      'font-medium',
    );
    expect(screen.getByRole('button', { name: '细节' }).className).not.toMatch(
      /bg-\[#3574f0\]\/10|border-l-\[#3574f0\]|border-l-2/,
    );

    await user.click(screen.getByRole('button', { name: '背景' }));

    expect(scrollToHeading).toHaveBeenCalledWith('h2-a');
  });
});

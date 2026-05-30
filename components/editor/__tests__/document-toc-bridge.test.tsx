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

const { onContentScrollMock, useTocElementStateMock } = vi.hoisted(() => ({
  onContentScrollMock: vi.fn(),
  useTocElementStateMock: vi.fn(),
}));

const headingList = [
  { depth: 1, id: 'h1-title', path: [0], title: '文档标题', type: 'h1' },
  { depth: 2, id: 'h2-a', path: [1], title: '背景', type: 'h2' },
  { depth: 3, id: 'h3-a', path: [2], title: '细节', type: 'h3' },
  { depth: 4, id: 'h4-a', path: [3], title: '更深层', type: 'h4' },
];

vi.mock('@platejs/toc/react', () => ({
  useTocElementState: () => useTocElementStateMock(),
}));

describe('document toc bridge', () => {
  beforeEach(() => {
    onContentScrollMock.mockReset();
    useTocElementStateMock.mockReset();
    useTocElementStateMock.mockImplementation(() => ({
      activeContentId: 'h2-a',
      headingList,
      onContentScroll: onContentScrollMock,
    }));
  });

  it('filters out h1 and normalizes visual depth from h2', () => {
    expect(normalizeDocumentTocItems(headingList)).toEqual([
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
    const items = normalizeDocumentTocItems(headingList);

    expect(resolveActiveDocumentTocId('h1-title', items)).toBeNull();
    expect(resolveActiveDocumentTocId('h2-a', items)).toBe('h2-a');
  });

  it('publishes a toc snapshot and scroll callback from Plate state', async () => {
    const user = userEvent.setup();
    const onSnapshotChange = vi.fn();

    function Harness() {
      const [snapshot, setSnapshot] =
        React.useState<DocumentTocSnapshot | null>(null);

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

  it('does not republish an equivalent toc snapshot on parent rerenders', async () => {
    const user = userEvent.setup();
    const onSnapshotChange = vi.fn();

    useTocElementStateMock.mockImplementation(() => ({
      activeContentId: 'h2-a',
      headingList: headingList.map((heading) => ({ ...heading })),
      onContentScroll: onContentScrollMock,
    }));

    function Harness() {
      const [, setSnapshot] = React.useState<DocumentTocSnapshot | null>(null);
      const [count, setCount] = React.useState(0);

      return (
        <>
          <DocumentTocBridge
            onSnapshotChange={(nextSnapshot) => {
              setSnapshot(nextSnapshot);
              onSnapshotChange(nextSnapshot);
            }}
          />
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            rerender {count}
          </button>
        </>
      );
    }

    render(<Harness />);
    expect(onSnapshotChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'rerender 0' }));

    expect(onSnapshotChange).toHaveBeenCalledTimes(1);
  });
});

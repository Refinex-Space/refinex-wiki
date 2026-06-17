import { describe, expect, it, vi } from 'vitest';

import {
  buildTocSnapshot,
  scrollToHeadingIn,
  type DocumentTocItem,
} from '@/components/editor/markdown-toc';

import type { EditorView } from '@codemirror/view';
import type { MarkoraTocItem } from '@refinex/markora/editor';

function makeItem(
  level: 2 | 3 | 4 | 6,
  text: string,
  from: number,
): MarkoraTocItem {
  return { id: text, level, text, from, to: from + 10, active: false };
}

describe('buildTocSnapshot', () => {
  it('过滤 H1，映射 depth = level - 1，clamp 到 [1,3]', () => {
    const items: MarkoraTocItem[] = [
      makeItem(2, '章节 A', 10),
      makeItem(3, '小节', 50),
      makeItem(4, '深层', 80),
    ];

    const snapshot = buildTocSnapshot(items, null);

    expect(snapshot.items).toEqual<DocumentTocItem[]>([
      { depth: 1, id: '章节 A', originalDepth: 2, title: '章节 A', type: 'h2' },
      { depth: 2, id: '小节', originalDepth: 3, title: '小节', type: 'h3' },
      { depth: 3, id: '深层', originalDepth: 4, title: '深层', type: 'h4' },
    ]);
  });

  it('level 6 映射 depth 仍 clamp 到 3', () => {
    const snapshot = buildTocSnapshot([makeItem(6, '深', 0)], null);
    expect(snapshot.items[0]?.depth).toBe(3);
    expect(snapshot.items[0]?.type).toBe('h6');
  });

  it('activeContentId 为 null 时 snapshot.activeContentId 为 null', () => {
    const snapshot = buildTocSnapshot([makeItem(2, 'A', 10)], null);
    expect(snapshot.activeContentId).toBeNull();
  });

  it('activeContentId 指向不存在的 item 时返回 null', () => {
    const snapshot = buildTocSnapshot([makeItem(2, 'A', 10)], 'nope');
    expect(snapshot.activeContentId).toBeNull();
  });

  it('activeContentId 指向存在的 item 时原样返回', () => {
    const snapshot = buildTocSnapshot([makeItem(2, 'A', 10)], 'A');
    expect(snapshot.activeContentId).toBe('A');
  });

  it('空 items 返回空列表', () => {
    const snapshot = buildTocSnapshot([], null);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.activeContentId).toBeNull();
  });
});

describe('scrollToHeadingIn', () => {
  it('找到 item 时 dispatch scrollIntoView effect', () => {
    const dispatch = vi.fn();
    const view = { dispatch } as unknown as EditorView;
    const items = [makeItem(2, '章节', 42)];

    scrollToHeadingIn(view, items, '章节');

    expect(dispatch).toHaveBeenCalledOnce();
    const call = dispatch.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.effects).toBeDefined();
  });

  it('view 为 null 时不抛错', () => {
    expect(() =>
      scrollToHeadingIn(null, [makeItem(2, 'A', 0)], 'A'),
    ).not.toThrow();
  });

  it('id 不存在时不 dispatch', () => {
    const dispatch = vi.fn();
    const view = { dispatch } as unknown as EditorView;

    scrollToHeadingIn(view, [makeItem(2, 'A', 0)], '不存在');

    expect(dispatch).not.toHaveBeenCalled();
  });
});

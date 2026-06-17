import { EditorView } from '@codemirror/view';
import type { MarkoraTocItem } from '@refinex/markora/editor';

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

const LEVEL_TO_TYPE: Record<number, string> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

/**
 * 把 markora 的 MarkoraTocItem[] 映射为右侧 TOC 面板需要的 DocumentTocItem[]。
 * 过滤 H1（level 1），depth = level - 1 并 clamp 到 [1,3]。
 */
export function buildTocSnapshot(
  items: MarkoraTocItem[],
  activeId: string | null,
): Pick<DocumentTocSnapshot, 'items' | 'activeContentId'> {
  const tocItems: DocumentTocItem[] = items
    .filter((item) => item.level > 1)
    .map((item) => ({
      depth: Math.min(Math.max(item.level - 1, 1), 3),
      id: item.id,
      originalDepth: item.level,
      title: item.text,
      type: LEVEL_TO_TYPE[item.level] ?? `h${item.level}`,
    }));

  const activeContentId =
    activeId && tocItems.some((item) => item.id === activeId)
      ? activeId
      : null;

  return { items: tocItems, activeContentId };
}

/**
 * 滚动定位到指定标题。通过 CodeMirror 的 scrollIntoView effect 实现。
 */
export function scrollToHeadingIn(
  view: EditorView | null,
  items: MarkoraTocItem[],
  id: string,
): void {
  if (!view) {
    return;
  }

  const item = items.find((entry) => entry.id === id);

  if (!item || typeof item.from !== 'number') {
    return;
  }

  view.dispatch({
    effects: EditorView.scrollIntoView(item.from, { y: 'start' }),
  });
}

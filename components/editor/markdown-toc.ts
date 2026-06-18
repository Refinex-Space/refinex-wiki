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

const HEADING_SCROLL_OFFSET_PX = 24;

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
 * 滚动定位到指定标题。优先滚动业务外层容器，避免依赖 CodeMirror 内层 scroller。
 */
export function scrollToHeadingIn(
  view: EditorView | null,
  items: MarkoraTocItem[],
  id: string,
  scrollContainer?: HTMLElement | null,
): void {
  if (!view) {
    return;
  }

  const item = items.find((entry) => entry.id === id);

  if (!item || typeof item.from !== 'number') {
    return;
  }

  if (scrollContainer && scrollOuterContainerToPosition(view, item.from, scrollContainer)) {
    return;
  }

  view.dispatch({
    effects: EditorView.scrollIntoView(item.from, { y: 'start' }),
  });
}

function scrollOuterContainerToPosition(
  view: EditorView,
  from: number,
  scrollContainer: HTMLElement,
) {
  const top = resolveOuterScrollTop(view, from, scrollContainer);

  if (top === null) {
    return false;
  }

  scrollContainer.scrollTo({
    behavior: 'smooth',
    top,
  });

  return true;
}

function resolveOuterScrollTop(
  view: EditorView,
  from: number,
  scrollContainer: HTMLElement,
) {
  const lineBlockTop = resolveLineBlockTop(view, from);

  if (lineBlockTop !== null) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const editorRect = view.dom.getBoundingClientRect();

    return Math.max(
      0,
      scrollContainer.scrollTop +
        editorRect.top -
        containerRect.top +
        lineBlockTop -
        HEADING_SCROLL_OFFSET_PX,
    );
  }

  const coords = view.coordsAtPos(from);

  if (coords) {
    const containerRect = scrollContainer.getBoundingClientRect();

    return Math.max(
      0,
      scrollContainer.scrollTop +
        coords.top -
        containerRect.top -
        HEADING_SCROLL_OFFSET_PX,
    );
  }

  return null;
}

function resolveLineBlockTop(view: EditorView, from: number) {
  try {
    return view.lineBlockAt(from).top;
  } catch {
    return null;
  }
}

'use client';

import * as React from 'react';

import type { Heading } from '@platejs/toc';
import { useTocElementState } from '@platejs/toc/react';

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

interface DocumentTocBridgeProps {
  onSnapshotChange: (snapshot: DocumentTocSnapshot) => void;
}

export function DocumentTocBridge({
  onSnapshotChange,
}: DocumentTocBridgeProps) {
  const state = useTocElementState();
  const onSnapshotChangeRef = React.useRef(onSnapshotChange);
  const onContentScrollRef = React.useRef(state.onContentScroll);
  const lastPublishedKeyRef = React.useRef<string | null>(null);
  const items = React.useMemo(
    () => normalizeDocumentTocItems(state.headingList),
    [state.headingList],
  );
  const activeContentId = resolveActiveDocumentTocId(
    state.activeContentId ?? null,
    items,
  );
  const scrollToHeading = React.useCallback(
    (id: string) => {
      const target = document.getElementById(id);

      if (!target) {
        return;
      }

      onContentScrollRef.current(target, id, 'smooth');
    },
    [],
  );

  React.useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  }, [onSnapshotChange]);

  React.useEffect(() => {
    onContentScrollRef.current = state.onContentScroll;
  }, [state.onContentScroll]);

  React.useEffect(() => {
    const snapshotKey = createDocumentTocSnapshotKey(activeContentId, items);

    if (lastPublishedKeyRef.current === snapshotKey) {
      return;
    }

    lastPublishedKeyRef.current = snapshotKey;
    onSnapshotChangeRef.current({
      activeContentId,
      items,
      scrollToHeading,
    });
  }, [activeContentId, items, scrollToHeading]);

  return null;
}

function createDocumentTocSnapshotKey(
  activeContentId: string | null,
  items: DocumentTocItem[],
) {
  return [
    activeContentId ?? '',
    ...items.map((item) =>
      [item.id, item.title, item.type, item.depth, item.originalDepth].join(
        '\u001f',
      ),
    ),
  ].join('\u001e');
}

export function normalizeDocumentTocItems(
  headingList: Heading[],
): DocumentTocItem[] {
  return headingList
    .filter((heading) => heading.type !== 'h1' && heading.title.trim())
    .map((heading) => ({
      depth: Math.min(Math.max(heading.depth - 1, 1), 3),
      id: heading.id,
      originalDepth: heading.depth,
      title: heading.title,
      type: heading.type,
    }));
}

export function resolveActiveDocumentTocId(
  activeContentId: string | null,
  items: DocumentTocItem[],
) {
  if (!activeContentId) {
    return null;
  }

  return items.some((item) => item.id === activeContentId)
    ? activeContentId
    : null;
}

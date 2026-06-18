import { describe, expect, it } from 'vitest';

import {
  closeAllTabsInGroup,
  closeOtherTabsInGroup,
  closeTabInGroup,
  closeTabsToLeftInGroup,
  closeTabsToRightInGroup,
  createInitialEditorLayout,
  openDocumentInGroup,
  selectTabInGroup,
  splitEditorGroup,
} from '../document-tabs';
import type { WorkspaceNode } from '../workspace-types';

function doc(id: string, title = id): WorkspaceNode {
  return {
    absolutePath: `/repo/${id}.md`,
    id,
    kind: 'document',
    name: `${id}.md`,
    relativePath: `${id}.md`,
    title,
  };
}

describe('document tabs model', () => {
  it('opens documents in the active group and selects existing tabs', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a', 'A'));
    layout = openDocumentInGroup(layout, doc('b', 'B'));
    layout = openDocumentInGroup(layout, doc('a', 'A updated'));

    const group = layout.groups[0];

    expect(group.tabs.map((tab) => tab.absolutePath)).toEqual([
      '/repo/a.md',
      '/repo/b.md',
    ]);
    expect(group.tabs[0].title).toBe('A updated');
    expect(group.activeTabPath).toBe('/repo/a.md');
  });

  it('closes active tabs and selects the nearest neighbor', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));
    layout = openDocumentInGroup(layout, doc('b'));
    layout = openDocumentInGroup(layout, doc('c'));

    layout = closeTabInGroup(layout, 'group-1', '/repo/b.md');

    expect(layout.groups[0].tabs.map((tab) => tab.absolutePath)).toEqual([
      '/repo/a.md',
      '/repo/c.md',
    ]);
    expect(layout.groups[0].activeTabPath).toBe('/repo/c.md');
  });

  it('selects a tab in the requested group', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));
    layout = openDocumentInGroup(layout, doc('b'));

    layout = selectTabInGroup(layout, 'group-1', '/repo/a.md');

    expect(layout.groups[0].activeTabPath).toBe('/repo/a.md');
    expect(layout.activeGroupId).toBe('group-1');
  });

  it('supports close other, close all, close left, and close right', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));
    layout = openDocumentInGroup(layout, doc('b'));
    layout = openDocumentInGroup(layout, doc('c'));
    layout = openDocumentInGroup(layout, doc('d'));

    expect(
      closeOtherTabsInGroup(layout, 'group-1', '/repo/c.md').groups[0].tabs.map(
        (tab) => tab.absolutePath,
      ),
    ).toEqual(['/repo/c.md']);

    expect(
      closeTabsToLeftInGroup(layout, 'group-1', '/repo/c.md').groups[0].tabs.map(
        (tab) => tab.absolutePath,
      ),
    ).toEqual(['/repo/c.md', '/repo/d.md']);

    expect(
      closeTabsToRightInGroup(layout, 'group-1', '/repo/b.md').groups[0].tabs.map(
        (tab) => tab.absolutePath,
      ),
    ).toEqual(['/repo/a.md', '/repo/b.md']);

    expect(closeAllTabsInGroup(layout, 'group-1').groups[0].tabs).toEqual([]);
  });

  it('splits a tab into a new editor group', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));
    layout = openDocumentInGroup(layout, doc('b'));

    layout = splitEditorGroup(layout, 'group-1', '/repo/b.md', 'right');

    expect(layout.orientation).toBe('horizontal');
    expect(layout.groups).toHaveLength(2);
    expect(layout.groups[1]).toMatchObject({
      activeTabPath: '/repo/b.md',
      id: 'group-2',
    });
    expect(layout.activeGroupId).toBe('group-2');
  });

  it('removes an empty split group after closing its last tab', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));
    layout = splitEditorGroup(layout, 'group-1', '/repo/a.md', 'right');

    layout = closeTabInGroup(layout, 'group-2', '/repo/a.md');

    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].id).toBe('group-1');
    expect(layout.groups[0].activeTabPath).toBe('/repo/a.md');
    expect(layout.orientation).toBe('single');
    expect(layout.activeGroupId).toBe('group-1');
  });

  it('removes a split group when closing all tabs in that group', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));
    layout = splitEditorGroup(layout, 'group-1', '/repo/a.md', 'down');

    layout = closeAllTabsInGroup(layout, 'group-2');

    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].id).toBe('group-1');
    expect(layout.orientation).toBe('single');
  });

  it('keeps a single empty group when every tab is closed', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentInGroup(layout, doc('a'));

    layout = closeAllTabsInGroup(layout, 'group-1');

    expect(layout.groups).toEqual([
      {
        activeTabPath: null,
        id: 'group-1',
        tabs: [],
      },
    ]);
    expect(layout.orientation).toBe('single');
    expect(layout.activeGroupId).toBe('group-1');
  });
});

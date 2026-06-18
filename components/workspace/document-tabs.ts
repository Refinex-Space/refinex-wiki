import type { WorkspaceNode } from './workspace-types';

export type EditorSplitDirection = 'right' | 'down';
export type EditorSplitOrientation = 'single' | 'horizontal' | 'vertical';

export interface DocumentEditorTab {
  absolutePath: string;
  name: string;
  title: string;
}

export interface DocumentEditorGroup {
  activeTabPath: string | null;
  id: string;
  tabs: DocumentEditorTab[];
}

export interface DocumentEditorLayout {
  activeGroupId: string;
  groups: DocumentEditorGroup[];
  orientation: EditorSplitOrientation;
}

export function createInitialEditorLayout(): DocumentEditorLayout {
  return {
    activeGroupId: 'group-1',
    groups: [{ activeTabPath: null, id: 'group-1', tabs: [] }],
    orientation: 'single',
  };
}

export function openDocumentInGroup(
  layout: DocumentEditorLayout,
  document: WorkspaceNode,
  groupId = layout.activeGroupId,
): DocumentEditorLayout {
  if (document.kind !== 'document') {
    return layout;
  }

  const tab = createDocumentTab(document);
  return updateGroup(layout, groupId, (group) => {
    const existingIndex = group.tabs.findIndex(
      (entry) => entry.absolutePath === tab.absolutePath,
    );
    const tabs =
      existingIndex === -1
        ? [...group.tabs, tab]
        : group.tabs.map((entry, index) =>
            index === existingIndex ? { ...entry, ...tab } : entry,
          );

    return {
      ...group,
      activeTabPath: tab.absolutePath,
      tabs,
    };
  });
}

export function selectTabInGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  tabPath: string,
): DocumentEditorLayout {
  return updateGroup(layout, groupId, (group) => {
    const tab = group.tabs.find((entry) => entry.absolutePath === tabPath);

    return tab ? { ...group, activeTabPath: tab.absolutePath } : group;
  });
}

export function closeTabInGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  tabPath: string,
): DocumentEditorLayout {
  return normalizeEditorLayout(
    updateGroup(layout, groupId, (group) => {
      const tabIndex = group.tabs.findIndex(
        (tab) => tab.absolutePath === tabPath,
      );

      if (tabIndex === -1) {
        return group;
      }

      const tabs = group.tabs.filter((tab) => tab.absolutePath !== tabPath);
      const activeTabPath =
        group.activeTabPath === tabPath
          ? tabs[Math.min(tabIndex, tabs.length - 1)]?.absolutePath ?? null
          : group.activeTabPath;

      return { ...group, activeTabPath, tabs };
    }),
  );
}

export function closeOtherTabsInGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  tabPath: string,
): DocumentEditorLayout {
  return normalizeEditorLayout(
    updateGroup(layout, groupId, (group) => {
      const tab = group.tabs.find((entry) => entry.absolutePath === tabPath);

      return tab ? { ...group, activeTabPath: tabPath, tabs: [tab] } : group;
    }),
  );
}

export function closeAllTabsInGroup(
  layout: DocumentEditorLayout,
  groupId: string,
): DocumentEditorLayout {
  return normalizeEditorLayout(
    updateGroup(layout, groupId, (group) => ({
      ...group,
      activeTabPath: null,
      tabs: [],
    })),
  );
}

export function closeTabsToLeftInGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  tabPath: string,
): DocumentEditorLayout {
  return normalizeEditorLayout(
    updateGroup(layout, groupId, (group) => {
      const tabIndex = group.tabs.findIndex(
        (tab) => tab.absolutePath === tabPath,
      );

      if (tabIndex === -1) {
        return group;
      }

      const tabs = group.tabs.slice(tabIndex);
      return {
        ...group,
        activeTabPath: tabs.some(
          (tab) => tab.absolutePath === group.activeTabPath,
        )
          ? group.activeTabPath
          : tabPath,
        tabs,
      };
    }),
  );
}

export function closeTabsToRightInGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  tabPath: string,
): DocumentEditorLayout {
  return normalizeEditorLayout(
    updateGroup(layout, groupId, (group) => {
      const tabIndex = group.tabs.findIndex(
        (tab) => tab.absolutePath === tabPath,
      );

      if (tabIndex === -1) {
        return group;
      }

      const tabs = group.tabs.slice(0, tabIndex + 1);
      return {
        ...group,
        activeTabPath: tabs.some(
          (tab) => tab.absolutePath === group.activeTabPath,
        )
          ? group.activeTabPath
          : tabPath,
        tabs,
      };
    }),
  );
}

export function splitEditorGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  tabPath: string,
  direction: EditorSplitDirection,
): DocumentEditorLayout {
  const sourceGroup = layout.groups.find((group) => group.id === groupId);
  const tab = sourceGroup?.tabs.find((entry) => entry.absolutePath === tabPath);

  if (!tab) {
    return layout;
  }

  const newGroupId = nextGroupId(layout);
  return {
    activeGroupId: newGroupId,
    groups: [
      ...layout.groups,
      {
        activeTabPath: tab.absolutePath,
        id: newGroupId,
        tabs: [tab],
      },
    ],
    orientation: direction === 'right' ? 'horizontal' : 'vertical',
  };
}

export function getActiveEditorGroup(layout: DocumentEditorLayout) {
  return (
    layout.groups.find((group) => group.id === layout.activeGroupId) ??
    layout.groups[0]
  );
}

export function getActiveTab(group: DocumentEditorGroup) {
  return (
    group.tabs.find((tab) => tab.absolutePath === group.activeTabPath) ?? null
  );
}

function createDocumentTab(document: WorkspaceNode): DocumentEditorTab {
  return {
    absolutePath: document.absolutePath,
    name: document.name,
    title: document.title || document.name,
  };
}

function updateGroup(
  layout: DocumentEditorLayout,
  groupId: string,
  update: (group: DocumentEditorGroup) => DocumentEditorGroup,
): DocumentEditorLayout {
  return {
    ...layout,
    activeGroupId: groupId,
    groups: layout.groups.map((group) =>
      group.id === groupId ? update(group) : group,
    ),
  };
}

function normalizeEditorLayout(
  layout: DocumentEditorLayout,
): DocumentEditorLayout {
  const groups = layout.groups
    .filter((group) => group.tabs.length > 0)
    .map((group) => {
      const activeTabPath = group.tabs.some(
        (tab) => tab.absolutePath === group.activeTabPath,
      )
        ? group.activeTabPath
        : group.tabs[0].absolutePath;

      return { ...group, activeTabPath };
    });

  if (groups.length === 0) {
    const fallbackGroup = layout.groups[0] ?? {
      activeTabPath: null,
      id: 'group-1',
      tabs: [],
    };

    return {
      activeGroupId: fallbackGroup.id,
      groups: [{ ...fallbackGroup, activeTabPath: null, tabs: [] }],
      orientation: 'single',
    };
  }

  const activeGroupId = groups.some((group) => group.id === layout.activeGroupId)
    ? layout.activeGroupId
    : groups[0].id;

  return {
    ...layout,
    activeGroupId,
    groups,
    orientation:
      groups.length === 1
        ? 'single'
        : layout.orientation === 'single'
          ? 'horizontal'
          : layout.orientation,
  };
}

function nextGroupId(layout: DocumentEditorLayout) {
  const maxIndex = layout.groups.reduce((currentMax, group) => {
    const match = /^group-(\d+)$/u.exec(group.id);
    const index = match ? Number(match[1]) : 0;

    return Math.max(currentMax, index);
  }, 0);

  return `group-${maxIndex + 1}`;
}

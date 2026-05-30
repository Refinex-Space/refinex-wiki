'use client';

import * as React from 'react';

import {
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  saveRecentWorkspacePath,
  selectWorkspaceRoot,
} from './workspace-api';
import { searchWorkspace } from './workspace-tree';
import type {
  WorkspaceLoadError,
  WorkspaceHistoryItem,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';

export function useWorkspace(initialSnapshot?: WorkspaceSnapshot | null) {
  const [snapshot, setSnapshot] = React.useState<WorkspaceSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [currentDocument, setCurrentDocument] =
    React.useState<WorkspaceNode | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [error, setError] = React.useState<WorkspaceLoadError | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [isAiPanelCollapsed, setAiPanelCollapsed] = React.useState(true);
  const [storedWorkspaceHistory, setStoredWorkspaceHistory] = React.useState<
    WorkspaceHistoryItem[]
  >(() => getWorkspaceHistory());

  const loadWorkspace = React.useCallback(async (rootPath: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSnapshot = await loadWorkspaceTree(rootPath);
      setSnapshot(nextSnapshot);
      setCurrentDocument(null);
      saveRecentWorkspacePath(nextSnapshot.rootPath);
      setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
    } catch {
      setError({
        message: '无法读取工作区，请重新选择文件夹。',
        recoverable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const workspaceHistory = React.useMemo(() => {
    return storedWorkspaceHistory;
  }, [storedWorkspaceHistory]);

  const removeWorkspace = React.useCallback(
    (rootPath: string) => {
      setStoredWorkspaceHistory(removeWorkspaceHistory(rootPath));

      if (snapshot?.rootPath === rootPath) {
        setSnapshot(null);
        setCurrentDocument(null);
        setSearchQuery('');
        setError(null);
      }
    },
    [snapshot?.rootPath],
  );

  const openWorkspace = React.useCallback(async () => {
    const selected = await selectWorkspaceRoot();

    if (!selected) {
      return;
    }

    await loadWorkspace(selected);
  }, [loadWorkspace]);

  React.useEffect(() => {
    if (snapshot) {
      return;
    }

    const recentPath = getRecentWorkspacePath();

    if (recentPath) {
      queueMicrotask(() => {
        void loadWorkspace(recentPath);
      });
    }
  }, [loadWorkspace, snapshot]);

  return {
    currentDocument,
    error,
    isAiPanelCollapsed,
    isLoading,
    isSidebarCollapsed,
    openWorkspace,
    searchQuery,
    searchResults: snapshot ? searchWorkspace(snapshot.nodes, searchQuery) : [],
    setAiPanelCollapsed,
    setCurrentDocument,
    setSearchQuery,
    setSidebarCollapsed,
    snapshot,
    switchWorkspace: loadWorkspace,
    workspaceHistory,
    removeWorkspace,
  };
}

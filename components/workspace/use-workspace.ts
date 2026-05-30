'use client';

import * as React from 'react';

import {
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  readDocument,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  saveRecentWorkspacePath,
  selectWorkspaceRoot,
} from './workspace-api';
import { searchWorkspace } from './workspace-tree';
import type {
  DocumentContent,
  DocumentLoadState,
  DocumentSaveState,
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
  const [documentContent, setDocumentContent] =
    React.useState<DocumentContent | null>(null);
  const [documentLoadState, setDocumentLoadState] =
    React.useState<DocumentLoadState>('idle');
  const [documentLoadError, setDocumentLoadError] = React.useState<
    string | null
  >(null);
  const [documentVersion, setDocumentVersion] = React.useState(0);
  const [draftMarkdown, setDraftMarkdown] = React.useState('');
  const [saveState, setSaveState] = React.useState<DocumentSaveState>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [error, setError] = React.useState<WorkspaceLoadError | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [isAiPanelCollapsed, setAiPanelCollapsed] = React.useState(true);
  const [storedWorkspaceHistory, setStoredWorkspaceHistory] = React.useState<
    WorkspaceHistoryItem[]
  >(() => getWorkspaceHistory());

  const lastSavedMarkdownRef = React.useRef('');
  const pendingSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearPendingSave = React.useCallback(() => {
    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }
  }, []);

  const resetDocumentState = React.useCallback(() => {
    clearPendingSave();
    setCurrentDocument(null);
    setDocumentContent(null);
    setDocumentLoadState('idle');
    setDocumentLoadError(null);
    setDocumentVersion(0);
    setDraftMarkdown('');
    lastSavedMarkdownRef.current = '';
    setSaveState('idle');
    setSaveError(null);
    setLastSavedAt(null);
  }, [clearPendingSave]);

  const loadWorkspace = React.useCallback(
    async (rootPath: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const nextSnapshot = await loadWorkspaceTree(rootPath);
        setSnapshot(nextSnapshot);
        resetDocumentState();
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
    },
    [resetDocumentState],
  );

  const openDocument = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'document') {
        return;
      }

      clearPendingSave();
      setCurrentDocument(node);
      setDocumentContent(null);
      setDocumentLoadState('loading');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);

      try {
        const content = await readDocument(snapshot.rootPath, node.absolutePath);

        setDocumentContent(content);
        setDraftMarkdown(content.content);
        lastSavedMarkdownRef.current = content.content;
        setDocumentVersion((version) => version + 1);
        setDocumentLoadState('loaded');
        setSaveState('saved');
        setLastSavedAt(content.modifiedAt);
      } catch (documentError) {
        setDocumentContent(null);
        setDraftMarkdown('');
        lastSavedMarkdownRef.current = '';
        setDocumentLoadState('error');
        setDocumentLoadError(
          documentError instanceof Error
            ? documentError.message
            : '无法读取文档内容',
        );
      }
    },
    [clearPendingSave, snapshot],
  );

  const retryCurrentDocument = React.useCallback(() => {
    if (currentDocument) {
      void openDocument(currentDocument);
    }
  }, [currentDocument, openDocument]);

  const workspaceHistory = React.useMemo(() => {
    return storedWorkspaceHistory;
  }, [storedWorkspaceHistory]);

  const removeWorkspace = React.useCallback(
    (rootPath: string) => {
      setStoredWorkspaceHistory(removeWorkspaceHistory(rootPath));

      if (snapshot?.rootPath === rootPath) {
        setSnapshot(null);
        resetDocumentState();
        setSearchQuery('');
        setError(null);
      }
    },
    [resetDocumentState, snapshot?.rootPath],
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
    documentContent,
    documentLoadError,
    documentLoadState,
    documentVersion,
    draftMarkdown,
    error,
    isAiPanelCollapsed,
    isLoading,
    isSidebarCollapsed,
    lastSavedAt,
    openDocument,
    openWorkspace,
    retryCurrentDocument,
    saveError,
    saveState,
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

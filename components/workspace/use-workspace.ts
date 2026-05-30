'use client';

import * as React from 'react';

import {
  createImportedPlateDocuments,
  createPlateDocument,
  createWorkspaceRoot,
  createWorkspaceDirectory,
  deleteWorkspaceNode,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  readMarkdownSourceFiles,
  readPlateDocument,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  savePlateDocument,
  selectMarkdownSourceFiles,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
} from './workspace-api';
import { searchWorkspace } from './workspace-tree';
import type {
  DocumentLoadState,
  DocumentSaveState,
  PlateDocumentContent,
  PlateDocumentEnvelope,
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
    React.useState<PlateDocumentContent | null>(null);
  const [draftEnvelope, setDraftEnvelope] =
    React.useState<PlateDocumentEnvelope | null>(null);
  const [documentLoadState, setDocumentLoadState] =
    React.useState<DocumentLoadState>('idle');
  const [documentLoadError, setDocumentLoadError] = React.useState<
    string | null
  >(null);
  const [documentVersion, setDocumentVersion] = React.useState(0);
  const [saveState, setSaveState] = React.useState<DocumentSaveState>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [pendingRenameNodePath, setPendingRenameNodePath] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<WorkspaceLoadError | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [isAiPanelCollapsed, setAiPanelCollapsed] = React.useState(true);
  const [storedWorkspaceHistory, setStoredWorkspaceHistory] = React.useState<
    WorkspaceHistoryItem[]
  >(() => getWorkspaceHistory());

  const lastSavedEnvelopeRef = React.useRef('');
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
    setDraftEnvelope(null);
    setDocumentLoadState('idle');
    setDocumentLoadError(null);
    setDocumentVersion(0);
    setSaveState('idle');
    setSaveError(null);
    setLastSavedAt(null);
    setPendingRenameNodePath(null);
    lastSavedEnvelopeRef.current = '';
  }, [clearPendingSave]);

  const refreshWorkspaceTree = React.useCallback(async () => {
    if (!snapshot) {
      return null;
    }

    const nextSnapshot = await loadWorkspaceTree(snapshot.rootPath);
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [snapshot]);

  const loadWorkspace = React.useCallback(async (rootPath: string) => {
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
  }, [resetDocumentState]);

  const saveCurrentDocumentNow = React.useCallback(
    async (envelopeOverride?: PlateDocumentEnvelope | null) => {
      if (!snapshot || !currentDocument || currentDocument.kind !== 'document') {
        return;
      }

      const envelope = envelopeOverride ?? draftEnvelope;

      if (!envelope) {
        return;
      }

      clearPendingSave();

      const serialized = stringifyEnvelope(envelope);

      if (serialized === lastSavedEnvelopeRef.current) {
        setSaveState('saved');
        return;
      }

      setSaveState('saving');
      setSaveError(null);

      try {
        const meta = await savePlateDocument(
          snapshot.rootPath,
          currentDocument.absolutePath,
          envelope,
        );

        lastSavedEnvelopeRef.current = serialized;
        setDocumentContent((previous) =>
          previous
            ? {
                ...previous,
                envelope,
                modifiedAt: meta.modifiedAt,
              }
            : previous,
        );
        setDraftEnvelope(envelope);
        setLastSavedAt(meta.modifiedAt);
        setSaveState('saved');
      } catch (saveDocumentError) {
        setSaveState('error');
        setSaveError(
          saveDocumentError instanceof Error
            ? saveDocumentError.message
            : '无法保存文档内容',
        );
      }
    },
    [clearPendingSave, currentDocument, draftEnvelope, snapshot],
  );

  const openDocument = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'document') {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftEnvelope);
      }

      clearPendingSave();
      setCurrentDocument(node);
      setDocumentContent(null);
      setDraftEnvelope(null);
      setDocumentLoadState('loading');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);

      try {
        const content = await readPlateDocument(snapshot.rootPath, node.absolutePath);

        setDocumentContent(content);
        setDraftEnvelope(content.envelope);
        lastSavedEnvelopeRef.current = stringifyEnvelope(content.envelope);
        setDocumentVersion((version) => version + 1);
        setDocumentLoadState('loaded');
        setSaveState('saved');
        setLastSavedAt(content.modifiedAt);
      } catch (documentError) {
        setDocumentContent(null);
        setDraftEnvelope(null);
        lastSavedEnvelopeRef.current = '';
        setDocumentLoadState('error');
        setDocumentLoadError(
          documentError instanceof Error
            ? documentError.message
            : '无法读取文档内容',
        );
      }
    },
    [
      clearPendingSave,
      draftEnvelope,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

  const retryCurrentDocument = React.useCallback(() => {
    if (currentDocument) {
      void openDocument(currentDocument);
    }
  }, [currentDocument, openDocument]);

  const updateDocumentValue = React.useCallback(
    (nextValue: PlateDocumentEnvelope['content']) => {
      if (!draftEnvelope) {
        return;
      }

      const nextEnvelope = withUpdatedContent(draftEnvelope, nextValue);
      const nextSerialized = stringifyEnvelope(nextEnvelope);

      setDraftEnvelope(nextEnvelope);

      if (nextSerialized === lastSavedEnvelopeRef.current) {
        clearPendingSave();
        setSaveState('saved');
        setSaveError(null);
        return;
      }

      setSaveState('dirty');
      setSaveError(null);
      clearPendingSave();
      pendingSaveTimerRef.current = setTimeout(() => {
        void saveCurrentDocumentNow(nextEnvelope);
      }, 800);
    },
    [clearPendingSave, draftEnvelope, saveCurrentDocumentNow],
  );

  const createDocument = React.useCallback(
    async (parentPath = '') => {
      if (!snapshot) {
        return null;
      }

      const created = await createPlateDocument(
        snapshot.rootPath,
        parentPath,
        '未命名文档',
      );
      setPendingRenameNodePath(created.node.absolutePath);
      await refreshWorkspaceTree();
      await openDocument(created.node);

      return created.node;
    },
    [openDocument, refreshWorkspaceTree, snapshot],
  );

  const createDirectory = React.useCallback(
    async (parentPath = '') => {
      if (!snapshot) {
        return null;
      }

      const created = await createWorkspaceDirectory(
        snapshot.rootPath,
        parentPath,
        '未命名目录',
      );
      setPendingRenameNodePath(created.absolutePath);
      await refreshWorkspaceTree();

      return created;
    },
    [refreshWorkspaceTree, snapshot],
  );

  const renameNode = React.useCallback(
    async (node: WorkspaceNode, newName: string) => {
      if (!snapshot) {
        return null;
      }

      if (
        currentDocument?.absolutePath === node.absolutePath &&
        (saveState === 'dirty' || saveState === 'saving')
      ) {
        await saveCurrentDocumentNow(draftEnvelope);
      }

      const renamed = await renameWorkspaceNode(
        snapshot.rootPath,
        node.absolutePath,
        newName,
      );
      await refreshWorkspaceTree();

      if (currentDocument?.absolutePath === node.absolutePath) {
        if (renamed.kind === 'document') {
          await openDocument(renamed);
        } else {
          resetDocumentState();
        }
      }

      return renamed;
    },
    [
      currentDocument?.absolutePath,
      draftEnvelope,
      openDocument,
      refreshWorkspaceTree,
      resetDocumentState,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

  const deleteNode = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot) {
        return;
      }

      await deleteWorkspaceNode(snapshot.rootPath, node.absolutePath);
      await refreshWorkspaceTree();

      if (
        currentDocument?.absolutePath === node.absolutePath ||
        (node.kind === 'directory' &&
          currentDocument?.absolutePath.startsWith(`${node.absolutePath}/`))
      ) {
        resetDocumentState();
      }
    },
    [
      currentDocument?.absolutePath,
      refreshWorkspaceTree,
      resetDocumentState,
      snapshot,
    ],
  );

  const importMarkdownDocuments = React.useCallback(
    async (targetDir = '') => {
      if (!snapshot) {
        return;
      }

      const selected = await selectMarkdownSourceFiles();

      if (selected.length === 0) {
        return;
      }

      const sourceFiles = await readMarkdownSourceFiles(selected);
      const { extractMarkdownImportTitle, markdownToPlateValue } = await import(
        '@/components/editor/markdown-import'
      );
      const documents = sourceFiles.map((source) => ({
        title: extractMarkdownImportTitle(source.content, source.fileName),
        sourceFileName: source.fileName,
        content: markdownToPlateValue(source.content),
      }));
      const result = await createImportedPlateDocuments(
        snapshot.rootPath,
        targetDir,
        documents,
      );
      await refreshWorkspaceTree();

      if (result.created[0]) {
        await openDocument(result.created[0].node);
      }
    },
    [openDocument, refreshWorkspaceTree, snapshot],
  );

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

  const createWorkspace = React.useCallback(
    async (parentPath: string, workspaceName: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const nextSnapshot = await createWorkspaceRoot(parentPath, workspaceName);

        setSnapshot(nextSnapshot);
        resetDocumentState();
        saveRecentWorkspacePath(nextSnapshot.rootPath);
        setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
      } catch (createWorkspaceError) {
        setError({
          message:
            getWorkspaceErrorMessage(
              createWorkspaceError,
              '无法创建工作区，请检查名称和所在目录。',
            ),
          recoverable: true,
        });
        throw createWorkspaceError;
      } finally {
        setIsLoading(false);
      }
    },
    [resetDocumentState],
  );

  const chooseWorkspaceParentDirectory = React.useCallback(async () => {
    return selectWorkspaceParentDirectory();
  }, []);

  const clearPendingRenameNode = React.useCallback(() => {
    setPendingRenameNodePath(null);
  }, []);

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

  React.useEffect(() => {
    return () => {
      clearPendingSave();
    };
  }, [clearPendingSave]);

  return {
    chooseWorkspaceParentDirectory,
    createDirectory,
    createDocument,
    createWorkspace,
    currentDocument,
    documentContent,
    documentLoadError,
    documentLoadState,
    documentVersion,
    draftEnvelope,
    deleteNode,
    error,
    importMarkdownDocuments,
    isAiPanelCollapsed,
    isLoading,
    isSidebarCollapsed,
    lastSavedAt,
    openDocument,
    openWorkspace,
    pendingRenameNodePath,
    retryCurrentDocument,
    renameNode,
    saveCurrentDocumentNow,
    saveError,
    saveState,
    searchQuery,
    searchResults: snapshot ? searchWorkspace(snapshot.nodes, searchQuery) : [],
    setAiPanelCollapsed,
    setCurrentDocument,
    setSearchQuery,
    setSidebarCollapsed,
    clearPendingRenameNode,
    snapshot,
    switchWorkspace: loadWorkspace,
    updateDocumentValue,
    workspaceHistory,
    removeWorkspace,
  };
}

function getWorkspaceErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

function stringifyEnvelope(envelope: PlateDocumentEnvelope | null) {
  return envelope ? JSON.stringify(envelope) : '';
}

function withUpdatedContent(
  envelope: PlateDocumentEnvelope,
  content: PlateDocumentEnvelope['content'],
): PlateDocumentEnvelope {
  return {
    ...envelope,
    content,
    updatedAt: new Date().toISOString(),
  };
}

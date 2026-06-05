'use client';

import * as React from 'react';

import {
  createImportedPlateDocuments,
  createMarkdownDocument,
  createWorkspaceRoot,
  createWorkspaceDirectory,
  deleteWorkspaceNode,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  moveWorkspaceNode,
  recordWorkspaceHistory,
  readImportSourceFiles,
  removeWorkspaceHistory,
  readMarkdownSourceFiles,
  readMarkdownDocument,
  readPlateDocument,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  saveMarkdownDocument,
  selectExportFilePath,
  selectImportSourceFiles,
  selectMarkdownSourceFiles,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
  writeExportFile,
} from './workspace-api';
import {
  markdownToPlateValue,
  parseMarkdownDocument,
  plateValueToMarkdown,
  serializeMarkdownDocument,
} from '@/components/editor/markdown-document';
import { createExportArchiveBlob } from './workspace-export-archive';
import { searchWorkspace } from './workspace-tree';
import type {
  DocumentLoadState,
  DocumentSaveState,
  MarkdownDocumentContent,
  MarkdownDocumentDraft,
  RightPanelMode,
  WorkspaceLoadError,
  WorkspaceHistoryItem,
  WorkspaceExportFormat,
  WorkspaceImportFormat,
  WorkspaceMoveRequest,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';

export function useWorkspace(initialSnapshot?: WorkspaceSnapshot | null) {
  const [snapshot, setSnapshot] = React.useState<WorkspaceSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [currentDocument, setCurrentDocument] =
    React.useState<WorkspaceNode | null>(null);
  const [currentDirectoryPath, setCurrentDirectoryPath] = React.useState<
    string | null
  >(null);
  const [documentContent, setDocumentContent] =
    React.useState<MarkdownDocumentContent | null>(null);
  const [draftDocument, setDraftDocument] =
    React.useState<MarkdownDocumentDraft | null>(null);
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
  const [rightPanelMode, setRightPanelMode] =
    React.useState<RightPanelMode>(null);
  const [storedWorkspaceHistory, setStoredWorkspaceHistory] = React.useState<
    WorkspaceHistoryItem[]
  >(() => getWorkspaceHistory());

  const currentDirectory = React.useMemo(() => {
    if (!snapshot || !currentDirectoryPath) {
      return null;
    }

    const node = findNodeByAbsolutePath(snapshot.nodes, currentDirectoryPath);

    return node?.kind === 'directory' ? node : null;
  }, [currentDirectoryPath, snapshot]);

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
    setCurrentDirectoryPath(null);
    setDocumentContent(null);
    setDraftDocument(null);
    setDocumentLoadState('idle');
    setDocumentLoadError(null);
    setDocumentVersion(0);
    setSaveState('idle');
    setSaveError(null);
    setLastSavedAt(null);
    setPendingRenameNodePath(null);
    lastSavedMarkdownRef.current = '';
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
    async (draftOverride?: MarkdownDocumentDraft | null) => {
      if (!snapshot || !currentDocument || currentDocument.kind !== 'document') {
        return;
      }

      const draft = draftOverride ?? draftDocument;

      if (!draft) {
        return;
      }

      clearPendingSave();

      if (draft.markdown === lastSavedMarkdownRef.current) {
        setSaveState('saved');
        return;
      }

      setSaveState('saving');
      setSaveError(null);

      try {
        const meta = await saveMarkdownDocument(
          snapshot.rootPath,
          currentDocument.absolutePath,
          draft.markdown,
          documentContent?.modifiedAt ?? null,
        );

        lastSavedMarkdownRef.current = draft.markdown;
        setDocumentContent({
          content: draft.markdown,
          modifiedAt: meta.modifiedAt,
          path: meta.path,
        });
        setDraftDocument({
          ...draft,
          modifiedAt: meta.modifiedAt,
          path: meta.path,
        });
        setLastSavedAt(meta.modifiedAt);
        setSaveState('saved');
      } catch (saveDocumentError) {
        setSaveState('error');
        setSaveError(
          saveDocumentError instanceof Error
            ? saveDocumentError.message
            : '无法保存 Markdown 文档内容',
        );
      }
    },
    [clearPendingSave, currentDocument, documentContent, draftDocument, snapshot],
  );

  const openDocument = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'document') {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      clearPendingSave();
      setCurrentDirectoryPath(null);
      setCurrentDocument(node);
      setDocumentContent(null);
      setDraftDocument(null);
      setDocumentLoadState('loading');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);

      try {
        const content = await readMarkdownDocument(
          snapshot.rootPath,
          node.absolutePath,
        );
        const draft = createMarkdownDraft(content, node.name);

        setDocumentContent(content);
        setDraftDocument(draft);
        lastSavedMarkdownRef.current = content.content;
        setDocumentVersion((version) => version + 1);
        setDocumentLoadState('loaded');
        setSaveState('saved');
        setLastSavedAt(content.modifiedAt);
      } catch (documentError) {
        setDocumentContent(null);
        setDraftDocument(null);
        lastSavedMarkdownRef.current = '';
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
      draftDocument,
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

  const selectDirectory = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'directory') {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      clearPendingSave();
      setCurrentDocument(null);
      setCurrentDirectoryPath(node.absolutePath);
      setDocumentContent(null);
      setDraftDocument(null);
      setDocumentLoadState('idle');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);
      setLastSavedAt(null);
      lastSavedMarkdownRef.current = '';
    },
    [
      clearPendingSave,
      draftDocument,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

  const updateDocumentValue = React.useCallback(
    (nextValue: MarkdownDocumentDraft['value']) => {
      if (!draftDocument) {
        return;
      }

      const nextDraft = withUpdatedMarkdownValue(draftDocument, nextValue);

      setDraftDocument(nextDraft);

      if (nextDraft.markdown === lastSavedMarkdownRef.current) {
        clearPendingSave();
        setSaveState('saved');
        setSaveError(null);
        return;
      }

      setSaveState('dirty');
      setSaveError(null);
      clearPendingSave();
      pendingSaveTimerRef.current = setTimeout(() => {
        void saveCurrentDocumentNow(nextDraft);
      }, 800);
    },
    [clearPendingSave, draftDocument, saveCurrentDocumentNow],
  );

  const createDocument = React.useCallback(
    async (parentPath = '') => {
      if (!snapshot) {
        return null;
      }

      const created = await createMarkdownDocument(
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
        await saveCurrentDocumentNow(draftDocument);
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

      if (currentDirectoryPath === node.absolutePath) {
        if (renamed.kind === 'directory') {
          setCurrentDirectoryPath(renamed.absolutePath);
        } else {
          setCurrentDirectoryPath(null);
        }
      }

      return renamed;
    },
    [
      currentDocument?.absolutePath,
      currentDirectoryPath,
      draftDocument,
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

      if (
        currentDirectoryPath === node.absolutePath ||
        (node.kind === 'directory' &&
          currentDirectoryPath?.startsWith(`${node.absolutePath}/`))
      ) {
        setCurrentDirectoryPath(null);
      }
    },
    [
      currentDocument?.absolutePath,
      currentDirectoryPath,
      refreshWorkspaceTree,
      resetDocumentState,
      snapshot,
    ],
  );

  const moveNode = React.useCallback(
    async (request: WorkspaceMoveRequest) => {
      if (!snapshot) {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      const movedSnapshot = await moveWorkspaceNode(snapshot.rootPath, request);
      setSnapshot(movedSnapshot);

      if (currentDirectoryPath) {
        const movedDirectoryPath = getMovedNodePath(
          currentDirectoryPath,
          request,
        );
        const movedDirectory = findNodeByAbsolutePath(
          movedSnapshot.nodes,
          movedDirectoryPath,
        );

        setCurrentDirectoryPath(
          movedDirectory?.kind === 'directory'
            ? movedDirectory.absolutePath
            : null,
        );
      }

      if (!currentDocument) {
        return;
      }

      const movedDocumentPath = getMovedNodePath(
        currentDocument.absolutePath,
        request,
      );
      const movedDocument = findNodeByAbsolutePath(
        movedSnapshot.nodes,
        movedDocumentPath,
      );

      if (movedDocument?.kind === 'document') {
        setCurrentDocument(movedDocument);
        return;
      }

      if (!findNodeByAbsolutePath(movedSnapshot.nodes, currentDocument.absolutePath)) {
        resetDocumentState();
      }
    },
    [
      currentDocument,
      currentDirectoryPath,
      draftDocument,
      resetDocumentState,
      saveCurrentDocumentNow,
      saveState,
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

  const importDocuments = React.useCallback(
    async (targetDir: string, format: WorkspaceImportFormat) => {
      if (!snapshot) {
        return;
      }

      const selected = await selectImportSourceFiles(format);

      if (selected.length === 0) {
        return;
      }

      const sourceFiles = await readImportSourceFiles(selected, format);
      const { convertImportSourcesToPlateDocuments } = await import(
        './workspace-document-transfer'
      );
      const documents = await convertImportSourcesToPlateDocuments(
        sourceFiles,
        format,
      );
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

  const exportNode = React.useCallback(
    async (node: WorkspaceNode, format: WorkspaceExportFormat) => {
      if (!snapshot) {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      const transfer = await import('./workspace-document-transfer');

      if (node.kind === 'document') {
        const documentContent = await readPlateDocument(
          snapshot.rootPath,
          node.absolutePath,
        );
        const blob = await transfer.exportPlateValueAsBlob(
          documentContent.envelope.content,
          format,
          { workspaceRootPath: snapshot.rootPath },
        );
        const defaultPath = transfer.createExportFileName(
          node,
          format,
          documentContent.envelope,
        );
        const targetPath = await selectExportFilePath(format, defaultPath);

        if (!targetPath) {
          return;
        }

        await writeExportFile(targetPath, await transfer.blobToBase64(blob));
        return;
      }

      const entries = await transfer.buildExportArchiveEntries({
        format,
        node,
        workspaceRootPath: snapshot.rootPath,
        readDocument: async (documentNode) => {
          const documentContent = await readPlateDocument(
            snapshot.rootPath,
            documentNode.absolutePath,
          );

          return documentContent.envelope;
        },
      });
      const targetPath = await selectExportFilePath(
        'zip',
        transfer.createArchiveFileName(node),
      );

      if (!targetPath) {
        return;
      }

      const blob = await createExportArchiveBlob(entries);
      await writeExportFile(targetPath, await transfer.blobToBase64(blob));
    },
    [
      draftDocument,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
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
    currentDirectory,
    currentDocument,
    documentContent,
    documentLoadError,
    documentLoadState,
    documentVersion,
    draftDocument,
    deleteNode,
    error,
    exportNode,
    importDocuments,
    importMarkdownDocuments,
    isLoading,
    isSidebarCollapsed,
    lastSavedAt,
    moveNode,
    openDocument,
    selectDirectory,
    openWorkspace,
    pendingRenameNodePath,
    retryCurrentDocument,
    renameNode,
    rightPanelMode,
    saveCurrentDocumentNow,
    saveError,
    saveState,
    searchQuery,
    searchResults: snapshot ? searchWorkspace(snapshot.nodes, searchQuery) : [],
    setCurrentDocument,
    setRightPanelMode,
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

function createMarkdownDraft(
  content: MarkdownDocumentContent,
  fileName: string,
): MarkdownDocumentDraft {
  const parsed = parseMarkdownDocument(content.content, fileName);

  return {
    body: parsed.body,
    markdown: content.content,
    metadata: parsed.metadata,
    modifiedAt: content.modifiedAt,
    path: content.path,
    value: markdownToPlateValue(parsed.body),
  };
}

function withUpdatedMarkdownValue(
  draft: MarkdownDocumentDraft,
  value: MarkdownDocumentDraft['value'],
): MarkdownDocumentDraft {
  const body = plateValueToMarkdown(value);
  const metadata = {
    ...draft.metadata,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...draft,
    body,
    markdown: serializeMarkdownDocument({ body, metadata }),
    metadata,
    value,
  };
}

function findNodeByAbsolutePath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.absolutePath === absolutePath) {
      return node;
    }

    const child = node.children
      ? findNodeByAbsolutePath(node.children, absolutePath)
      : null;

    if (child) {
      return child;
    }
  }

  return null;
}

function getMovedNodePath(
  currentPath: string,
  request: WorkspaceMoveRequest,
) {
  if (
    currentPath !== request.nodePath &&
    !currentPath.startsWith(`${request.nodePath}/`)
  ) {
    return currentPath;
  }

  const targetParentPath =
    request.position === 'inside'
      ? request.targetPath
      : getParentPath(request.targetPath);
  const movedNodeName = getBaseName(request.nodePath);
  const descendantSuffix = currentPath.slice(request.nodePath.length);

  return joinPath(targetParentPath, `${movedNodeName}${descendantSuffix}`);
}

function getParentPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : '';
}

function getBaseName(path: string) {
  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  return lastSlashIndex >= 0
    ? normalizedPath.slice(lastSlashIndex + 1)
    : normalizedPath;
}

function joinPath(parentPath: string, childPath: string) {
  if (!parentPath) {
    return childPath;
  }

  return `${parentPath.replace(/\/$/, '')}/${childPath.replace(/^\//, '')}`;
}

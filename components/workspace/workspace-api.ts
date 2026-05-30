import type {
  CreatedPlateDocument,
  DeletedWorkspaceNode,
  DocumentContentMeta,
  ImportedPlateDocumentInput,
  ImportedPlateDocumentResult,
  MarkdownSourceFile,
  PlateDocumentContent,
  PlateDocumentEnvelope,
  WorkspaceHistoryItem,
  WorkspaceMetadata,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';

const RECENT_WORKSPACE_KEY = 'refinex-wiki:recent-workspace-path';
const WORKSPACE_HISTORY_KEY = 'refinex-wiki:workspace-history';
const MAX_WORKSPACE_HISTORY = 8;

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getRecentWorkspacePath() {
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    getWorkspaceHistory()[0]?.rootPath ??
    window.localStorage.getItem(RECENT_WORKSPACE_KEY)
  );
}

export function saveRecentWorkspacePath(rootPath: string) {
  window.localStorage.setItem(RECENT_WORKSPACE_KEY, rootPath);
}

export function getWorkspaceHistory(): WorkspaceHistoryItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawHistory = window.localStorage.getItem(WORKSPACE_HISTORY_KEY);

  if (!rawHistory) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isWorkspaceHistoryItem);
  } catch {
    return [];
  }
}

export function recordWorkspaceHistory(snapshot: WorkspaceSnapshot) {
  const nextItem: WorkspaceHistoryItem = {
    rootName: snapshot.rootName,
    rootPath: snapshot.rootPath,
    lastOpenedAt: Date.now(),
  };
  const nextHistory = [
    nextItem,
    ...getWorkspaceHistory().filter(
      (item) => item.rootPath !== snapshot.rootPath,
    ),
  ].slice(0, MAX_WORKSPACE_HISTORY);

  saveWorkspaceHistory(nextHistory);
  saveRecentWorkspacePath(snapshot.rootPath);

  return nextHistory;
}

export function removeWorkspaceHistory(rootPath: string) {
  const nextHistory = getWorkspaceHistory().filter(
    (item) => item.rootPath !== rootPath,
  );

  saveWorkspaceHistory(nextHistory);

  if (nextHistory.length > 0) {
    saveRecentWorkspacePath(nextHistory[0].rootPath);
  } else {
    window.localStorage.removeItem(RECENT_WORKSPACE_KEY);
  }

  return nextHistory;
}

function saveWorkspaceHistory(history: WorkspaceHistoryItem[]) {
  window.localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(history));
}

function isWorkspaceHistoryItem(value: unknown): value is WorkspaceHistoryItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<WorkspaceHistoryItem>;

  return (
    typeof item.rootName === 'string' &&
    typeof item.rootPath === 'string' &&
    typeof item.lastOpenedAt === 'number'
  );
}

export async function selectWorkspaceRoot() {
  if (!isTauriRuntime()) {
    return null;
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: true,
    multiple: false,
  });

  return typeof selected === 'string' ? selected : null;
}

export async function selectWorkspaceParentDirectory() {
  return selectWorkspaceRoot();
}

export async function loadWorkspaceTree(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('load_workspace_tree', { rootPath });
}

export async function createWorkspaceRoot(
  parentPath: string,
  workspaceName: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('create_workspace_root', {
    parentPath,
    workspaceName,
  });
}

export async function ensureWorkspace(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceMetadata>('ensure_workspace', { rootPath });
}

export async function readPlateDocument(
  rootPath: string,
  documentPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<PlateDocumentContent>('read_plate_document', {
    rootPath,
    documentPath,
  });
}

export async function savePlateDocument(
  rootPath: string,
  documentPath: string,
  envelope: PlateDocumentEnvelope,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentContentMeta>('save_plate_document', {
    rootPath,
    documentPath,
    envelope,
  });
}

export async function createPlateDocument(
  rootPath: string,
  parentPath: string,
  title: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CreatedPlateDocument>('create_plate_document', {
    rootPath,
    parentPath,
    title,
  });
}

export async function createWorkspaceDirectory(
  rootPath: string,
  parentPath: string,
  name: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceNode>('create_workspace_directory', {
    rootPath,
    parentPath,
    name,
  });
}

export async function renameWorkspaceNode(
  rootPath: string,
  nodePath: string,
  newName: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceNode>('rename_workspace_node', {
    rootPath,
    nodePath,
    newName,
  });
}

export async function deleteWorkspaceNode(rootPath: string, nodePath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DeletedWorkspaceNode>('delete_workspace_node', {
    rootPath,
    nodePath,
  });
}

export async function readMarkdownSourceFiles(sourcePaths: string[]) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<MarkdownSourceFile[]>('read_markdown_source_files', {
    sourcePaths,
  });
}

export async function createImportedPlateDocuments(
  rootPath: string,
  targetDir: string,
  documents: ImportedPlateDocumentInput[],
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ImportedPlateDocumentResult>('create_imported_plate_documents', {
    rootPath,
    targetDir,
    documents,
  });
}

export async function selectMarkdownSourceFiles() {
  if (!isTauriRuntime()) {
    return [];
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'mdx'],
      },
    ],
    multiple: true,
  });

  if (Array.isArray(selected)) {
    return selected.filter((item): item is string => typeof item === 'string');
  }

  return typeof selected === 'string' ? [selected] : [];
}

export async function setAppWindowTitle(title: string) {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  await getCurrentWindow().setTitle(title);
}

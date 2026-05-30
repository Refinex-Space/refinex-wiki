import type { WorkspaceHistoryItem, WorkspaceSnapshot } from './workspace-types';

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

export async function loadWorkspaceTree(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('load_workspace_tree', { rootPath });
}

export async function setAppWindowTitle(title: string) {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  await getCurrentWindow().setTitle(title);
}

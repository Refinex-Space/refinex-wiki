'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Folder,
  FolderOpen,
  GitBranch,
  GitGraph,
  Minus,
  SquareTerminal,
  Square,
  X,
} from 'lucide-react';

import type { DocumentTocSnapshot } from '@/components/editor/markdown-toc';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { cn } from '@/lib/utils';

import { RightSidePanel, RightToolRail } from './ai-side-panel';
import { DirectoryPage } from './directory-page';
import { EditorPane } from './editor-pane';
import { GitDiffView } from './git-diff-view';
import { GitLogDrawer } from './git-log-drawer';
import { GitPanel } from './git-panel';
import { TerminalPanel, type TerminalTab } from './terminal-panel';
import { useWorkspace } from './use-workspace';
import {
  gitBranches,
  gitCommit,
  gitCommitFileDiff,
  gitCommitFiles,
  gitDeleteFile,
  gitDiff,
  gitInit,
  gitLog,
  gitProbe,
  gitPush,
  gitRevertFile,
  gitStage,
  gitStatus,
  gitUnstage,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  closeAppWindow,
  readAppSettings,
  minimizeAppWindow,
  setAppWindowTitle,
  toggleMaximizeAppWindow,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
} from './workspace-api';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import { WorkspaceSidebar } from './workspace-sidebar';
import { countMarkdownCharacters } from './workspace-document-insights';
import { XtermTerminal } from './xterm-terminal';
import type {
  AppSettings,
  DocumentSaveState,
  GitBranchItem,
  GitCommitEntry,
  GitCommitFile,
  GitDiff,
  GitProbe,
  GitStatus,
  PageWidthMode,
  WorkspaceSnapshot,
} from './workspace-types';

interface WorkspaceLayoutProps {
  initialSnapshot?: WorkspaceSnapshot | null;
}

type LeftPanelMode = 'workspace' | 'git';
type BottomPanelMode = 'git-log' | 'terminal' | null;

const LEFT_PANEL_WIDTH = {
  defaultValue: 280,
  max: 420,
  min: 280,
};

const RIGHT_PANEL_WIDTH = {
  defaultValue: 340,
  max: 520,
  min: 340,
};

const GIT_LOG_DETAIL_WIDTH = {
  defaultValue: 360,
  max: 520,
  min: 280,
};

const GIT_LOG_BRANCH_WIDTH = {
  defaultValue: 260,
  max: 420,
  min: 220,
};

const GIT_LOG_HEIGHT = {
  defaultValue: 420,
  max: 680,
  min: 280,
};

const GIT_LOG_DETAIL_HEIGHT = {
  defaultValue: 220,
  max: 340,
  min: 140,
};

const WORKSPACE_PANEL_WIDTH_STORAGE_KEYS = {
  gitLogBranchWidth: 'refinex-wiki:workspace:git-log-branch-width',
  gitLogDetailHeight: 'refinex-wiki:workspace:git-log-detail-height',
  gitLogDetailWidth: 'refinex-wiki:workspace:git-log-detail-width',
  gitLogHeight: 'refinex-wiki:workspace:git-log-height',
  left: 'refinex-wiki:workspace:left-sidebar-width',
  right: 'refinex-wiki:workspace:right-panel-width',
  terminalHeight: 'refinex-wiki:workspace:terminal-height',
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
  appearance: { pageWidthMode: 'standard' },
};

export function WorkspaceLayout({
  initialSnapshot = null,
}: WorkspaceLayoutProps) {
  const workspace = useWorkspace(initialSnapshot);
  const [leftSidebarWidth, setLeftSidebarWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.left,
    LEFT_PANEL_WIDTH.defaultValue,
    LEFT_PANEL_WIDTH.min,
    LEFT_PANEL_WIDTH.max,
  );
  const [rightPanelWidth, setRightPanelWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.right,
    RIGHT_PANEL_WIDTH.defaultValue,
    RIGHT_PANEL_WIDTH.min,
    RIGHT_PANEL_WIDTH.max,
  );
  const [gitLogDetailWidth, setGitLogDetailWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogDetailWidth,
    GIT_LOG_DETAIL_WIDTH.defaultValue,
    GIT_LOG_DETAIL_WIDTH.min,
    GIT_LOG_DETAIL_WIDTH.max,
  );
  const [gitLogBranchWidth, setGitLogBranchWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogBranchWidth,
    GIT_LOG_BRANCH_WIDTH.defaultValue,
    GIT_LOG_BRANCH_WIDTH.min,
    GIT_LOG_BRANCH_WIDTH.max,
  );
  const [gitLogHeight, setGitLogHeight] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogHeight,
    GIT_LOG_HEIGHT.defaultValue,
    GIT_LOG_HEIGHT.min,
    GIT_LOG_HEIGHT.max,
  );
  const [terminalHeight, setTerminalHeight] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.terminalHeight,
    GIT_LOG_HEIGHT.defaultValue,
    GIT_LOG_HEIGHT.min,
    GIT_LOG_HEIGHT.max,
  );
  const [gitLogDetailHeight, setGitLogDetailHeight] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogDetailHeight,
    GIT_LOG_DETAIL_HEIGHT.defaultValue,
    GIT_LOG_DETAIL_HEIGHT.min,
    GIT_LOG_DETAIL_HEIGHT.max,
  );
  const [tocSnapshotState, setTocSnapshotState] = React.useState<{
    documentPath: string | null;
    snapshot: DocumentTocSnapshot | null;
  }>({ documentPath: null, snapshot: null });
  const documentTitle =
    workspace.currentDocument?.title || workspace.currentDocument?.name;
  const pageTitle = documentTitle ?? workspace.currentDirectory?.name;
  const currentDocumentPath = workspace.currentDocument?.absolutePath ?? null;
  const tocSnapshot =
    tocSnapshotState.documentPath === currentDocumentPath
      ? tocSnapshotState.snapshot
      : null;
  const isWorkspaceEmpty =
    workspace.snapshot !== null && workspace.snapshot.nodes.length === 0;
  const documentCharacterCount = React.useMemo(
    () => countMarkdownCharacters(workspace.draftDocument?.markdown),
    [workspace.draftDocument?.markdown],
  );
  const documentPanelData = React.useMemo<{
    markdown: string;
    metadata: { title: string; createdAt: string; updatedAt: string };
  } | null>(() => {
    if (!workspace.draftDocument) {
      return null;
    }

    return {
      markdown: workspace.draftDocument.markdown,
      metadata: {
        title: workspace.draftDocument.metadata.title,
        createdAt: workspace.draftDocument.metadata.createdAt ?? '',
        updatedAt: workspace.draftDocument.metadata.updatedAt ?? '',
      },
    };
  }, [workspace.draftDocument]);
  const isTauriRuntime = useIsTauriRuntime();
  const isWindowsRuntime = useIsWindowsRuntime();
  const { resolvedTheme } = useTheme();
  const terminalThemeMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const [pageWidthMode, setPageWidthMode] = React.useState<PageWidthMode>(
    DEFAULT_APP_SETTINGS.appearance.pageWidthMode,
  );
  const [leftPanelMode, setLeftPanelMode] =
    React.useState<LeftPanelMode>('workspace');
  const [bottomPanelMode, setBottomPanelMode] =
    React.useState<BottomPanelMode>(null);
  const [gitProbeState, setGitProbeState] = React.useState<GitProbe | null>(
    null,
  );
  const [gitStatusState, setGitStatusState] = React.useState<GitStatus | null>(
    null,
  );
  const [gitDiffState, setGitDiffState] = React.useState<GitDiff | null>(null);
  const [gitDiffLabel, setGitDiffLabel] = React.useState<string | undefined>();
  const [gitSelectedPath, setGitSelectedPath] = React.useState<string | null>(
    null,
  );
  const [gitSelectedPaths, setGitSelectedPaths] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [gitError, setGitError] = React.useState<string | null>(null);
  const [gitLoading, setGitLoading] = React.useState(false);
  const [gitLogBranches, setGitLogBranches] = React.useState<GitBranchItem[]>(
    [],
  );
  const [gitLogCommits, setGitLogCommits] = React.useState<GitCommitEntry[]>(
    [],
  );
  const [gitLogFiles, setGitLogFiles] = React.useState<GitCommitFile[]>([]);
  const [gitLogSelectedHash, setGitLogSelectedHash] = React.useState<string | null>(
    null,
  );
  const [gitLogError, setGitLogError] = React.useState<string | null>(null);
  const [gitLogLoading, setGitLogLoading] = React.useState(false);
  const [terminalTabs, setTerminalTabs] = React.useState<TerminalTab[]>([]);
  const [terminalActiveTabId, setTerminalActiveTabId] =
    React.useState<string | null>(null);
  const [terminalOutputs, setTerminalOutputs] = React.useState<
    Record<string, string>
  >({});
  const [terminalError, setTerminalError] = React.useState<string | null>(null);
  const terminalTabsRef = React.useRef<TerminalTab[]>([]);
  const terminalSpawnInFlightRef = React.useRef(false);
  const workspaceRootPath = workspace.snapshot?.rootPath ?? null;
  const gitLogOpen = bottomPanelMode === 'git-log';
  const terminalOpen = bottomPanelMode === 'terminal';
  const shouldRenderTerminalPanel = terminalOpen || terminalTabs.length > 0;

  React.useEffect(() => {
    void setAppWindowTitle(pageTitle ?? 'Refinex Wiki');
  }, [pageTitle]);

  React.useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  React.useEffect(() => {
    return () => {
      terminalTabsRef.current.forEach((tab) => {
        void terminalKill(tab.id);
      });
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!isTauriRuntime) {
        setPageWidthMode(DEFAULT_APP_SETTINGS.appearance.pageWidthMode);
        return;
      }

      try {
        const settings = await readAppSettings();

        if (!cancelled) {
          setPageWidthMode(settings.appearance.pageWidthMode);
        }
      } catch {
        if (!cancelled) {
          setPageWidthMode(DEFAULT_APP_SETTINGS.appearance.pageWidthMode);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [isTauriRuntime]);

  const handleTocSnapshotChange = React.useCallback(
    (snapshot: DocumentTocSnapshot) => {
      setTocSnapshotState({
        documentPath: currentDocumentPath,
        snapshot,
      });
    },
    [currentDocumentPath],
  );

  const handleLeftSidebarResize = React.useCallback((nextWidth: number) => {
    setLeftSidebarWidth(nextWidth);
  }, [setLeftSidebarWidth]);

  const handleRightPanelResize = React.useCallback((nextWidth: number) => {
    setRightPanelWidth(nextWidth);
  }, [setRightPanelWidth]);

  const refreshGitStatus = React.useCallback(async () => {
    if (!workspaceRootPath) {
      setGitProbeState(null);
      setGitStatusState(null);
      setGitSelectedPaths(new Set());
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      const probe = await gitProbe(workspaceRootPath);
      setGitProbeState(probe);

      if (probe.isRepository) {
        const status = await gitStatus(workspaceRootPath);
        setGitStatusState(status);
        setGitSelectedPaths(new Set(status.changes.map((change) => change.path)));
      } else {
        setGitStatusState(null);
        setGitSelectedPaths(new Set());
        setGitSelectedPath(null);
        setGitDiffState(null);
        setGitDiffLabel(undefined);
      }
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [workspaceRootPath]);

  const handleGitInit = React.useCallback(async () => {
    if (!workspaceRootPath) {
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      const probe = await gitInit(workspaceRootPath);
      setGitProbeState(probe);
      await refreshGitStatus();
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [refreshGitStatus, workspaceRootPath]);

  const handleGitSelectFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitSelectedPath(path);
      setGitLoading(true);
      setGitError(null);

      try {
        setGitDiffState(await gitDiff(workspaceRootPath, path, false));
        setGitDiffLabel(undefined);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [workspaceRootPath],
  );

  const handleGitLogSelectFile = React.useCallback(
    async (file: GitCommitFile) => {
      if (!workspaceRootPath || !gitLogSelectedHash) {
        return;
      }

      setLeftPanelMode('git');
      workspace.setSidebarCollapsed(false);
      setGitSelectedPath(file.path);
      setGitLoading(true);
      setGitError(null);

      try {
        setGitDiffState(
          await gitCommitFileDiff(workspaceRootPath, gitLogSelectedHash, file.path),
        );
        setGitDiffLabel('提交差异');
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [gitLogSelectedHash, workspace, workspaceRootPath],
  );

  const handleGitSelectChange = React.useCallback(
    (path: string, checked: boolean) => {
      setGitSelectedPaths((current) => {
        const next = new Set(current);

        if (checked) {
          next.add(path);
        } else {
          next.delete(path);
        }

        return next;
      });
    },
    [],
  );

  const selectedGitPaths = React.useMemo(
    () => Array.from(gitSelectedPaths),
    [gitSelectedPaths],
  );

  const handleGitStageSelected = React.useCallback(async () => {
    if (!workspaceRootPath || selectedGitPaths.length === 0) {
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      setGitStatusState(await gitStage(workspaceRootPath, selectedGitPaths));
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [selectedGitPaths, workspaceRootPath]);

  const handleGitStageFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitStage(workspaceRootPath, [path]));
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [workspaceRootPath],
  );

  const handleGitUnstageSelected = React.useCallback(async () => {
    if (!workspaceRootPath || selectedGitPaths.length === 0) {
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      setGitStatusState(await gitUnstage(workspaceRootPath, selectedGitPaths));
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [selectedGitPaths, workspaceRootPath]);

  const handleGitCommitSingleFile = React.useCallback((path: string) => {
    setGitSelectedPaths(new Set([path]));
  }, []);

  const handleGitUnstageFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitUnstage(workspaceRootPath, [path]));
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [workspaceRootPath],
  );

  const clearGitFileSelection = React.useCallback((path: string) => {
    setGitSelectedPath((current) => (current === path ? null : current));
    setGitSelectedPaths((current) => {
      const next = new Set(current);

      next.delete(path);

      return next;
    });
    setGitDiffState((current) => (current?.path === path ? null : current));
    setGitDiffLabel(undefined);
  }, []);

  const handleGitRevertFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitRevertFile(workspaceRootPath, path));
        clearGitFileSelection(path);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [clearGitFileSelection, workspaceRootPath],
  );

  const handleGitDeleteFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitDeleteFile(workspaceRootPath, path));
        clearGitFileSelection(path);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [clearGitFileSelection, workspaceRootPath],
  );

  const handleGitCommit = React.useCallback(
    async (message: string) => {
      if (!workspaceRootPath || selectedGitPaths.length === 0) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        await workspace.saveCurrentDocumentNow();
        setGitStatusState(
          await gitCommit(workspaceRootPath, message, selectedGitPaths),
        );
        setGitDiffState(null);
        setGitDiffLabel(undefined);
        setGitSelectedPath(null);
        setGitSelectedPaths(new Set());
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [selectedGitPaths, workspace, workspaceRootPath],
  );

  const handleGitCommitAndPush = React.useCallback(
    async (message: string) => {
      if (!workspaceRootPath || selectedGitPaths.length === 0) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        await workspace.saveCurrentDocumentNow();
        await gitCommit(workspaceRootPath, message, selectedGitPaths);
        setGitStatusState(await gitPush(workspaceRootPath));
        setGitDiffState(null);
        setGitDiffLabel(undefined);
        setGitSelectedPath(null);
        setGitSelectedPaths(new Set());
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [selectedGitPaths, workspace, workspaceRootPath],
  );

  const loadGitLogCommitFiles = React.useCallback(
    async (hash: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLogSelectedHash(hash);

      try {
        setGitLogFiles(await gitCommitFiles(workspaceRootPath, hash));
      } catch (error) {
        setGitLogError(formatUnknownError(error));
        setGitLogFiles([]);
      }
    },
    [workspaceRootPath],
  );

  const refreshGitLog = React.useCallback(async () => {
    if (!workspaceRootPath) {
      setGitLogBranches([]);
      setGitLogCommits([]);
      setGitLogFiles([]);
      setGitLogSelectedHash(null);
      return;
    }

    setGitLogLoading(true);
    setGitLogError(null);

    try {
      const [branches, commits] = await Promise.all([
        gitBranches(workspaceRootPath),
        gitLog(workspaceRootPath),
      ]);
      const selectedHash = commits[0]?.hash ?? null;

      setGitLogBranches(branches);
      setGitLogCommits(commits);
      setGitLogSelectedHash(selectedHash);

      if (selectedHash) {
        setGitLogFiles(await gitCommitFiles(workspaceRootPath, selectedHash));
      } else {
        setGitLogFiles([]);
      }
    } catch (error) {
      setGitLogError(formatUnknownError(error));
    } finally {
      setGitLogLoading(false);
    }
  }, [workspaceRootPath]);

  const createTerminalTab = React.useCallback(async () => {
    if (
      !workspaceRootPath ||
      !isTauriRuntime ||
      terminalSpawnInFlightRef.current
    ) {
      return;
    }

    setTerminalError(null);
    terminalSpawnInFlightRef.current = true;

    try {
      const info = await terminalSpawn(workspaceRootPath, 120, 32);

      setTerminalTabs((current) => [
        ...current,
        {
          cwd: info.cwd,
          id: info.id,
          status: 'running',
          title: current.length === 0 ? '本地' : `本地 ${current.length + 1}`,
        },
      ]);
      setTerminalOutputs((current) => ({ ...current, [info.id]: '' }));
      setTerminalActiveTabId(info.id);
    } catch (error) {
      setTerminalError(formatUnknownError(error));
    } finally {
      terminalSpawnInFlightRef.current = false;
    }
  }, [isTauriRuntime, workspaceRootPath]);

  const handleTerminalCloseTab = React.useCallback(
    (tabId: string) => {
      void terminalKill(tabId).catch((error) =>
        setTerminalError(formatUnknownError(error)),
      );
      setTerminalTabs((current) => current.filter((tab) => tab.id !== tabId));
      setTerminalOutputs((current) => {
        const next = { ...current };

        delete next[tabId];

        return next;
      });
      setTerminalActiveTabId((current) => {
        if (current !== tabId) {
          return current;
        }

        const nextTab = terminalTabs.find((tab) => tab.id !== tabId);

        return nextTab?.id ?? null;
      });
    },
    [terminalTabs],
  );

  const handleTerminalData = React.useCallback(
    (sessionId: string, data: string) => {
      void terminalWrite(sessionId, data).catch((error) =>
        setTerminalError(formatUnknownError(error)),
      );
    },
    [],
  );

  const handleTerminalResize = React.useCallback(
    (sessionId: string, cols: number, rows: number) => {
      void terminalResize(sessionId, cols, rows).catch((error) =>
        setTerminalError(formatUnknownError(error)),
      );
    },
    [],
  );

  React.useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void listenTerminalData(({ sessionId, data }) => {
      setTerminalOutputs((current) => ({
        ...current,
        [sessionId]: `${current[sessionId] ?? ''}${data}`,
      }));
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    });

    void listenTerminalExit(({ sessionId }) => {
      setTerminalTabs((current) =>
        current.map((tab) =>
          tab.id === sessionId ? { ...tab, status: 'exited' } : tab,
        ),
      );
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    });

    void listenTerminalError(({ message }) => {
      setTerminalError(message);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [isTauriRuntime]);

  React.useEffect(() => {
    if (
      !terminalOpen ||
      terminalTabs.length > 0 ||
      !workspaceRootPath ||
      !isTauriRuntime
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void createTerminalTab();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    createTerminalTab,
    isTauriRuntime,
    terminalOpen,
    terminalTabs.length,
    workspaceRootPath,
  ]);

  const openWorkspacePanel = React.useCallback(() => {
    if (leftPanelMode === 'workspace') {
      workspace.setSidebarCollapsed(!workspace.isSidebarCollapsed);
      return;
    }

    setLeftPanelMode('workspace');
    workspace.setSidebarCollapsed(false);
  }, [leftPanelMode, workspace]);

  const openGitPanel = React.useCallback(() => {
    setLeftPanelMode('git');
    workspace.setSidebarCollapsed(false);
    void refreshGitStatus();
  }, [refreshGitStatus, workspace]);

  const toggleGitLogDrawer = React.useCallback(() => {
    setBottomPanelMode((current) => {
      const next: BottomPanelMode = current === 'git-log' ? null : 'git-log';

      if (next === 'git-log') {
        void refreshGitLog();
      }

      return next;
    });
  }, [refreshGitLog]);

  const toggleTerminalPanel = React.useCallback(() => {
    setBottomPanelMode((current) => {
      return current === 'terminal' ? null : 'terminal';
    });
  }, []);

  return (
    <main
      className="flex h-screen w-full flex-col gap-1 overflow-hidden bg-muted/50 p-2 text-foreground"
      data-testid="workspace-shell"
    >
      {isTauriRuntime ? (
        <div
          className={cn(
            '-mx-2 -mt-2 flex h-8 shrink-0 items-center text-xs font-semibold text-muted-foreground',
            isWindowsRuntime
              ? 'bg-muted/50 pl-3 pr-0'
              : 'px-20',
          )}
          data-tauri-drag-region="deep"
          data-testid="workspace-titlebar-drag-region"
        >
          <span className="truncate" data-tauri-drag-region>
            {pageTitle ?? 'Refinex Wiki'}
          </span>
          {isWindowsRuntime ? <WindowsTitlebarControls /> : null}
        </div>
      ) : null}

      <div
        className="flex min-h-0 flex-1 gap-2"
        data-testid="workspace-main-blocks"
      >
        <nav
          className="flex h-full w-8 shrink-0 flex-col items-center gap-2 py-1"
          data-testid="left-tool-rail"
        >
          <button
            aria-label={
              leftPanelMode === 'workspace' && !workspace.isSidebarCollapsed
                ? '折叠目录'
                : '展开目录'
            }
            className={cn(
              'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
              leftPanelMode === 'workspace' &&
                !workspace.isSidebarCollapsed &&
                'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
            )}
            type="button"
            onClick={openWorkspacePanel}
          >
            {workspace.isSidebarCollapsed ? (
              <Folder size={17} />
            ) : (
              <FolderOpen size={17} />
            )}
          </button>
          <button
            aria-label="打开 Git 面板"
            className={cn(
              'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
              leftPanelMode === 'git' &&
                'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
            )}
            type="button"
            onClick={openGitPanel}
          >
            <GitBranch size={17} />
          </button>
          <button
            aria-label={terminalOpen ? '关闭终端' : '打开终端'}
            className={cn(
              'mt-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
              terminalOpen &&
                'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
            )}
            type="button"
            onClick={toggleTerminalPanel}
          >
            <SquareTerminal size={17} />
          </button>
          <button
            aria-label={gitLogOpen ? '关闭 Git 日志' : '打开 Git 日志'}
            className={cn(
              'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
              gitLogOpen &&
                'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
            )}
            type="button"
            onClick={toggleGitLogDrawer}
          >
            <GitGraph size={17} />
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
            {leftPanelMode === 'workspace' ? (
              <WorkspaceSidebar width={leftSidebarWidth} workspace={workspace} />
            ) : workspace.isSidebarCollapsed ? null : (
              <div className="h-full shrink-0" style={{ width: leftSidebarWidth }}>
                <GitPanel
                  error={gitError}
                  isLoading={gitLoading}
                  probe={gitProbeState}
                  selectedPath={gitSelectedPath}
                  selectedPaths={gitSelectedPaths}
                  status={gitStatusState}
                  onCommit={handleGitCommit}
                  onCommitAndPush={handleGitCommitAndPush}
                  onCommitSingleFile={handleGitCommitSingleFile}
                  onDeleteFile={handleGitDeleteFile}
                  onInitRepository={handleGitInit}
                  onRefresh={refreshGitStatus}
                  onRevertFile={handleGitRevertFile}
                  onSelectChange={handleGitSelectChange}
                  onSelectFile={handleGitSelectFile}
                  onStageFile={handleGitStageFile}
                  onStageSelected={handleGitStageSelected}
                  onUnstageFile={handleGitUnstageFile}
                  onUnstageSelected={handleGitUnstageSelected}
                />
              </div>
            )}

            {workspace.isSidebarCollapsed ? null : (
              <WorkspaceResizeHandle
                aria-label="调整左侧目录宽度"
                className="-mx-2"
                direction="left"
                max={LEFT_PANEL_WIDTH.max}
                min={LEFT_PANEL_WIDTH.min}
                value={leftSidebarWidth}
                onResize={handleLeftSidebarResize}
              />
            )}

            <section
              className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border bg-background shadow-sm"
              data-testid="workspace-editor-block"
            >
              {leftPanelMode === 'git' ? (
                <GitDiffView
                  diff={gitDiffState}
                  error={gitError}
                  isLoading={gitLoading && Boolean(gitSelectedPath)}
                  label={gitDiffLabel}
                />
              ) : (
                <EditorPane
                  currentDirectory={workspace.currentDirectory}
                  currentDocument={workspace.currentDocument}
                  directoryContent={
                    workspace.currentDirectory ? (
                      <DirectoryPage
                        key={workspace.currentDirectory.absolutePath}
                        directory={workspace.currentDirectory}
                        workspaceRootPath={workspace.snapshot?.rootPath ?? ''}
                        onOpenDocument={(node) => void workspace.openDocument(node)}
                        onSelectDirectory={(node) =>
                          void workspace.selectDirectory(node)
                        }
                      />
                    ) : null
                  }
                  documentLoadError={workspace.documentLoadError}
                  documentLoadState={workspace.documentLoadState}
                  hasWorkspace={workspace.snapshot !== null}
                  isWorkspaceEmpty={isWorkspaceEmpty}
                  onCreateDirectory={() => void workspace.createDirectory('')}
                  onCreateDocument={() => void workspace.createDocument('')}
                  onImportMarkdown={() =>
                    void workspace.importMarkdownDocuments('')
                  }
                  onOpenWorkspace={workspace.openWorkspace}
                  onRetryDocument={workspace.retryCurrentDocument}
                >
                  {workspace.currentDocument &&
                  workspace.draftDocument &&
                  workspace.documentLoadState === 'loaded' ? (
                    <MarkdownEditor
                      documentKey={`${workspace.documentVersion}`}
                      pageWidthMode={pageWidthMode}
                      markdown={workspace.draftDocument.markdown}
                      workspaceRootPath={workspace.snapshot?.rootPath ?? null}
                      onSaveRequested={() =>
                        void workspace.saveCurrentDocumentNow()
                      }
                      onTocSnapshotChange={handleTocSnapshotChange}
                      onMarkdownChange={workspace.updateMarkdown}
                    />
                  ) : null}
                </EditorPane>
              )}
            </section>

            {workspace.rightPanelMode ? (
              <WorkspaceResizeHandle
                aria-label="调整右侧面板宽度"
                className="-mx-2"
                direction="right"
                max={RIGHT_PANEL_WIDTH.max}
                min={RIGHT_PANEL_WIDTH.min}
                value={rightPanelWidth}
                onResize={handleRightPanelResize}
              />
            ) : null}

            <RightSidePanel
              currentDocument={workspace.currentDocument}
              documentPanelData={documentPanelData}
              mode={workspace.rightPanelMode}
              tocSnapshot={tocSnapshot}
              width={rightPanelWidth}
              workspaceRootPath={workspaceRootPath}
            />
          </div>
          {gitLogOpen ? (
            <WorkspaceHorizontalResizeHandle
              aria-label="调整 Git 日志高度"
              max={GIT_LOG_HEIGHT.max}
              min={GIT_LOG_HEIGHT.min}
              value={gitLogHeight}
              onResize={setGitLogHeight}
            />
          ) : null}
          {terminalOpen ? (
            <WorkspaceHorizontalResizeHandle
              aria-label="调整终端高度"
              max={GIT_LOG_HEIGHT.max}
              min={GIT_LOG_HEIGHT.min}
              value={terminalHeight}
              onResize={setTerminalHeight}
            />
          ) : null}
          <GitLogDrawer
            branches={gitLogBranches}
            branchWidth={gitLogBranchWidth}
            commits={gitLogCommits}
            detailsHeight={gitLogDetailHeight}
            detailsWidth={gitLogDetailWidth}
            error={gitLogError}
            files={gitLogFiles}
            height={gitLogHeight}
            isLoading={gitLogLoading}
            open={gitLogOpen}
            selectedCommitHash={gitLogSelectedHash}
            onClose={() => setBottomPanelMode(null)}
            onRefresh={refreshGitLog}
            onResizeBranchWidth={setGitLogBranchWidth}
            onResizeDetailsHeight={setGitLogDetailHeight}
            onResizeDetailsWidth={setGitLogDetailWidth}
            onSelectCommit={(hash) => void loadGitLogCommitFiles(hash)}
            onSelectFile={(file) => void handleGitLogSelectFile(file)}
          />
          {shouldRenderTerminalPanel ? (
            <div
              className={cn(
                'min-h-0 shrink-0',
                !terminalOpen && 'hidden',
              )}
            >
              <TerminalPanel
                activeTabId={terminalActiveTabId}
                error={terminalError}
                height={terminalHeight}
                isTauriRuntime={isTauriRuntime}
                rootPath={workspaceRootPath}
                tabs={terminalTabs}
                onClose={() => setBottomPanelMode(null)}
                onCloseTab={handleTerminalCloseTab}
                onNewTab={() => void createTerminalTab()}
                onSelectTab={setTerminalActiveTabId}
              >
                {terminalTabs.map((tab) => (
                  <div
                    className={cn(
                      'h-full min-h-0',
                      tab.id !== terminalActiveTabId && 'hidden',
                    )}
                    key={tab.id}
                  >
                    <XtermTerminal
                      isActive={terminalOpen && tab.id === terminalActiveTabId}
                      output={terminalOutputs[tab.id] ?? ''}
                      sessionId={tab.id}
                      themeMode={terminalThemeMode}
                      onData={handleTerminalData}
                      onResize={handleTerminalResize}
                    />
                  </div>
                ))}
              </TerminalPanel>
            </div>
          ) : null}
        </div>
        <RightToolRail
          mode={workspace.rightPanelMode}
          workspaceRootPath={workspace.snapshot?.rootPath ?? null}
          onModeChange={workspace.setRightPanelMode}
          onSettingsSaved={(settings) =>
            setPageWidthMode(settings.appearance.pageWidthMode)
          }
        />
      </div>

      <WorkspaceStatusBar
        characterCount={documentCharacterCount}
        saveError={workspace.saveError}
        saveState={workspace.saveState}
        visible={
          Boolean(workspace.currentDocument) &&
          workspace.documentLoadState === 'loaded'
        }
      />
    </main>
  );
}

function useIsTauriRuntime() {
  return React.useSyncExternalStore(
    subscribeToStaticRuntimeSnapshot,
    getTauriRuntimeSnapshot,
    getServerTauriRuntimeSnapshot,
  );
}

function subscribeToStaticRuntimeSnapshot() {
  return () => {};
}

function getTauriRuntimeSnapshot() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getServerTauriRuntimeSnapshot() {
  return false;
}

function useIsWindowsRuntime() {
  return React.useSyncExternalStore(
    subscribeToStaticRuntimeSnapshot,
    getWindowsRuntimeSnapshot,
    getServerWindowsRuntimeSnapshot,
  );
}

function getWindowsRuntimeSnapshot() {
  if (typeof window === 'undefined') {
    return false;
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    navigatorWithUserAgentData.userAgentData?.platform ??
    navigator.platform ??
    '';

  return /win/i.test(platform) || /windows/i.test(navigator.userAgent);
}

function getServerWindowsRuntimeSnapshot() {
  return false;
}

function WindowsTitlebarControls() {
  return (
    <div
      className="ml-auto flex h-full items-stretch"
      data-testid="windows-titlebar-controls"
    >
      <button
        aria-label="最小化窗口"
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        type="button"
        onClick={() => void minimizeAppWindow()}
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <button
        aria-label="最大化或还原窗口"
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        type="button"
        onClick={() => void toggleMaximizeAppWindow()}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        aria-label="关闭窗口"
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        type="button"
        onClick={() => void closeAppWindow()}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function WorkspaceHorizontalResizeHandle({
  'aria-label': ariaLabel,
  max,
  min,
  value,
  onResize,
}: {
  'aria-label': string;
  max: number;
  min: number;
  value: number;
  onResize: (height: number) => void;
}) {
  const dragStateRef = React.useRef<{
    startHeight: number;
    startPointerY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      onResize(
        clampPanelWidth(
          dragState.startHeight + dragState.startPointerY - event.clientY,
          min,
          max,
        ),
      );
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, max, min, onResize]);

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center outline-none"
      data-dragging={isDragging ? 'true' : 'false'}
      role="separator"
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        dragStateRef.current = {
          startHeight: value,
          startPointerY: event.clientY,
        };
        setIsDragging(true);
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-px w-12 rounded-full bg-border/0 transition-[background-color,height] duration-150',
          'group-hover:h-0.5 group-hover:bg-[#3574f0]/60',
          'group-focus-visible:h-0.5 group-focus-visible:bg-[#3574f0]/70',
          isDragging && 'h-0.5 bg-[#3574f0]/80',
        )}
      />
    </div>
  );
}

function useStoredPanelWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => subscribeStoredPanelWidth(key, onStoreChange),
    [key],
  );
  const getSnapshot = React.useCallback(
    () => readStoredPanelWidth(key, fallback, min, max),
    [fallback, key, max, min],
  );
  const getServerSnapshot = React.useCallback(() => fallback, [fallback]);
  const width = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const setWidth = React.useCallback(
    (nextWidth: number) => {
      const clampedWidth = clampPanelWidth(nextWidth, min, max);

      writeStoredPanelWidth(key, clampedWidth);
      emitStoredPanelWidthChange(key);
    },
    [key, max, min],
  );

  return [width, setWidth] as const;
}

function subscribeStoredPanelWidth(
  key: string,
  onStoreChange: () => void,
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const eventName = getStoredPanelWidthEventName(key);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) {
      onStoreChange();
    }
  };

  window.addEventListener(eventName, onStoreChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(eventName, onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredPanelWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const parsed = Number(window.localStorage.getItem(key));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampPanelWidth(parsed, min, max);
}

function writeStoredPanelWidth(key: string, value: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, String(value));
}

function emitStoredPanelWidthChange(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(getStoredPanelWidthEventName(key)));
}

function getStoredPanelWidthEventName(key: string) {
  return `refinex-wiki:panel-width:${key}`;
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function WorkspaceStatusBar({
  characterCount,
  saveError,
  saveState,
  visible,
}: {
  characterCount: number;
  saveError: string | null;
  saveState: DocumentSaveState;
  visible: boolean;
}) {
  return (
    <div
      className="flex h-5 shrink-0 items-center justify-end px-14 text-xs text-muted-foreground"
      data-testid="workspace-status-bar"
    >
      {visible ? (
        <div className="flex items-center gap-3">
          <span>字数：{characterCount}</span>
          <span>
            {saveState === 'dirty' ? '有未保存更改' : null}
            {saveState === 'saving' ? '保存中...' : null}
            {saveState === 'saved' ? '已保存' : null}
            {saveState === 'error' ? (
              <span className="text-destructive">
                {saveError ?? '保存失败'}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

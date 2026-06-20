'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Airplay,
  Check,
  GitBranch,
  GitGraph,
  Minus,
  Moon,
  Palette,
  Search,
  Sun,
  SquareTerminal,
  Square,
  X,
} from 'lucide-react';

import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import {
  RightSidePanel,
  RightToolRail,
  type DocumentPanelData,
} from './ai-side-panel';
import { DirectoryPage } from './directory-page';
import { DailyNoteCalendar } from './daily-note-calendar';
import {
  createDateFromDailyDate,
  formatDailyDate,
  formatDailyMonth,
  getDailyContentDates,
} from './daily-notes';
import { DocumentTabBar } from './document-tab-bar';
import {
  closeAllTabsInGroup,
  closeOtherTabsInGroup,
  closeTabInGroup,
  closeTabsToLeftInGroup,
  closeTabsToRightInGroup,
  createInitialEditorLayout,
  getActiveEditorGroup,
  getActiveTab,
  openDocumentInGroup,
  selectTabInGroup,
  splitEditorGroup,
  type DocumentEditorLayout,
  type EditorSplitDirection,
} from './document-tabs';
import { EditorPane, type RecentWorkspaceDocument } from './editor-pane';
import { GitDiffView } from './git-diff-view';
import { GitLogDrawer } from './git-log-drawer';
import { GitPanel } from './git-panel';
import { TerminalPanel, type TerminalTab } from './terminal-panel';
import { useWorkspace } from './use-workspace';
import { WorkspaceGlobalSearchDialog } from './workspace-global-search-dialog';
import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  type WorkspaceGlobalSearchResult,
  type WorkspaceSearchDocument,
  type WorkspaceSearchIndex,
} from './workspace-global-search';
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
  listDailyNotesForMonth,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  closeAppWindow,
  readAppSettings,
  recordRecentDocument,
  readMarkdownDocument,
  minimizeAppWindow,
  openDailyNote,
  setAppWindowTitle,
  toggleMaximizeAppWindow,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
} from './workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from './workspace-settings';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import { WorkspaceSidebar } from './workspace-sidebar';
import {
  countMarkdownCharacters,
  countMarkdownLines,
} from './workspace-document-insights';
import { flattenDocuments } from './workspace-tree';
import { XtermTerminal } from './xterm-terminal';
import type {
  DocumentLoadState,
  DocumentSaveState,
  DailyNoteEntry,
  GitBranchItem,
  GitCommitEntry,
  GitCommitFile,
  GitDiff,
  GitProbe,
  GitStatus,
  MarkdownDraft,
  PageWidthMode,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';

interface WorkspaceLayoutProps {
  initialSnapshot?: WorkspaceSnapshot | null;
}

type LeftPanelMode = 'workspace' | 'git';
type BottomPanelMode = 'git-log' | 'terminal' | null;
type GlobalSearchIndexStatus = 'error' | 'idle' | 'indexing' | 'ready';
type ThemeMode = 'dark' | 'light' | 'system';

interface GlobalSearchState {
  index: WorkspaceSearchIndex | null;
  rootPath: string | null;
  status: GlobalSearchIndexStatus;
}

interface DocumentEditorSession {
  documentVersion: number;
  markdown: string;
}

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
  gitLogBranchWidth: 'madora:workspace:git-log-branch-width',
  gitLogDetailHeight: 'madora:workspace:git-log-detail-height',
  gitLogDetailWidth: 'madora:workspace:git-log-detail-width',
  gitLogHeight: 'madora:workspace:git-log-height',
  left: 'madora:workspace:left-sidebar-width',
  right: 'madora:workspace:right-panel-width',
  terminalHeight: 'madora:workspace:terminal-height',
};

const GLOBAL_SEARCH_READ_CONCURRENCY = 6;
const DOUBLE_SHIFT_THRESHOLD_MS = 450;
const RECENT_DOCUMENT_LIMIT = 5;

function toRecentDocument(node: WorkspaceNode): RecentWorkspaceDocument {
  return {
    absolutePath: node.absolutePath,
    relativePath: node.relativePath || node.name,
    title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
  };
}

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
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsInitialSectionId, setSettingsInitialSectionId] =
    React.useState<'appearance' | 'storage' | 'ai'>('appearance');
  const [settingsVersion, setSettingsVersion] = React.useState(0);
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
  const [editorSessions, setEditorSessions] = React.useState<
    Record<string, DocumentEditorSession>
  >({});
  const [activeEditorDocumentPath, setActiveEditorDocumentPath] =
    React.useState<string | null>(null);
  const [documentEditorLayout, setDocumentEditorLayout] =
    React.useState<DocumentEditorLayout>(() => createInitialEditorLayout());
  const [recentDocuments, setRecentDocuments] = React.useState<
    RecentWorkspaceDocument[]
  >([]);
  const [globalSearchOpen, setGlobalSearchOpen] = React.useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = React.useState('');
  const [globalSearchState, setGlobalSearchState] =
    React.useState<GlobalSearchState>({
      index: null,
      rootPath: null,
      status: 'idle',
    });
  const [dailyCalendarMonth, setDailyCalendarMonth] = React.useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDailyDate, setSelectedDailyDate] = React.useState(() =>
    formatDailyDate(new Date()),
  );
  const [dailyNoteEntries, setDailyNoteEntries] = React.useState<
    DailyNoteEntry[]
  >([]);
  const [dailyNotesLoading, setDailyNotesLoading] = React.useState(false);
  const documentTitle =
    workspace.currentDocument?.title || workspace.currentDocument?.name;
  const pageTitle = documentTitle ?? workspace.currentDirectory?.name;
  const currentDocumentPath = workspace.currentDocument?.absolutePath ?? null;
  const workspaceRootPath = workspace.snapshot?.rootPath ?? null;
  const activePanelDocumentPath =
    activeEditorDocumentPath ?? currentDocumentPath;
  const activePanelDocument =
    activePanelDocumentPath && workspace.snapshot
      ? findWorkspaceDocumentByPath(
          workspace.snapshot.nodes,
          activePanelDocumentPath,
        )
      : workspace.currentDocument;
  const hasOpenDocumentTabs = documentEditorLayout.groups.some(
    (group) => group.tabs.length > 0,
  );
  const dailyContentDates = React.useMemo(
    () => getDailyContentDates(dailyNoteEntries),
    [dailyNoteEntries],
  );
  const visibleRecentDocuments = React.useMemo(
    () =>
      recentDocuments.filter((document) =>
        findWorkspaceDocumentByPath(
          workspace.snapshot?.nodes ?? [],
          document.absolutePath,
        ),
      ),
    [recentDocuments, workspace.snapshot?.nodes],
  );
  React.useEffect(() => {
    if (
      !workspace.initialRecentDocumentPaths.length ||
      !workspace.snapshot
    ) {
      return;
    }

    const docs = workspace.initialRecentDocumentPaths
      .map((path) =>
        findWorkspaceDocumentByPath(workspace.snapshot!.nodes, path),
      )
      .filter((node): node is WorkspaceNode => node?.kind === 'document')
      .map(toRecentDocument);

    if (docs.length === 0) {
      return;
    }

    // 用微任务延迟 setState，避免 effect 内同步触发级联渲染
    // author: refinex
    const timer = window.setTimeout(() => {
      setRecentDocuments((current) => {
        // 合并：初始列表在前，补充本次会话内新打开但未持久化的条目
        const seen = new Set(docs.map((doc) => doc.absolutePath));
        const extras = current.filter((doc) => !seen.has(doc.absolutePath));

        return [...docs, ...extras].slice(0, RECENT_DOCUMENT_LIMIT);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [workspace.initialRecentDocumentPaths, workspace.snapshot]);
  const isWorkspaceEmpty =
    workspace.snapshot !== null && workspace.snapshot.nodes.length === 0;
  const documentCharacterCount = React.useMemo(
    () => countMarkdownCharacters(workspace.draftDocument?.markdown),
    [workspace.draftDocument?.markdown],
  );
  const documentLineCount = React.useMemo(
    () => countMarkdownLines(workspace.draftDocument?.markdown),
    [workspace.draftDocument?.markdown],
  );
  const activeGlobalSearchIndex =
    globalSearchState.rootPath === workspaceRootPath
      ? globalSearchState.index
      : null;
  const activeGlobalSearchStatus =
    globalSearchState.rootPath === workspaceRootPath
      ? globalSearchState.status
      : 'idle';
  const globalSearchResults = React.useMemo(
    () =>
      activeGlobalSearchIndex
        ? searchWorkspaceIndex(activeGlobalSearchIndex, globalSearchQuery)
        : [],
    [activeGlobalSearchIndex, globalSearchQuery],
  );
  const documentPanelData = React.useMemo<DocumentPanelData | null>(() => {
    if (!workspace.draftDocument) {
      return null;
    }

    const frontmatter = parseFrontmatter(
      workspace.draftDocument.markdown,
    ).metadata;

    return {
      frontmatter,
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
  const pendingDocumentOpenTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShiftKeyTimeRef = React.useRef(0);
  const gitLogOpen = bottomPanelMode === 'git-log';
  const terminalOpen = bottomPanelMode === 'terminal';

  const openSettingsDialog = React.useCallback(
    (sectionId: 'appearance' | 'storage' | 'ai' = 'appearance') => {
      setSettingsInitialSectionId(sectionId);
      setSettingsOpen(true);
    },
    [],
  );
  const shouldRenderTerminalPanel = terminalOpen || terminalTabs.length > 0;
  const openGlobalSearch = React.useCallback(() => {
    setGlobalSearchOpen(true);
    if (globalSearchState.rootPath !== workspaceRootPath) {
      setGlobalSearchQuery('');
    }
    setGlobalSearchState((current) => {
      if (!workspaceRootPath) {
        return current;
      }

      if (
        current.rootPath === workspaceRootPath &&
        current.status !== 'idle'
      ) {
        return current;
      }

      return {
        index: null,
        rootPath: workspaceRootPath,
        status: 'indexing',
      };
    });
  }, [globalSearchState.rootPath, workspaceRootPath]);
  const loadDailyNotesForMonth = React.useCallback(
    async (month: Date) => {
      if (!workspaceRootPath) {
        setDailyNoteEntries([]);
        return;
      }

      setDailyNotesLoading(true);

      try {
        const result = await listDailyNotesForMonth(
          workspaceRootPath,
          formatDailyMonth(month),
        );
        setDailyNoteEntries(result.entries);
      } catch {
        setDailyNoteEntries([]);
      } finally {
        setDailyNotesLoading(false);
      }
    },
    [workspaceRootPath],
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDailyNotesForMonth(dailyCalendarMonth);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dailyCalendarMonth, loadDailyNotesForMonth]);

  React.useEffect(() => {
    void setAppWindowTitle(pageTitle ?? 'Madora');
  }, [pageTitle]);

  React.useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  React.useEffect(() => {
    return () => {
      if (pendingDocumentOpenTimerRef.current) {
        clearTimeout(pendingDocumentOpenTimerRef.current);
        pendingDocumentOpenTimerRef.current = null;
      }
      terminalTabsRef.current.forEach((tab) => {
        void terminalKill(tab.id);
      });
    };
  }, []);

  React.useEffect(() => {
    if (
      !globalSearchOpen ||
      !isTauriRuntime ||
      !workspace.snapshot ||
      activeGlobalSearchStatus !== 'indexing'
    ) {
      return;
    }

    const snapshot = workspace.snapshot;
    let cancelled = false;

    void readWorkspaceSearchDocuments(snapshot)
      .then((documents) => {
        if (cancelled) {
          return;
        }

        setGlobalSearchState({
          index: buildWorkspaceSearchIndex(documents),
          rootPath: snapshot.rootPath,
          status: 'ready',
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setGlobalSearchState({
          index: null,
          rootPath: snapshot.rootPath,
          status: 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeGlobalSearchStatus,
    globalSearchOpen,
    isTauriRuntime,
    workspace.snapshot,
  ]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && globalSearchOpen) {
        setGlobalSearchOpen(false);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openGlobalSearch();
        return;
      }

      if (event.key !== 'Shift' || event.repeat) {
        return;
      }

      const now = Date.now();

      if (now - lastShiftKeyTimeRef.current <= DOUBLE_SHIFT_THRESHOLD_MS) {
        event.preventDefault();
        lastShiftKeyTimeRef.current = 0;
        openGlobalSearch();
      } else {
        lastShiftKeyTimeRef.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalSearchOpen, openGlobalSearch]);

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
          setPageWidthMode(
            withDefaultAppSettings(settings).appearance.pageWidthMode,
          );
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

  const rememberRecentDocument = React.useCallback(
    (node: WorkspaceNode) => {
      if (node.kind !== 'document') {
        return;
      }

      const entry = toRecentDocument(node);

      setRecentDocuments((current) => [
        entry,
        ...current.filter((item) => item.absolutePath !== entry.absolutePath),
      ].slice(0, RECENT_DOCUMENT_LIMIT));

      if (isTauriRuntime && workspaceRootPath) {
        void recordRecentDocument(workspaceRootPath, node.absolutePath).catch(
          (error) => {
            // 持久化失败不阻断打开流程，仅记录
            // author: refinex
            console.warn('记录最近文档失败', error);
          },
        );
      }
    },
    [isTauriRuntime, workspaceRootPath],
  );

  const rememberRecentDocumentByPath = React.useCallback(
    (documentPath: string) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (node) {
        rememberRecentDocument(node);
      }
    },
    [rememberRecentDocument, workspace.snapshot?.nodes],
  );

  const cacheEditorSession = React.useCallback(
    (documentPath: string, draft: MarkdownDraft) => {
      setEditorSessions((current) => ({
        ...current,
        [documentPath]: {
          documentVersion: draft.modifiedAt,
          markdown: draft.markdown,
        },
      }));
    },
    [],
  );

  const clearPendingDocumentOpen = React.useCallback(() => {
    if (!pendingDocumentOpenTimerRef.current) {
      return;
    }

    clearTimeout(pendingDocumentOpenTimerRef.current);
    pendingDocumentOpenTimerRef.current = null;
  }, []);

  const openDocumentByPath = React.useCallback(
    async (documentPath: string) => {
      if (documentPath === currentDocumentPath) {
        return;
      }

      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (!node) {
        return;
      }

      rememberRecentDocument(node);
      const draft = await workspace.openDocument(node);

      if (draft) {
        cacheEditorSession(node.absolutePath, draft);
      }
    },
    [cacheEditorSession, currentDocumentPath, rememberRecentDocument, workspace],
  );

  const scheduleDocumentOpen = React.useCallback(
    (documentPath: string) => {
      clearPendingDocumentOpen();

      if (documentPath === currentDocumentPath) {
        return;
      }

      pendingDocumentOpenTimerRef.current = setTimeout(() => {
        pendingDocumentOpenTimerRef.current = null;
        void openDocumentByPath(documentPath);
      }, 0);
    },
    [clearPendingDocumentOpen, currentDocumentPath, openDocumentByPath],
  );

  const openDocumentNode = React.useCallback(
    async (node: WorkspaceNode) => {
      if (node.kind !== 'document') {
        return;
      }

      clearPendingDocumentOpen();
      setDocumentEditorLayout((current) => openDocumentInGroup(current, node));
      setActiveEditorDocumentPath(node.absolutePath);
      rememberRecentDocument(node);
      const draft = await workspace.openDocument(node);

      if (draft) {
        cacheEditorSession(node.absolutePath, draft);
      }
    },
    [cacheEditorSession, clearPendingDocumentOpen, rememberRecentDocument, workspace],
  );

  const handleOpenRecentDocument = React.useCallback(
    (documentPath: string) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (!node) {
        return;
      }

      void openDocumentNode(node);
    },
    [openDocumentNode, workspace.snapshot?.nodes],
  );

  const handleSelectGlobalSearchResult = React.useCallback(
    (result: WorkspaceGlobalSearchResult) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        result.document.absolutePath,
      );

      if (!node) {
        return;
      }

      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      void openDocumentNode(node);
    },
    [openDocumentNode, workspace.snapshot?.nodes],
  );

  const handleCreateDocument = React.useCallback(
    async (parentPath = '') => {
      const created = await workspace.createDocument(parentPath);

      if (created) {
        setDocumentEditorLayout((current) =>
          openDocumentInGroup(current, created),
        );
        setActiveEditorDocumentPath(created.absolutePath);
        rememberRecentDocument(created);
      }

      return created;
    },
    [rememberRecentDocument, workspace],
  );

  const handleOpenDailyNote = React.useCallback(
    async (date: string) => {
      if (!workspaceRootPath) {
        return;
      }

      const nextMonth = createDateFromDailyDate(date);

      setSelectedDailyDate(date);
      setDailyCalendarMonth(
        new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1),
      );

      const opened = await openDailyNote(workspaceRootPath, date);

      await workspace.refreshWorkspaceTree();
      await openDocumentNode(opened.node);
      void loadDailyNotesForMonth(nextMonth);
    },
    [loadDailyNotesForMonth, openDocumentNode, workspace, workspaceRootPath],
  );

  const openActiveDocumentForLayout = React.useCallback(
    (layout: DocumentEditorLayout) => {
      const activeTab = getActiveTab(getActiveEditorGroup(layout));

      if (!activeTab) {
        clearPendingDocumentOpen();
        setActiveEditorDocumentPath(null);
        workspace.clearCurrentDocument();
        return;
      }

      setActiveEditorDocumentPath(activeTab.absolutePath);
      rememberRecentDocumentByPath(activeTab.absolutePath);
      scheduleDocumentOpen(activeTab.absolutePath);
    },
    [
      clearPendingDocumentOpen,
      rememberRecentDocumentByPath,
      scheduleDocumentOpen,
      workspace,
    ],
  );

  const handleEditorMarkdownChange = React.useCallback(
    (documentPath: string, markdown: string) => {
      setEditorSessions((current) => {
        const currentSession = current[documentPath];

        return {
          ...current,
          [documentPath]: {
            documentVersion: (currentSession?.documentVersion ?? 0) + 1,
            markdown,
          },
        };
      });

      if (documentPath === currentDocumentPath) {
        rememberRecentDocumentByPath(documentPath);
        workspace.updateMarkdown(markdown);
      }
    },
    [currentDocumentPath, rememberRecentDocumentByPath, workspace],
  );

  const applyDocumentEditorLayout = React.useCallback(
    (nextLayout: DocumentEditorLayout) => {
      setDocumentEditorLayout(nextLayout);
      openActiveDocumentForLayout(nextLayout);
    },
    [openActiveDocumentForLayout],
  );

  const activateDocumentEditorGroup = React.useCallback(
    (groupId: string, tabPath: string) => {
      applyDocumentEditorLayout(
        selectTabInGroup(documentEditorLayout, groupId, tabPath),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleSelectDocumentTab = React.useCallback(
    (groupId: string, tabPath: string) => {
      applyDocumentEditorLayout(
        selectTabInGroup(documentEditorLayout, groupId, tabPath),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseDocumentTab = React.useCallback(
    (groupId: string, tabPath: string) => {
      applyDocumentEditorLayout(
        closeTabInGroup(documentEditorLayout, groupId, tabPath),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseOtherDocumentTabs = React.useCallback(
    (groupId: string, tabPath: string) => {
      applyDocumentEditorLayout(
        closeOtherTabsInGroup(documentEditorLayout, groupId, tabPath),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseAllDocumentTabs = React.useCallback(
    (groupId: string) => {
      applyDocumentEditorLayout(
        closeAllTabsInGroup(documentEditorLayout, groupId),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseDocumentTabsToLeft = React.useCallback(
    (groupId: string, tabPath: string) => {
      applyDocumentEditorLayout(
        closeTabsToLeftInGroup(documentEditorLayout, groupId, tabPath),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseDocumentTabsToRight = React.useCallback(
    (groupId: string, tabPath: string) => {
      applyDocumentEditorLayout(
        closeTabsToRightInGroup(documentEditorLayout, groupId, tabPath),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleSplitDocumentTab = React.useCallback(
    (
      groupId: string,
      tabPath: string,
      direction: EditorSplitDirection,
    ) => {
      applyDocumentEditorLayout(
        splitEditorGroup(documentEditorLayout, groupId, tabPath, direction),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const openGitPanel = React.useCallback(() => {
    if (leftPanelMode === 'git') {
      setLeftPanelMode('workspace');
      workspace.setSidebarCollapsed(false);
      return;
    }

    setLeftPanelMode('git');
    workspace.setSidebarCollapsed(false);
    void refreshGitStatus();
  }, [leftPanelMode, refreshGitStatus, workspace]);

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

  const toggleLeftSidebar = React.useCallback(() => {
    workspace.setSidebarCollapsed(!workspace.isSidebarCollapsed);
  }, [workspace]);

  return (
    <main
      className="relative flex h-screen w-full overflow-hidden bg-sidebar text-foreground antialiased"
      data-chrome="codex-workspace"
      data-testid="workspace-shell"
    >
      {isTauriRuntime && isWindowsRuntime ? (
        <div
          className="absolute right-0 top-0 z-50 flex h-8 shrink-0 items-center bg-transparent"
          data-tauri-drag-region="deep"
          data-testid="workspace-titlebar-drag-region"
        >
          <WindowsTitlebarControls />
        </div>
      ) : null}

      <SidebarChromeToggle
        collapsed={workspace.isSidebarCollapsed}
        onToggle={toggleLeftSidebar}
      />

      <WorkspaceGlobalSearchDialog
        indexStatus={activeGlobalSearchStatus}
        open={globalSearchOpen}
        query={globalSearchQuery}
        results={globalSearchResults}
        onOpenChange={setGlobalSearchOpen}
        onQueryChange={setGlobalSearchQuery}
        onSelectResult={handleSelectGlobalSearchResult}
      />

      <div
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
        data-testid="workspace-main-blocks"
      >
        <div className="flex min-w-0 flex-1 overflow-hidden">
            {leftPanelMode === 'workspace' ? (
              <WorkspaceSidebar
                dailyCalendar={
                  workspace.snapshot ? (
                    <DailyNoteCalendar
                      contentDates={dailyContentDates}
                      isLoading={dailyNotesLoading}
                      month={dailyCalendarMonth}
                      selectedDate={selectedDailyDate}
                      onMonthChange={(month) =>
                        setDailyCalendarMonth(
                          new Date(month.getFullYear(), month.getMonth(), 1),
                        )
                      }
                      onSelectDate={(date) => void handleOpenDailyNote(date)}
                    />
                  ) : null
                }
                width={leftSidebarWidth}
                workspace={workspace}
                onCreateDocument={handleCreateDocument}
                onOpenDailyNote={() =>
                  void handleOpenDailyNote(formatDailyDate(new Date()))
                }
                onOpenSettings={() => openSettingsDialog('appearance')}
                onSelectDocument={openDocumentNode}
              />
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

            {leftPanelMode === 'workspace' || !workspace.isSidebarCollapsed ? (
              <WorkspaceResizeHandle
                aria-label="调整左侧目录宽度"
                className={cn(
                  '-mx-2 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  workspace.isSidebarCollapsed
                    ? 'pointer-events-none opacity-0'
                    : 'opacity-100',
                )}
                direction="left"
                max={LEFT_PANEL_WIDTH.max}
                min={LEFT_PANEL_WIDTH.min}
                value={leftSidebarWidth}
                onResize={handleLeftSidebarResize}
              />
            ) : null}

            <div
              className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_1px_3px_rgba(15,23,42,0.05),0_18px_42px_-28px_rgba(15,23,42,0.45)]"
              data-testid="workspace-editor-column"
            >
              <section
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
                data-chrome="codex-main-surface"
                data-testid="workspace-editor-block"
              >
                <WorkspaceMainHeader
                  gitLogOpen={gitLogOpen}
                  leftPanelMode={leftPanelMode}
                  terminalOpen={terminalOpen}
                  onOpenGlobalSearch={openGlobalSearch}
                  onOpenGitPanel={openGitPanel}
                  onToggleGitLog={toggleGitLogDrawer}
                  onToggleTerminal={toggleTerminalPanel}
                >
                  <RightToolRail
                    mode={workspace.rightPanelMode}
                    orientation="header"
                    settingsInitialSectionId={settingsInitialSectionId}
                    settingsOpen={settingsOpen}
                    showSettingsButton={false}
                    workspaceRootPath={workspace.snapshot?.rootPath ?? null}
                    onModeChange={workspace.setRightPanelMode}
                    onOpenSettings={() => openSettingsDialog('appearance')}
                    onSettingsOpenChange={setSettingsOpen}
                    onSettingsSaved={(settings) => {
                      setPageWidthMode(settings.appearance.pageWidthMode);
                      setSettingsVersion((current) => current + 1);
                    }}
                  />
                </WorkspaceMainHeader>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    {leftPanelMode === 'git' ? (
                      <GitDiffView
                        diff={gitDiffState}
                        error={gitError}
                        isLoading={gitLoading && Boolean(gitSelectedPath)}
                        label={gitDiffLabel}
                      />
                    ) : workspace.currentDocument ||
                      (!workspace.currentDirectory && hasOpenDocumentTabs) ? (
                      <DocumentEditorSurface
                        activeDocumentPath={activePanelDocumentPath}
                        currentDocumentPath={currentDocumentPath}
                        documentEditorLayout={documentEditorLayout}
                        documentLoadError={workspace.documentLoadError}
                        documentLoadState={workspace.documentLoadState}
                        documentVersion={workspace.documentVersion}
                        draftMarkdown={workspace.draftDocument?.markdown ?? null}
                        editorSessions={editorSessions}
                        pageWidthMode={pageWidthMode}
                        workspaceRootPath={workspace.snapshot?.rootPath ?? null}
                        onActivateGroup={activateDocumentEditorGroup}
                        onCloseAllTabs={handleCloseAllDocumentTabs}
                        onCloseOtherTabs={handleCloseOtherDocumentTabs}
                        onCloseTab={handleCloseDocumentTab}
                        onCloseTabsToLeft={handleCloseDocumentTabsToLeft}
                        onCloseTabsToRight={handleCloseDocumentTabsToRight}
                        onMarkdownChange={handleEditorMarkdownChange}
                        onRetryDocument={workspace.retryCurrentDocument}
                        onSaveRequested={() =>
                          void workspace.saveCurrentDocumentNow()
                        }
                        onSelectTab={handleSelectDocumentTab}
                        onSplitTab={handleSplitDocumentTab}
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
                              workspaceRootPath={
                                workspace.snapshot?.rootPath ?? ''
                              }
                              onOpenDocument={openDocumentNode}
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
                        onCreateDocument={() => void handleCreateDocument('')}
                        onImportMarkdown={() =>
                          void workspace.importMarkdownDocuments('')
                        }
                        onOpenRecentDocument={handleOpenRecentDocument}
                        onOpenWorkspace={workspace.openWorkspace}
                        onRetryDocument={workspace.retryCurrentDocument}
                        recentDocuments={visibleRecentDocuments}
                      >
                        {null}
                      </EditorPane>
                    )}
                  </div>

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
                    currentDocument={activePanelDocument}
                    documentPanelData={documentPanelData}
                    mode={workspace.rightPanelMode}
                    settingsVersion={settingsVersion}
                    width={rightPanelWidth}
                    workspaceRootPath={workspaceRootPath}
                    onOpenSettings={() => openSettingsDialog('ai')}
                  />
                </div>

                <WorkspaceStatusBar
                  characterCount={documentCharacterCount}
                  lineCount={documentLineCount}
                  saveError={workspace.saveError}
                  saveState={workspace.saveState}
                  visible={
                    Boolean(workspace.currentDocument) &&
                    workspace.documentLoadState === 'loaded'
                  }
                />
              </section>
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
                    'min-h-0 w-full min-w-0 max-w-full shrink-0 overflow-hidden',
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
        </div>
      </div>
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

function SidebarChromeToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? '展开侧边栏' : '折叠侧边栏';

  return (
    <div
      className="absolute left-[80px] top-0 z-50"
      data-testid="sidebar-chrome-toggle"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={label}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              data-sidebar-toggle-state={collapsed ? 'collapsed' : 'expanded'}
              type="button"
              onClick={onToggle}
            >
              {collapsed ? <SidebarCollapsedIcon /> : <SidebarExpandedIcon />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function SidebarExpandedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-[35px] shrink-0"
      fill="none"
      viewBox="0 0 70 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="22"
        rx="5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        width="24"
        x="20"
        y="21"
      />
      <path
        d="M26 27V37"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SidebarCollapsedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[25px] w-[34px] shrink-0"
      fill="none"
      viewBox="0 0 68 50"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="26"
        rx="5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        width="28"
        x="24"
        y="11"
      />
      <path
        d="M45 18V30"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
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

function WorkspaceMainHeader({
  children,
  gitLogOpen,
  leftPanelMode,
  terminalOpen,
  onOpenGitPanel,
  onOpenGlobalSearch,
  onToggleGitLog,
  onToggleTerminal,
}: {
  children: React.ReactNode;
  gitLogOpen: boolean;
  leftPanelMode: LeftPanelMode;
  terminalOpen: boolean;
  onOpenGitPanel: () => void;
  onOpenGlobalSearch: () => void;
  onToggleGitLog: () => void;
  onToggleTerminal: () => void;
}) {
  return (
    <header
      className="relative flex h-11 shrink-0 items-center gap-1 px-3"
      data-tauri-drag-region="deep"
      data-testid="workspace-main-header"
    >
      <button
        aria-label="搜索文档"
        className="absolute left-1/2 top-1/2 inline-flex h-7 w-[min(420px,34vw)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 text-sm text-muted-foreground shadow-[inset_0_1px_1px_rgba(15,23,42,0.05)] transition-colors hover:bg-accent hover:text-foreground"
        data-chrome="codex-centered-search"
        type="button"
        onClick={onOpenGlobalSearch}
      >
        <Search size={15} strokeWidth={1.75} />
        <span className="hidden truncate lg:inline">搜索</span>
      </button>

      <TooltipProvider>
        <div
          className="z-10 ml-auto flex items-center gap-0.5"
          data-testid="right-header-tools"
        >
          <ThemeQuickMenu />
          <HeaderToolTooltip label="打开 Git 面板">
            <button
              aria-label="打开 Git 面板"
              className={codexHeaderToolButtonClassName(leftPanelMode === 'git')}
              type="button"
              onClick={onOpenGitPanel}
            >
              <GitBranch size={16} strokeWidth={1.75} />
            </button>
          </HeaderToolTooltip>
          <HeaderToolTooltip label={terminalOpen ? '关闭终端' : '打开终端'}>
            <button
              aria-label={terminalOpen ? '关闭终端' : '打开终端'}
              className={codexHeaderToolButtonClassName(terminalOpen)}
              type="button"
              onClick={onToggleTerminal}
            >
              <SquareTerminal size={16} strokeWidth={1.75} />
            </button>
          </HeaderToolTooltip>
          <HeaderToolTooltip label={gitLogOpen ? '关闭 Git 日志' : '打开 Git 日志'}>
            <button
              aria-label={gitLogOpen ? '关闭 Git 日志' : '打开 Git 日志'}
              className={codexHeaderToolButtonClassName(gitLogOpen)}
              type="button"
              onClick={onToggleGitLog}
            >
              <GitGraph size={16} strokeWidth={1.75} />
            </button>
          </HeaderToolTooltip>
          {children}
        </div>
      </TooltipProvider>
    </header>
  );
}

function HeaderToolTooltip({
  children,
  label,
}: {
  children: React.ReactElement;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeQuickMenu() {
  const { setTheme, theme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const selectedTheme = isThemeMode(theme) ? theme : 'system';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <button
              aria-label="切换主题"
              className={codexHeaderToolButtonClassName(open)}
              type="button"
            >
              <Palette size={16} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          切换主题
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={selectedTheme}
          onValueChange={(value) => {
            if (!isThemeMode(value)) {
              return;
            }

            setTheme(value);
            setOpen(false);
          }}
        >
          <ThemeQuickMenuItem icon={<Airplay size={14} />} label="跟随系统" value="system" />
          <ThemeQuickMenuItem icon={<Sun size={14} />} label="亮色" value="light" />
          <ThemeQuickMenuItem icon={<Moon size={14} />} label="暗色" value="dark" />
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeQuickMenuItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: ThemeMode;
}) {
  return (
    <DropdownMenuRadioItem value={value}>
      {icon}
      <span>{label}</span>
    </DropdownMenuRadioItem>
  );
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

function codexHeaderToolButtonClassName(active: boolean) {
  return cn(
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
    active && 'bg-accent text-foreground',
  );
}

function DocumentEditorSurface({
  activeDocumentPath,
  currentDocumentPath,
  documentEditorLayout,
  documentLoadError,
  documentLoadState,
  documentVersion,
  draftMarkdown,
  editorSessions,
  pageWidthMode,
  workspaceRootPath,
  onActivateGroup,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onMarkdownChange,
  onRetryDocument,
  onSaveRequested,
  onSelectTab,
  onSplitTab,
}: {
  activeDocumentPath: string | null;
  currentDocumentPath: string | null;
  documentEditorLayout: DocumentEditorLayout;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  documentVersion: number;
  draftMarkdown: string | null;
  editorSessions: Record<string, DocumentEditorSession>;
  pageWidthMode: PageWidthMode;
  workspaceRootPath: string | null;
  onActivateGroup: (groupId: string, tabPath: string) => void;
  onCloseAllTabs: (groupId: string) => void;
  onCloseOtherTabs: (groupId: string, tabPath: string) => void;
  onCloseTab: (groupId: string, tabPath: string) => void;
  onCloseTabsToLeft: (groupId: string, tabPath: string) => void;
  onCloseTabsToRight: (groupId: string, tabPath: string) => void;
  onMarkdownChange: (documentPath: string, markdown: string) => void;
  onRetryDocument: () => void;
  onSaveRequested: () => void;
  onSelectTab: (groupId: string, tabPath: string) => void;
  onSplitTab: (
    groupId: string,
    tabPath: string,
    direction: EditorSplitDirection,
  ) => void;
}) {
  const hasSplitGroups = documentEditorLayout.groups.length > 1;
  const splitClassName =
    documentEditorLayout.orientation === 'vertical' ? 'flex-col' : 'flex-row';

  return (
    <div
      className={cn('flex h-full min-h-0 min-w-0', splitClassName)}
      data-testid="document-editor-surface"
    >
      {documentEditorLayout.groups.map((group, index) => {
        const activeTab = getActiveTab(group);
        const isActiveGroup = group.id === documentEditorLayout.activeGroupId;
        const activeTabPath = activeTab?.absolutePath ?? null;
        const cachedSession = activeTabPath
          ? editorSessions[activeTabPath] ?? null
          : null;
        const liveSession =
          activeTabPath === currentDocumentPath && draftMarkdown !== null
            ? {
                documentVersion,
                markdown: draftMarkdown,
              }
            : null;
        const editorSession = liveSession ?? cachedSession;

        return (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col bg-background',
              documentEditorLayout.orientation === 'horizontal' &&
                index > 0 &&
                'border-l',
              documentEditorLayout.orientation === 'vertical' &&
                index > 0 &&
                'border-t',
              hasSplitGroups &&
              activeTabPath === activeDocumentPath &&
                'ring-1 ring-inset ring-[#3574f0]/35',
            )}
            data-testid={`document-editor-group-${group.id}`}
            key={group.id}
            onFocusCapture={() => {
              if (activeTabPath) {
                onActivateGroup(group.id, activeTabPath);
              }
            }}
            onClickCapture={() => {
              if (activeTabPath) {
                onActivateGroup(group.id, activeTabPath);
              }
            }}
          >
            <DocumentTabBar
              group={group}
              onCloseAllTabs={onCloseAllTabs}
              onCloseOtherTabs={onCloseOtherTabs}
              onCloseTab={onCloseTab}
              onCloseTabsToLeft={onCloseTabsToLeft}
              onCloseTabsToRight={onCloseTabsToRight}
              onSelectTab={onSelectTab}
              onSplitTab={onSplitTab}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              {renderDocumentEditorGroupContent({
                activeTab,
                currentDocumentPath,
                documentLoadError,
                documentLoadState,
                editorSession,
                groupId: group.id,
                pageWidthMode,
                isActiveGroup,
                workspaceRootPath,
                onMarkdownChange,
                onRetryDocument,
                onSaveRequested,
                onSelectTab,
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderDocumentEditorGroupContent({
  activeTab,
  currentDocumentPath,
  documentLoadError,
  documentLoadState,
  editorSession,
  groupId,
  isActiveGroup,
  pageWidthMode,
  workspaceRootPath,
  onMarkdownChange,
  onRetryDocument,
  onSaveRequested,
  onSelectTab,
}: {
  activeTab: ReturnType<typeof getActiveTab>;
  currentDocumentPath: string | null;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  editorSession: DocumentEditorSession | null;
  groupId: string;
  isActiveGroup: boolean;
  pageWidthMode: PageWidthMode;
  workspaceRootPath: string | null;
  onMarkdownChange: (documentPath: string, markdown: string) => void;
  onRetryDocument: () => void;
  onSaveRequested: () => void;
  onSelectTab: (groupId: string, tabPath: string) => void;
}) {
  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        没有打开的标签页
      </div>
    );
  }

  if (
    isActiveGroup &&
    activeTab.absolutePath === currentDocumentPath &&
    documentLoadState === 'loading' &&
    !editorSession
  ) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在打开文档...
      </div>
    );
  }

  if (
    isActiveGroup &&
    activeTab.absolutePath === currentDocumentPath &&
    documentLoadState === 'error' &&
    !editorSession
  ) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">无法打开文档</h1>
          <p className="text-sm text-muted-foreground">
            {documentLoadError ?? '无法读取文档内容'}
          </p>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            type="button"
            onClick={onRetryDocument}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!editorSession) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <button
          className="max-w-xs truncate rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          type="button"
          onClick={() => onSelectTab(groupId, activeTab.absolutePath)}
        >
          打开 {activeTab.title}
        </button>
      </div>
    );
  }

  return (
    <DocumentEditorInstance
      groupId={groupId}
      documentPath={activeTab.absolutePath}
      editorSession={editorSession}
      pageWidthMode={pageWidthMode}
      workspaceRootPath={workspaceRootPath}
      onMarkdownChange={onMarkdownChange}
      onSaveRequested={onSaveRequested}
    />
  );
}

function DocumentEditorInstance({
  groupId,
  documentPath,
  editorSession,
  pageWidthMode,
  workspaceRootPath,
  onMarkdownChange,
  onSaveRequested,
}: {
  groupId: string;
  documentPath: string;
  editorSession: DocumentEditorSession;
  pageWidthMode: PageWidthMode;
  workspaceRootPath: string | null;
  onMarkdownChange: (documentPath: string, markdown: string) => void;
  onSaveRequested: () => void;
}) {
  const handleMarkdownChange = React.useCallback(
    (markdown: string) => onMarkdownChange(documentPath, markdown),
    [documentPath, onMarkdownChange],
  );

  return (
    <MarkdownEditor
      documentKey={`${documentPath}:${groupId}:${editorSession.documentVersion}`}
      markdown={editorSession.markdown}
      pageWidthMode={pageWidthMode}
      workspaceRootPath={workspaceRootPath}
      onMarkdownChange={handleMarkdownChange}
      onSaveRequested={onSaveRequested}
    />
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

async function readWorkspaceSearchDocuments(
  snapshot: WorkspaceSnapshot,
): Promise<WorkspaceSearchDocument[]> {
  const documents = flattenDocuments(snapshot.nodes);
  const results: WorkspaceSearchDocument[] = [];
  let cursor = 0;

  async function readNextDocument() {
    while (cursor < documents.length) {
      const index = cursor;
      cursor += 1;
      const document = documents[index];

      try {
        const content = await readMarkdownDocument(
          snapshot.rootPath,
          document.absolutePath,
        );

        results[index] = {
          ...document,
          content: content.content,
        };
      } catch {
        results[index] = {
          ...document,
          content: '',
        };
      }
    }
  }

  await Promise.all(
    Array.from({
      length: Math.min(GLOBAL_SEARCH_READ_CONCURRENCY, documents.length),
    }).map(() => readNextDocument()),
  );

  return results.filter(Boolean);
}

function findWorkspaceDocumentByPath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.absolutePath === absolutePath && node.kind === 'document') {
      return node;
    }

    if (node.kind === 'directory') {
      const child = findWorkspaceDocumentByPath(
        node.children ?? [],
        absolutePath,
      );

      if (child) {
        return child;
      }
    }
  }

  return null;
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
  return `madora:panel-width:${key}`;
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function WorkspaceStatusBar({
  characterCount,
  lineCount,
  saveError,
  saveState,
  visible,
}: {
  characterCount: number;
  lineCount: number;
  saveError: string | null;
  saveState: DocumentSaveState;
  visible: boolean;
}) {
  return (
    <div
      className="flex h-7 shrink-0 items-center justify-end gap-4 px-4 text-[12px] text-muted-foreground"
      data-testid="workspace-status-bar"
    >
      {visible ? (
        <>
          <span className="flex items-center gap-1">
            <Check
              className={cn(
                'size-3',
                saveState === 'error'
                  ? 'text-destructive'
                  : saveState === 'dirty'
                    ? 'text-amber-600'
                    : 'text-emerald-600',
              )}
              strokeWidth={2}
            />
            {saveState === 'dirty' ? '有未保存更改' : null}
            {saveState === 'saving' ? '保存中...' : null}
            {saveState === 'saved' ? '已保存' : null}
            {saveState === 'error' ? (
              <span className="text-destructive">
                {saveError ?? '保存失败'}
              </span>
            ) : null}
          </span>
          <span>词数 {characterCount}</span>
          <span>行数 {lineCount}</span>
          <span>字符 {characterCount}</span>
          <span>UTF-8 · Markdown</span>
        </>
      ) : null}
    </div>
  );
}

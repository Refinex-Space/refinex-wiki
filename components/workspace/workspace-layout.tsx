'use client';

import * as React from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import type { Value } from 'platejs';

import type { DocumentTocSnapshot } from '@/components/editor/document-toc-bridge';
import { PlateEditor } from '@/components/editor/plate-editor';
import { cn } from '@/lib/utils';

import { RightSidePanel, RightToolRail } from './ai-side-panel';
import { DirectoryPage } from './directory-page';
import { EditorPane } from './editor-pane';
import { useWorkspace } from './use-workspace';
import { readAppSettings, setAppWindowTitle } from './workspace-api';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import { WorkspaceSidebar } from './workspace-sidebar';
import type {
  AppSettings,
  DocumentSaveState,
  PageWidthMode,
  WorkspaceSnapshot,
} from './workspace-types';

interface WorkspaceLayoutProps {
  initialSnapshot?: WorkspaceSnapshot | null;
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

const WORKSPACE_PANEL_WIDTH_STORAGE_KEYS = {
  left: 'refinex-wiki:workspace:left-sidebar-width',
  right: 'refinex-wiki:workspace:right-panel-width',
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
  const [leftSidebarWidth, setLeftSidebarWidth] = React.useState(() =>
    readStoredPanelWidth(
      WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.left,
      LEFT_PANEL_WIDTH.defaultValue,
      LEFT_PANEL_WIDTH.min,
      LEFT_PANEL_WIDTH.max,
    ),
  );
  const [rightPanelWidth, setRightPanelWidth] = React.useState(() =>
    readStoredPanelWidth(
      WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.right,
      RIGHT_PANEL_WIDTH.defaultValue,
      RIGHT_PANEL_WIDTH.min,
      RIGHT_PANEL_WIDTH.max,
    ),
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
    () => countPlateDocumentCharacters(workspace.draftEnvelope?.content),
    [workspace.draftEnvelope?.content],
  );
  const isTauriRuntime = useIsTauriRuntime();
  const [pageWidthMode, setPageWidthMode] = React.useState<PageWidthMode>(
    DEFAULT_APP_SETTINGS.appearance.pageWidthMode,
  );

  React.useEffect(() => {
    void setAppWindowTitle(pageTitle ?? 'Refinex Wiki');
  }, [pageTitle]);

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
    const clampedWidth = clampPanelWidth(
      nextWidth,
      LEFT_PANEL_WIDTH.min,
      LEFT_PANEL_WIDTH.max,
    );

    setLeftSidebarWidth(clampedWidth);
    writeStoredPanelWidth(WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.left, clampedWidth);
  }, []);

  const handleRightPanelResize = React.useCallback((nextWidth: number) => {
    const clampedWidth = clampPanelWidth(
      nextWidth,
      RIGHT_PANEL_WIDTH.min,
      RIGHT_PANEL_WIDTH.max,
    );

    setRightPanelWidth(clampedWidth);
    writeStoredPanelWidth(
      WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.right,
      clampedWidth,
    );
  }, []);

  return (
    <main
      className="flex h-screen w-full flex-col gap-1 overflow-hidden bg-muted/50 p-2 text-foreground"
      data-testid="workspace-shell"
    >
      {isTauriRuntime ? (
        <div
          className="-mx-2 -mt-2 flex h-8 shrink-0 items-center px-20 text-xs font-semibold text-muted-foreground"
          data-tauri-drag-region="deep"
          data-testid="workspace-titlebar-drag-region"
        >
          <span className="truncate" data-tauri-drag-region>
            {pageTitle ?? 'Refinex Wiki'}
          </span>
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
            aria-label={workspace.isSidebarCollapsed ? '展开目录' : '折叠目录'}
            className={cn(
              'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
              !workspace.isSidebarCollapsed &&
                'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
            )}
            type="button"
            onClick={() =>
              workspace.setSidebarCollapsed(!workspace.isSidebarCollapsed)
            }
          >
            {workspace.isSidebarCollapsed ? (
              <Folder size={17} />
            ) : (
              <FolderOpen size={17} />
            )}
          </button>
        </nav>

        <WorkspaceSidebar width={leftSidebarWidth} workspace={workspace} />

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
          className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-background shadow-sm"
          data-testid="workspace-editor-block"
        >
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
            onImportMarkdown={() => void workspace.importMarkdownDocuments('')}
            onOpenWorkspace={workspace.openWorkspace}
            onRetryDocument={workspace.retryCurrentDocument}
          >
            {workspace.currentDocument &&
            workspace.draftEnvelope &&
            workspace.documentLoadState === 'loaded' ? (
              <PlateEditor
                documentKey={`${workspace.documentContent?.path ?? workspace.currentDocument.absolutePath}:${workspace.documentVersion}`}
                pageWidthMode={pageWidthMode}
                value={workspace.draftEnvelope.content}
                variant="workspace"
                workspaceRootPath={workspace.snapshot?.rootPath ?? null}
                onSaveRequested={() => void workspace.saveCurrentDocumentNow()}
                onTocSnapshotChange={handleTocSnapshotChange}
                onValueChange={workspace.updateDocumentValue}
              />
            ) : null}
          </EditorPane>
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
          mode={workspace.rightPanelMode}
          tocSnapshot={tocSnapshot}
          width={rightPanelWidth}
        />
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

function countPlateDocumentCharacters(value: Value | undefined) {
  if (!value) {
    return 0;
  }

  return value.reduce((count, node) => count + countNodeCharacters(node), 0);
}

function countNodeCharacters(node: unknown): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  const record = node as { children?: unknown; text?: unknown };
  const textCount =
    typeof record.text === 'string'
      ? Array.from(record.text.replace(/\s+/g, '')).length
      : 0;
  const childrenCount = Array.isArray(record.children)
    ? record.children.reduce(
        (count, child) => count + countNodeCharacters(child),
        0,
      )
    : 0;

  return textCount + childrenCount;
}

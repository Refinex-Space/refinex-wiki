'use client';

import * as React from 'react';
import { Folder, FolderOpen } from 'lucide-react';

import { PlateEditor } from '@/components/editor/plate-editor';
import { cn } from '@/lib/utils';

import { AiSidePanel } from './ai-side-panel';
import { EditorPane } from './editor-pane';
import { useWorkspace } from './use-workspace';
import { setAppWindowTitle } from './workspace-api';
import { WorkspaceSidebar } from './workspace-sidebar';
import type { WorkspaceSnapshot } from './workspace-types';

interface WorkspaceLayoutProps {
  initialSnapshot?: WorkspaceSnapshot | null;
}

export function WorkspaceLayout({
  initialSnapshot = null,
}: WorkspaceLayoutProps) {
  const workspace = useWorkspace(initialSnapshot);
  const documentTitle =
    workspace.currentDocument?.title || workspace.currentDocument?.name;

  React.useEffect(() => {
    void setAppWindowTitle(documentTitle ?? 'Refinex Wiki');
  }, [documentTitle]);

  return (
    <main className="relative flex h-screen w-full gap-2 overflow-hidden bg-muted/50 p-2 text-foreground">
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

      <WorkspaceSidebar workspace={workspace} />

      <section className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-background shadow-sm">
        <EditorPane
          currentDocument={workspace.currentDocument}
          hasWorkspace={workspace.snapshot !== null}
          onOpenWorkspace={workspace.openWorkspace}
        >
          {workspace.currentDocument ? (
            <PlateEditor variant="workspace" />
          ) : null}
        </EditorPane>
      </section>

      <AiSidePanel
        currentDocument={workspace.currentDocument}
        isCollapsed={workspace.isAiPanelCollapsed}
        onCollapsedChange={workspace.setAiPanelCollapsed}
      />
    </main>
  );
}

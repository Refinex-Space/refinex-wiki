import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentTree } from './document-tree';
import type { useWorkspace } from './use-workspace';
import { WorkspaceSearch } from './workspace-search';
import { WorkspaceSwitcher } from './workspace-switcher';
import type { WorkspaceNode } from './workspace-types';

interface WorkspaceSidebarProps {
  width: number;
  workspace: ReturnType<typeof useWorkspace>;
  onCreateDocument?: (parentPath: string) => Promise<WorkspaceNode | null> | void;
  onSelectDocument?: (node: WorkspaceNode) => void;
}

export function WorkspaceSidebar({
  width,
  workspace,
  onCreateDocument,
  onSelectDocument,
}: WorkspaceSidebarProps) {
  const createDocument = onCreateDocument ?? workspace.createDocument;
  const selectDocument = onSelectDocument ?? workspace.openDocument;

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm transition-[width]',
        workspace.isSidebarCollapsed ? 'hidden' : null,
      )}
      data-testid="workspace-sidebar"
      style={workspace.isSidebarCollapsed ? undefined : { width }}
    >
      {workspace.isSidebarCollapsed ? null : (
        <>
          <div className="px-3 pb-2 pt-2">
            <WorkspaceSearch
              value={workspace.searchQuery}
              onChange={workspace.setSearchQuery}
            />
          </div>

          <WorkspaceSwitcher
            currentWorkspace={workspace.snapshot}
            history={workspace.workspaceHistory}
            isLoading={workspace.isLoading}
            onChooseWorkspaceParent={workspace.chooseWorkspaceParentDirectory}
            onCreateDirectory={() => void workspace.createDirectory('')}
            onCreateDocument={() => void createDocument('')}
            onCreateWorkspace={workspace.createWorkspace}
            onOpenWorkspace={workspace.openWorkspace}
            onRemoveWorkspace={workspace.removeWorkspace}
            onSwitchWorkspace={workspace.switchWorkspace}
          />

          <div
            className="workspace-tree-scrollarea min-h-0 flex-1 overflow-y-auto px-2"
            data-workspace-tree-scroll-container="true"
          >
            {workspace.snapshot ? (
              <DocumentTree
                currentDirectoryPath={
                  workspace.currentDirectory?.absolutePath ?? null
                }
                currentDocumentPath={
                  workspace.currentDocument?.absolutePath ?? null
                }
                nodes={workspace.snapshot.nodes}
                pendingRenameNodePath={workspace.pendingRenameNodePath}
                searchQuery={workspace.searchQuery}
                onCreateDirectory={workspace.createDirectory}
                onCreateDocument={createDocument}
                onDeleteNode={workspace.deleteNode}
                onImportMarkdown={workspace.importMarkdownDocuments}
                onMoveNode={workspace.moveNode}
                onPendingRenameConsumed={workspace.clearPendingRenameNode}
                onRenameNode={workspace.renameNode}
                onSelectDirectory={workspace.selectDirectory}
                onSelectDocument={selectDocument}
              />
            ) : null}
          </div>

          {workspace.error ? (
            <footer className="border-t p-3 text-xs text-destructive">
              <p>{workspace.error.message}</p>
              <Button
                className="mt-2 h-7 px-2 text-xs"
                type="button"
                variant="outline"
                onClick={workspace.openWorkspace}
              >
                <RefreshCw size={13} />
                重新选择
              </Button>
            </footer>
          ) : null}
        </>
      )}
    </aside>
  );
}

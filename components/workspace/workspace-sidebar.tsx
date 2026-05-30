import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentTree } from './document-tree';
import type { useWorkspace } from './use-workspace';
import { WorkspaceSearch } from './workspace-search';
import { WorkspaceSwitcher } from './workspace-switcher';

interface WorkspaceSidebarProps {
  workspace: ReturnType<typeof useWorkspace>;
}

export function WorkspaceSidebar({ workspace }: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm transition-[width]',
        workspace.isSidebarCollapsed ? 'hidden' : 'w-[280px]',
      )}
    >
      {workspace.isSidebarCollapsed ? null : (
        <>
          <div className="px-3 pb-2 pt-2">
            <WorkspaceSearch
              value={workspace.searchQuery}
              onChange={workspace.setSearchQuery}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {workspace.snapshot ? (
              <DocumentTree
                currentDocumentPath={
                  workspace.currentDocument?.absolutePath ?? null
                }
                nodes={workspace.snapshot.nodes}
                searchQuery={workspace.searchQuery}
                onSelectDocument={workspace.openDocument}
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

          <WorkspaceSwitcher
            currentWorkspace={workspace.snapshot}
            history={workspace.workspaceHistory}
            isLoading={workspace.isLoading}
            onOpenWorkspace={workspace.openWorkspace}
            onRemoveWorkspace={workspace.removeWorkspace}
            onSwitchWorkspace={workspace.switchWorkspace}
          />
        </>
      )}
    </aside>
  );
}

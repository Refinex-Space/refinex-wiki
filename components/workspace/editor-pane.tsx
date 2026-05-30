import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { WorkspaceNode } from './workspace-types';

interface EditorPaneProps {
  children: ReactNode;
  currentDocument: WorkspaceNode | null;
  hasWorkspace: boolean;
  onOpenWorkspace: () => void;
}

export function EditorPane({
  children,
  currentDocument,
  hasWorkspace,
  onOpenWorkspace,
}: EditorPaneProps) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {currentDocument ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm space-y-3">
              <h1 className="text-xl font-semibold">
                {hasWorkspace ? '选择左侧文档开始编辑' : '打开一个 Markdown 工作区'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Refinex Wiki 会展示文件夹中的 .md 和 .mdx 文档。
              </p>
              <Button type="button" onClick={onOpenWorkspace}>
                <FolderOpen size={16} />
                选择文件夹
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

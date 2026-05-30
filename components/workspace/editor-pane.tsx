import type { ReactNode } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type {
  DocumentLoadState,
  DocumentSaveState,
  WorkspaceNode,
} from './workspace-types';

interface EditorPaneProps {
  children: ReactNode;
  currentDocument: WorkspaceNode | null;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  hasWorkspace: boolean;
  onOpenWorkspace: () => void;
  onRetryDocument: () => void;
  saveError: string | null;
  saveState: DocumentSaveState;
}

export function EditorPane({
  children,
  currentDocument,
  documentLoadError,
  documentLoadState,
  hasWorkspace,
  onOpenWorkspace,
  onRetryDocument,
  saveError,
  saveState,
}: EditorPaneProps) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      {currentDocument && documentLoadState === 'loaded' ? (
        <div className="flex h-9 shrink-0 items-center justify-end border-b px-3 text-xs text-muted-foreground">
          {saveState === 'dirty' ? '有未保存更改' : null}
          {saveState === 'saving' ? '保存中...' : null}
          {saveState === 'saved' ? '已保存' : null}
          {saveState === 'error' ? (
            <span className="text-destructive">{saveError ?? '保存失败'}</span>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {currentDocument && documentLoadState === 'loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            正在打开文档...
          </div>
        ) : currentDocument && documentLoadState === 'error' ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm space-y-3">
              <h1 className="text-xl font-semibold">无法打开文档</h1>
              <p className="text-sm text-muted-foreground">
                {documentLoadError ?? '无法读取文档内容'}
              </p>
              <Button type="button" onClick={onRetryDocument}>
                <RefreshCw size={16} />
                重试
              </Button>
            </div>
          </div>
        ) : currentDocument ? (
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

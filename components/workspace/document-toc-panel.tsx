import type {
  DocumentTocItem,
  DocumentTocSnapshot,
} from '@/components/editor/markdown-toc';
import { cn } from '@/lib/utils';

import type { WorkspaceNode } from './workspace-types';

interface DocumentTocPanelProps {
  currentDocument: WorkspaceNode | null;
  snapshot: DocumentTocSnapshot | null;
}

export function DocumentTocPanel({
  currentDocument,
  snapshot,
}: DocumentTocPanelProps) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-10">
        {!currentDocument ? (
          <TocEmptyState title="未选择文档" description="打开文档后显示目录。" />
        ) : !snapshot || snapshot.items.length === 0 ? (
          <TocEmptyState
            title="暂无可显示目录"
            description="目录从二级标题开始显示。"
          />
        ) : (
          <nav aria-label="文档目录" className="grid gap-0.5">
            {snapshot.items.map((item) => (
              <TocItemButton
                key={item.id}
                active={item.id === snapshot.activeContentId}
                item={item}
                onClick={() => snapshot.scrollToHeading(item.id)}
              />
            ))}
          </nav>
        )}
      </div>
    </>
  );
}

function TocItemButton({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: DocumentTocItem;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? 'location' : undefined}
      className={cn(
        'flex min-h-7 w-full items-center truncate border-l-2 pr-2 text-left text-[13px] leading-5 transition-colors',
        tocDepthClassName(item.depth),
        active
          ? 'border-foreground font-medium text-foreground'
          : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
      )}
      title={item.title}
      type="button"
      onClick={onClick}
    >
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function TocEmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function tocDepthClassName(depth: number) {
  if (depth <= 1) {
    return 'pl-3';
  }

  if (depth === 2) {
    return 'pl-6';
  }

  return 'pl-9';
}

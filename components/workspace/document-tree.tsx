'use client';

import * as React from 'react';
import {
  Download,
  FileInput,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { filterWorkspaceNodes } from './workspace-tree';
import type { WorkspaceNode } from './workspace-types';

interface DocumentTreeProps {
  nodes: WorkspaceNode[];
  searchQuery: string;
  currentDocumentPath: string | null;
  pendingRenameNodePath?: string | null;
  onCreateDirectory: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onCreateDocument: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onDeleteNode: (node: WorkspaceNode) => Promise<void> | void;
  onImportMarkdown: (targetDir: string) => void;
  onPendingRenameConsumed?: () => void;
  onRenameNode: (
    node: WorkspaceNode,
    newName: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onSelectDocument: (node: WorkspaceNode) => void;
}

export function DocumentTree({
  nodes,
  searchQuery,
  currentDocumentPath,
  pendingRenameNodePath,
  onCreateDirectory,
  onCreateDocument,
  onDeleteNode,
  onImportMarkdown,
  onPendingRenameConsumed,
  onRenameNode,
  onSelectDocument,
}: DocumentTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkspaceNode | null>(
    null,
  );
  const visibleNodes = filterWorkspaceNodes(nodes, searchQuery);
  const forceExpanded = searchQuery.trim().length > 0;

  const startEditingNode = React.useCallback((node: WorkspaceNode) => {
    setEditingNodeId(node.id);
  }, []);

  const handleCreateDirectory = React.useCallback(
    async (parentPath: string) => {
      const created = await onCreateDirectory(parentPath);

      if (created) {
        setExpanded((previous) => {
          const next = new Set(previous);

          if (parentPath) {
            next.add(parentPath);
          }

          return next;
        });
        startEditingNode(created);
      }
    },
    [onCreateDirectory, startEditingNode],
  );

  const handleCreateDocument = React.useCallback(
    async (parentPath: string) => {
      const created = await onCreateDocument(parentPath);

      if (created) {
        setExpanded((previous) => {
          const next = new Set(previous);

          if (parentPath) {
            next.add(parentPath);
          }

          return next;
        });
        startEditingNode(created);
      }
    },
    [onCreateDocument, startEditingNode],
  );

  const handleRenameNode = React.useCallback(
    async (node: WorkspaceNode, nextName: string) => {
      const normalized = nextName.trim();

      setEditingNodeId(null);

      if (!normalized || normalized === getNodeDisplayName(node)) {
        return;
      }

      await onRenameNode(node, normalized);
    },
    [onRenameNode],
  );

  let treeContent: React.ReactNode;

  if (visibleNodes.length === 0 && nodes.length === 0 && searchQuery.trim().length === 0) {
    treeContent = (
      <div className="flex min-h-[240px] flex-1 items-center px-2 py-5">
          <div className="w-full space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">这个工作区还没有文档</p>
              <p className="text-xs leading-5 text-muted-foreground">
                先创建第一个文档，或用目录组织之后的内容。
              </p>
            </div>
            <div className="grid gap-2">
              <Button
                className="w-full justify-start"
                size="sm"
                type="button"
                onClick={() => void handleCreateDocument('')}
              >
                <FilePlus2 size={14} />
                新建文档
              </Button>
              <Button
                className="w-full justify-start"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void handleCreateDirectory('')}
              >
                <FolderPlus size={14} />
                新建目录
              </Button>
              <Button
                className="w-full justify-start"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => onImportMarkdown('')}
              >
                <FileInput size={14} />
                导入 Markdown
              </Button>
            </div>
          </div>
      </div>
    );
  } else if (visibleNodes.length === 0) {
    treeContent = (
      <p className="px-2 py-6 text-sm text-muted-foreground">
        没有匹配的文档
      </p>
    );
  } else {
    treeContent = (
      <div className="space-y-0.5">
        {visibleNodes.map((node) => (
          <TreeNode
            key={node.id}
            currentDocumentPath={currentDocumentPath}
            editingNodeId={editingNodeId}
            expanded={expanded}
            forceExpanded={forceExpanded}
            level={0}
            node={node}
            pendingRenameNodePath={pendingRenameNodePath}
            onCreateDirectory={handleCreateDirectory}
            onCreateDocument={handleCreateDocument}
            onDeleteRequest={setDeleteTarget}
            onExpandedChange={setExpanded}
            onPendingRenameConsumed={onPendingRenameConsumed}
            onRenameRequest={startEditingNode}
            onRenameSubmit={handleRenameNode}
            onSelectDocument={onSelectDocument}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-full flex-col py-1">
        {treeContent}
      </div>

      <DeleteNodeDialog
        node={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }

          await onDeleteNode(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

function TreeNode({
  currentDocumentPath,
  editingNodeId,
  expanded,
  forceExpanded,
  level,
  node,
  pendingRenameNodePath,
  onCreateDirectory,
  onCreateDocument,
  onDeleteRequest,
  onExpandedChange,
  onPendingRenameConsumed,
  onRenameRequest,
  onRenameSubmit,
  onSelectDocument,
}: TreeNodeProps) {
  const isDirectory = node.kind === 'directory';
  const isExpanded =
    forceExpanded ||
    expanded.has(node.id) ||
    hasDescendantByAbsolutePath(node, pendingRenameNodePath);
  const isCurrent = node.absolutePath === currentDocumentPath;
  const isPendingRename = pendingRenameNodePath === node.absolutePath;
  const isEditing = editingNodeId === node.id || isPendingRename;
  const displayName = getNodeDisplayName(node);
  const visualLevel = isDirectory ? level : Math.max(0, level - 1);
  const rowPaddingLeft = 12 + visualLevel * 14;
  const activatePendingRename = React.useCallback(() => {
    onRenameRequest(node);
    onPendingRenameConsumed?.();
  }, [node, onPendingRenameConsumed, onRenameRequest]);

  const toggleOrSelect = React.useCallback(() => {
    if (isEditing) {
      return;
    }

    if (isDirectory) {
      onExpandedChange((previous) => {
        const next = new Set(previous);

        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }

        return next;
      });
    } else {
      onSelectDocument(node);
    }
  }, [isDirectory, isEditing, node, onExpandedChange, onSelectDocument]);

  return (
    <div className="space-y-0.5" data-testid={`tree-node-${node.id}`}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'group/tree-row flex h-8 w-full items-center rounded-lg text-sm transition-colors hover:bg-muted',
              isCurrent && 'bg-accent',
            )}
          >
            {isEditing ? (
              <div
                className="grid h-full min-w-0 flex-1 grid-cols-[15px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 text-left"
                style={{ paddingLeft: rowPaddingLeft }}
              >
                <DirectoryIcon
                  isDirectory={isDirectory}
                  isExpanded={isExpanded}
                  node={node}
                />
                <RenameInput
                  initialValue={displayName}
                  label={`重命名 ${displayName}`}
                  onActivate={isPendingRename ? activatePendingRename : undefined}
                  onCancel={() => onRenameSubmit(node, displayName)}
                  onSubmit={(nextName) => onRenameSubmit(node, nextName)}
                />
              </div>
            ) : (
              <button
                className="grid h-full min-w-0 flex-1 grid-cols-[15px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 text-left"
                style={{ paddingLeft: rowPaddingLeft }}
                type="button"
                onClick={toggleOrSelect}
              >
                <DirectoryIcon
                  isDirectory={isDirectory}
                  isExpanded={isExpanded}
                  node={node}
                />
                <span className="truncate">{displayName}</span>
              </button>
            )}

            <NodeActionDropdown
              node={node}
              onCreateDirectory={onCreateDirectory}
              onCreateDocument={onCreateDocument}
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={onRenameRequest}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-44"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <NodeContextActions
            node={node}
            onCreateDirectory={onCreateDirectory}
            onCreateDocument={onCreateDocument}
            onDeleteRequest={onDeleteRequest}
            onRenameRequest={onRenameRequest}
          />
        </ContextMenuContent>
      </ContextMenu>

      {isDirectory && isExpanded
        ? node.children?.map((child) => (
            <TreeNode
              key={child.id}
              currentDocumentPath={currentDocumentPath}
              editingNodeId={editingNodeId}
              expanded={expanded}
              forceExpanded={forceExpanded}
              level={level + 1}
              node={child}
              pendingRenameNodePath={pendingRenameNodePath}
              onCreateDirectory={onCreateDirectory}
              onCreateDocument={onCreateDocument}
              onDeleteRequest={onDeleteRequest}
              onExpandedChange={onExpandedChange}
              onPendingRenameConsumed={onPendingRenameConsumed}
              onRenameRequest={onRenameRequest}
              onRenameSubmit={onRenameSubmit}
              onSelectDocument={onSelectDocument}
            />
          ))
        : null}
    </div>
  );
}

interface TreeNodeProps {
  currentDocumentPath: string | null;
  editingNodeId: string | null;
  expanded: Set<string>;
  forceExpanded: boolean;
  level: number;
  node: WorkspaceNode;
  pendingRenameNodePath?: string | null;
  onCreateDirectory: (parentPath: string) => Promise<void>;
  onCreateDocument: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onDeleteRequest: (node: WorkspaceNode) => void;
  onExpandedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onPendingRenameConsumed?: () => void;
  onRenameRequest: (node: WorkspaceNode) => void;
  onRenameSubmit: (node: WorkspaceNode, nextName: string) => Promise<void>;
  onSelectDocument: (node: WorkspaceNode) => void;
}

function DirectoryIcon({
  isDirectory,
  isExpanded,
  node,
}: {
  isDirectory: boolean;
  isExpanded: boolean;
  node: WorkspaceNode;
}) {
  if (!isDirectory) {
    return (
      <span
        aria-hidden="true"
        className="size-[15px] shrink-0"
        data-testid={`document-icon-placeholder-${node.id}`}
      />
    );
  }

  return isExpanded ? (
    <FolderOpen
      className="shrink-0 text-muted-foreground"
      data-testid={`directory-folder-open-${node.id}`}
      size={15}
    />
  ) : (
    <Folder
      className="shrink-0 text-muted-foreground"
      data-testid={`directory-folder-closed-${node.id}`}
      size={15}
    />
  );
}

function RenameInput({
  initialValue,
  label,
  onActivate,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  label: string;
  onActivate?: () => void;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ignoreInitialBlurRef = React.useRef(true);
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    onActivate?.();

    const timer = window.setTimeout(() => {
      ignoreInitialBlurRef.current = false;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [onActivate]);

  return (
    <Input
      ref={inputRef}
      aria-label={label}
      className="h-6 min-w-0 flex-1 px-1.5 text-sm"
      value={value}
      onBlur={() => {
        if (ignoreInitialBlurRef.current) {
          return;
        }

        onSubmit(value);
      }}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit(value);
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function NodeActionDropdown({
  node,
  onCreateDirectory,
  onCreateDocument,
  onDeleteRequest,
  onRenameRequest,
}: NodeActionProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`打开 ${node.name} 操作菜单`}
          className="mr-1 hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover/tree-row:flex data-[state=open]:flex"
          type="button"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <NodeDropdownActions
          node={node}
          onCreateDirectory={onCreateDirectory}
          onCreateDocument={onCreateDocument}
          onDeleteRequest={onDeleteRequest}
          onRenameRequest={onRenameRequest}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NodeActionProps {
  node: WorkspaceNode;
  onCreateDirectory: (parentPath: string) => Promise<void>;
  onCreateDocument: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onDeleteRequest: (node: WorkspaceNode) => void;
  onRenameRequest: (node: WorkspaceNode) => void;
}

function NodeDropdownActions({
  node,
  onCreateDirectory,
  onCreateDocument,
  onDeleteRequest,
  onRenameRequest,
}: NodeActionProps) {
  if (node.kind === 'directory') {
    return (
      <>
        <DropdownMenuItem
          onSelect={() => void onCreateDocument(node.relativePath)}
        >
          <FilePlus2 />
          新建文档
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void onCreateDirectory(node.relativePath)}
        >
          <FolderPlus />
          新建目录
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRenameRequest(node)}>
          <Pencil />
          重命名
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDeleteRequest(node)}
        >
          <Trash2 />
          删除目录
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem aria-label="导出原生文档 即将支持" disabled>
          <Download />
          导出原生文档
          <DropdownMenuShortcut>即将支持</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem aria-label="导出 Markdown 即将支持" disabled>
          <Download />
          导出 Markdown
          <DropdownMenuShortcut>即将支持</DropdownMenuShortcut>
        </DropdownMenuItem>
      </>
    );
  }

  return (
    <>
      <DropdownMenuItem onSelect={() => onRenameRequest(node)}>
        <Pencil />
        重命名
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => onDeleteRequest(node)}
      >
        <Trash2 />
        删除文档
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem aria-label="导出原生文档 即将支持" disabled>
        <Download />
        导出原生文档
        <DropdownMenuShortcut>即将支持</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem aria-label="导出 Markdown 即将支持" disabled>
        <Download />
        导出 Markdown
        <DropdownMenuShortcut>即将支持</DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  );
}

function NodeContextActions({
  node,
  onCreateDirectory,
  onCreateDocument,
  onDeleteRequest,
  onRenameRequest,
}: NodeActionProps) {
  if (node.kind === 'directory') {
    return (
      <>
        <ContextMenuItem
          onSelect={() => void onCreateDocument(node.relativePath)}
        >
          <FilePlus2 />
          新建文档
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => void onCreateDirectory(node.relativePath)}
        >
          <FolderPlus />
          新建目录
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRenameRequest(node)}>
          <Pencil />
          重命名
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDeleteRequest(node)}
        >
          <Trash2 />
          删除目录
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem aria-label="导出原生文档 即将支持" disabled>
          <Download />
          导出原生文档
          <ContextMenuShortcut>即将支持</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem aria-label="导出 Markdown 即将支持" disabled>
          <Download />
          导出 Markdown
          <ContextMenuShortcut>即将支持</ContextMenuShortcut>
        </ContextMenuItem>
      </>
    );
  }

  return (
    <>
      <ContextMenuItem onSelect={() => onRenameRequest(node)}>
        <Pencil />
        重命名
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => onDeleteRequest(node)}
      >
        <Trash2 />
        删除文档
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem aria-label="导出原生文档 即将支持" disabled>
        <Download />
        导出原生文档
        <ContextMenuShortcut>即将支持</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem aria-label="导出 Markdown 即将支持" disabled>
        <Download />
        导出 Markdown
        <ContextMenuShortcut>即将支持</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

function DeleteNodeDialog({
  node,
  onConfirm,
  onOpenChange,
}: {
  node: WorkspaceNode | null;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const isDirectory = node?.kind === 'directory';
  const actionLabel = isDirectory ? '删除目录' : '删除文档';

  return (
    <AlertDialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <AlertDialogContent
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        size="sm"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {node ? `${actionLabel} ${getNodeDisplayName(node)}？` : actionLabel}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDirectory
              ? '此操作会同时删除目录下的所有文档，删除后无法撤销。'
              : '删除后无法撤销。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t-0 bg-transparent">
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void onConfirm()}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getNodeDisplayName(node: WorkspaceNode) {
  return node.title || node.name;
}

function hasDescendantByAbsolutePath(
  node: WorkspaceNode,
  absolutePath?: string | null,
): boolean {
  if (!absolutePath || !node.children) {
    return false;
  }

  return node.children.some(
    (child) =>
      child.absolutePath === absolutePath ||
      hasDescendantByAbsolutePath(child, absolutePath),
  );
}

'use client';

import * as React from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  GitBranch,
  GitGraph,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import type {
  GitBranchItem,
  GitCommitEntry,
  GitCommitFile,
} from './workspace-types';

interface GitLogDrawerProps {
  branches: GitBranchItem[];
  commits: GitCommitEntry[];
  error: string | null;
  files: GitCommitFile[];
  branchWidth: number;
  detailsHeight: number;
  detailsWidth: number;
  height: number;
  isLoading: boolean;
  open: boolean;
  selectedCommitHash: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onResizeBranchWidth: (width: number) => void;
  onResizeDetailsHeight: (height: number) => void;
  onResizeDetailsWidth: (width: number) => void;
  onSelectCommit: (hash: string) => void;
  onSelectFile: (file: GitCommitFile) => void;
}

export function GitLogDrawer({
  branches,
  commits,
  error,
  files,
  branchWidth,
  detailsHeight,
  detailsWidth,
  height,
  isLoading,
  open,
  selectedCommitHash,
  onClose,
  onRefresh,
  onResizeBranchWidth,
  onResizeDetailsHeight,
  onResizeDetailsWidth,
  onSelectCommit,
  onSelectFile,
}: GitLogDrawerProps) {
  const [branchQuery, setBranchQuery] = React.useState('');
  const [commitQuery, setCommitQuery] = React.useState('');
  const [collapsedFilePaths, setCollapsedFilePaths] = React.useState<Set<string>>(
    () => new Set(),
  );
  const selectedCommit =
    commits.find((commit) => commit.hash === selectedCommitHash) ?? null;
  const filteredBranches = React.useMemo(
    () => filterBranches(branches, branchQuery),
    [branches, branchQuery],
  );
  const filteredCommits = React.useMemo(
    () => filterCommits(commits, commitQuery),
    [commits, commitQuery],
  );
  const fileTree = React.useMemo(() => buildCommitFileTree(files), [files]);
  const toggleFileTreePath = React.useCallback((path: string) => {
    setCollapsedFilePaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, []);

  if (!open) {
    return null;
  }

  return (
    <section
      className="flex w-full min-w-0 max-w-full shrink-0 flex-col overflow-hidden border-t bg-background"
      data-testid="git-log-drawer"
      style={{ height }}
    >
      <header
        className="flex h-10 shrink-0 items-center justify-between px-3"
        data-testid="git-log-header"
      >
        <div className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted/55 px-2 text-xs font-medium text-foreground">
          <GitGraph size={14} />
          <span>Git 日志</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="刷新 Git 日志"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            onClick={onRefresh}
          >
            <RefreshCw size={15} />
          </button>
          <button
            aria-label="关闭 Git 日志"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-1.5 px-2 pb-2">
        <aside
          className="min-h-0 shrink-0 overflow-hidden rounded-md bg-muted/10"
          data-testid="git-log-branches-pane"
          style={{ width: branchWidth }}
        >
          <div
            className="flex h-10 items-center px-2"
            data-testid="git-log-branch-search-row"
          >
            <SearchInput
              className="flex-1 p-0"
              label="搜索分支或者标签"
              testId="git-log-branch-search"
              value={branchQuery}
              onChange={setBranchQuery}
            />
          </div>
          <div className="git-panel-scroll h-[calc(100%-49px)] overflow-auto p-2">
            <BranchSection
              branches={filteredBranches.local}
              title="本地"
            />
            <BranchSection
              branches={filteredBranches.remote}
              title="远程"
            />
          </div>
        </aside>

        <VerticalResizeHandle
          aria-label="调整 Git 日志分支树宽度"
          direction="right"
          max={420}
          min={220}
          value={branchWidth}
          onResize={onResizeBranchWidth}
        />

        <main
          className="min-w-0 flex-1 overflow-hidden rounded-md bg-background"
          data-testid="git-log-commits-pane"
        >
          <div
            className="flex h-10 items-center gap-2 px-2"
            data-testid="git-log-commit-search-row"
          >
            <SearchInput
              className="flex-1 border-0 p-0"
              label="文本或哈希"
              testId="git-log-commit-search"
              value={commitQuery}
              onChange={setCommitQuery}
            />
            <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
              {filteredCommits.length} 条
            </span>
          </div>
          <div className="git-panel-scroll h-[calc(100%-49px)] overflow-auto">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">正在读取 Git 日志</div>
            ) : filteredCommits.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">没有匹配的提交</div>
            ) : (
              <ul>
                {filteredCommits.map((commit, index) => (
                  <CommitRow
                    commit={commit}
                    index={index}
                    key={commit.hash}
                    selected={commit.hash === selectedCommitHash}
                    onSelect={onSelectCommit}
                  />
                ))}
              </ul>
            )}
          </div>
        </main>

        <VerticalResizeHandle
          aria-label="调整 Git 日志详情宽度"
          direction="left"
          max={520}
          min={280}
          value={detailsWidth}
          onResize={onResizeDetailsWidth}
        />

        <aside
          className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-md bg-muted/10"
          data-testid="git-log-details-pane"
          style={{ width: detailsWidth }}
        >
          <section className="min-h-0 flex-1">
            <div
              className="flex h-9 items-center justify-between px-3 text-xs text-muted-foreground"
              data-testid="git-log-files-header"
            >
              <span>修改文件</span>
              <span>{files.length} 项</span>
            </div>
            <div className="git-panel-scroll h-[calc(100%-41px)] overflow-auto p-2">
              {fileTree.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">选择提交查看文件</p>
              ) : (
                <FileTree
                  collapsedPaths={collapsedFilePaths}
                  nodes={fileTree}
                  onSelectFile={onSelectFile}
                  onTogglePath={toggleFileTreePath}
                />
              )}
            </div>
          </section>
          <HorizontalResizeHandle
            aria-label="调整 Git 提交信息高度"
            max={340}
            min={140}
            value={detailsHeight}
            onResize={onResizeDetailsHeight}
          />
          <CommitDetails commit={selectedCommit} height={detailsHeight} />
        </aside>
      </div>
    </section>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function VerticalResizeHandle({
  'aria-label': ariaLabel,
  direction,
  max,
  min,
  value,
  onResize,
}: {
  'aria-label': string;
  direction: 'left' | 'right';
  max: number;
  min: number;
  value: number;
  onResize: (width: number) => void;
}) {
  const dragStateRef = React.useRef<{
    startPointerX: number;
    startWidth: number;
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

      const delta =
        direction === 'right'
          ? event.clientX - dragState.startPointerX
          : dragState.startPointerX - event.clientX;

      onResize(clampNumber(dragState.startWidth + delta, min, max));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [direction, isDragging, max, min, onResize]);

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className="group flex h-full w-2 shrink-0 cursor-col-resize items-center justify-center outline-none"
      data-dragging={isDragging ? 'true' : 'false'}
      role="separator"
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        dragStateRef.current = {
          startPointerX: event.clientX,
          startWidth: value,
        };
        setIsDragging(true);
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-12 w-px rounded-full bg-border/0 transition-[background-color,width] duration-150',
          'group-hover:w-0.5 group-hover:bg-[#3574f0]/60',
          'group-focus-visible:w-0.5 group-focus-visible:bg-[#3574f0]/70',
          isDragging && 'w-0.5 bg-[#3574f0]/80',
        )}
      />
    </div>
  );
}

function HorizontalResizeHandle({
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
    startPointerY: number;
    startHeight: number;
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
        clampNumber(
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

function SearchInput({
  className,
  label,
  testId,
  value,
  onChange,
}: {
  className?: string;
  label: string;
  testId?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn('block p-2', className)} data-testid={testId}>
      <span className="sr-only">{label}</span>
      <span className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
        <Search size={14} className="text-muted-foreground" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </span>
    </label>
  );
}

function BranchSection({
  branches,
  title,
}: {
  branches: GitBranchItem[];
  title: string;
}) {
  if (branches.length === 0) {
    return null;
  }

  return (
    <section className="mb-3">
      <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="space-y-0.5">
        {branches.map((branch) => (
          <li
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1 text-sm',
              branch.current && 'bg-muted text-foreground',
            )}
            key={`${branch.kind}:${branch.fullName}`}
          >
            <GitBranch
              className={branch.current ? 'text-primary' : 'text-muted-foreground'}
              size={14}
            />
            <span className="min-w-0 flex-1 truncate">{branch.name}</span>
            {branch.current ? (
              <span className="text-xs text-muted-foreground">HEAD</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommitRow({
  commit,
  index,
  selected,
  onSelect,
}: {
  commit: GitCommitEntry;
  index: number;
  selected: boolean;
  onSelect: (hash: string) => void;
}) {
  return (
    <li>
      <button
        className={cn(
          'grid w-full grid-cols-[32px_minmax(0,1fr)_160px_150px] items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted',
          selected && 'bg-primary/10 text-foreground',
        )}
        type="button"
        onClick={() => onSelect(commit.hash)}
      >
        <span className="relative flex justify-center">
          <span className="absolute bottom-[-18px] top-[-18px] w-px bg-primary/30" />
          <span className="relative size-2.5 rounded-full bg-primary" />
        </span>
        <span className="min-w-0">
          <span className="block truncate">{commit.subject || '(无提交信息)'}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
            {commit.refs.slice(0, 3).map((ref) => (
              <span
                className="max-w-36 truncate rounded-sm bg-muted px-1.5 py-0.5"
                key={ref}
              >
                {ref}
              </span>
            ))}
          </span>
        </span>
        <span className="truncate text-xs font-medium">{commit.authorName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {formatGitDate(commit.authoredAt, index)}
        </span>
      </button>
    </li>
  );
}

interface FileTreeNode {
  children: FileTreeNode[];
  file: GitCommitFile | null;
  name: string;
  path: string;
  type: 'directory' | 'file';
}

function FileTree({
  collapsedPaths,
  nodes,
  onSelectFile,
  onTogglePath,
}: {
  collapsedPaths: Set<string>;
  nodes: FileTreeNode[];
  onSelectFile: (file: GitCommitFile) => void;
  onTogglePath: (path: string) => void;
}) {
  return (
    <ul className="min-w-full w-max space-y-0.5">
      {nodes.map((node) => (
        <FileTreeItem
          collapsedPaths={collapsedPaths}
          key={node.path}
          node={node}
          onSelectFile={onSelectFile}
          onTogglePath={onTogglePath}
        />
      ))}
    </ul>
  );
}

function FileTreeItem({
  collapsedPaths,
  node,
  onSelectFile,
  onTogglePath,
}: {
  collapsedPaths: Set<string>;
  node: FileTreeNode;
  onSelectFile: (file: GitCommitFile) => void;
  onTogglePath: (path: string) => void;
}) {
  const isFile = node.type === 'file';
  const collapsed = collapsedPaths.has(node.path);

  return (
    <li>
      <button
        aria-expanded={isFile ? undefined : !collapsed}
        className="flex min-w-full w-max items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
        type="button"
        onClick={() => {
          if (isFile && node.file) {
            onSelectFile(node.file);
          } else {
            onTogglePath(node.path);
          }
        }}
      >
        {isFile ? (
          <span className="size-3.5 shrink-0" />
        ) : collapsed ? (
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        )}
        {isFile ? (
          <File
            size={14}
            className={cn('shrink-0', fileStatusColor(node.file?.changeType))}
          />
        ) : (
          <Folder size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="whitespace-nowrap">{node.name}</span>
        {node.file ? (
          <span className="text-xs text-muted-foreground">{node.file.status}</span>
        ) : null}
      </button>
      {!collapsed && node.children.length > 0 ? (
        <div className="ml-4 border-l pl-2">
          <FileTree
            collapsedPaths={collapsedPaths}
            nodes={node.children}
            onSelectFile={onSelectFile}
            onTogglePath={onTogglePath}
          />
        </div>
      ) : null}
    </li>
  );
}

function CommitDetails({
  commit,
  height,
}: {
  commit: GitCommitEntry | null;
  height: number;
}) {
  if (!commit) {
    return (
      <div
        className="p-4 text-sm text-muted-foreground"
        style={{ height }}
      >
        选择提交查看详情
      </div>
    );
  }

  return (
    <section
      className="git-panel-scroll shrink-0 overflow-auto p-4"
      style={{ height }}
    >
      <h3 className="whitespace-pre-wrap text-sm font-semibold leading-5">
        {commit.subject}
      </h3>
      {commit.body ? (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {commit.body}
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
        <dt className="text-muted-foreground">编号</dt>
        <dd className="truncate font-mono">{commit.hash}</dd>
        <dt className="text-muted-foreground">作者</dt>
        <dd className="truncate">{commit.authorName}</dd>
        <dt className="text-muted-foreground">邮箱</dt>
        <dd className="truncate">{commit.authorEmail}</dd>
        <dt className="text-muted-foreground">时间</dt>
        <dd className="flex items-center gap-1 truncate">
          <CalendarDays size={13} />
          {formatGitDate(commit.authoredAt, 0)}
        </dd>
        <dt className="text-muted-foreground">分支</dt>
        <dd className="flex flex-wrap gap-1">
          {commit.refs.length > 0
            ? commit.refs.map((ref) => (
                <span className="rounded-sm bg-muted px-1.5 py-0.5" key={ref}>
                  {ref}
                </span>
              ))
            : '无'}
        </dd>
      </dl>
    </section>
  );
}

function filterBranches(branches: GitBranchItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? branches.filter((branch) => branch.name.toLowerCase().includes(normalized))
    : branches;

  return {
    local: filtered.filter((branch) => branch.kind === 'local'),
    remote: filtered.filter((branch) => branch.kind === 'remote'),
  };
}

function filterCommits(commits: GitCommitEntry[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return commits;
  }

  return commits.filter((commit) =>
    [
      commit.hash,
      commit.shortHash,
      commit.subject,
      commit.body,
      commit.authorName,
      commit.authorEmail,
      commit.refs.join(' '),
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  );
}

function buildCommitFileTree(files: GitCommitFile[]) {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = current.find((item) => item.name === part);

      if (!node) {
        node = {
          children: [],
          file: isFile ? file : null,
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
        };
        current.push(node);
      }

      current = node.children;
    });
  }

  return root;
}

function fileStatusColor(changeType: GitCommitFile['changeType'] | undefined) {
  if (changeType === 'added') {
    return 'text-emerald-600 dark:text-emerald-400';
  }

  if (changeType === 'deleted') {
    return 'text-red-600 dark:text-red-400';
  }

  if (changeType === 'renamed') {
    return 'text-amber-600 dark:text-amber-400';
  }

  return 'text-sky-600 dark:text-sky-400';
}

function formatGitDate(value: string, fallbackOffset: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallbackOffset === 0 ? value : '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    year: 'numeric',
  }).format(date);
}

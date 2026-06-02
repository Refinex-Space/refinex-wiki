'use client';

import * as React from 'react';
import {
  CalendarDays,
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
  isLoading: boolean;
  open: boolean;
  rootName: string;
  selectedCommitHash: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSelectCommit: (hash: string) => void;
}

export function GitLogDrawer({
  branches,
  commits,
  error,
  files,
  isLoading,
  open,
  rootName,
  selectedCommitHash,
  onClose,
  onRefresh,
  onSelectCommit,
}: GitLogDrawerProps) {
  const [branchQuery, setBranchQuery] = React.useState('');
  const [commitQuery, setCommitQuery] = React.useState('');
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

  if (!open) {
    return null;
  }

  return (
    <section
      className="fixed bottom-2 left-12 right-2 z-40 flex h-[68vh] min-h-[420px] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
      data-testid="git-log-drawer"
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <GitGraph size={16} />
          <span>Git 日志</span>
          <span className="text-xs font-normal text-muted-foreground">{rootName}</span>
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

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(420px,1fr)_360px]">
        <aside className="min-h-0 border-r">
          <SearchInput
            label="搜索分支或者标签"
            value={branchQuery}
            onChange={setBranchQuery}
          />
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

        <main className="min-h-0 border-r">
          <div className="flex h-12 items-center gap-2 border-b px-2">
            <SearchInput
              className="flex-1 border-0 p-0"
              label="文本或哈希"
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

        <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px]">
          <section className="min-h-0 border-b">
            <div className="flex h-10 items-center justify-between border-b px-3 text-xs text-muted-foreground">
              <span>修改文件</span>
              <span>{files.length} 项</span>
            </div>
            <div className="git-panel-scroll h-[calc(100%-41px)] overflow-auto p-2">
              {fileTree.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">选择提交查看文件</p>
              ) : (
                <FileTree nodes={fileTree} />
              )}
            </div>
          </section>
          <CommitDetails commit={selectedCommit} />
        </aside>
      </div>
    </section>
  );
}

function SearchInput({
  className,
  label,
  value,
  onChange,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn('block border-b p-2', className)}>
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

function FileTree({ nodes }: { nodes: FileTreeNode[] }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeItem key={node.path} node={node} />
      ))}
    </ul>
  );
}

function FileTreeItem({ node }: { node: FileTreeNode }) {
  const isFile = node.type === 'file';

  return (
    <li>
      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
        {isFile ? (
          <File size={14} className={fileStatusColor(node.file?.changeType)} />
        ) : (
          <Folder size={14} className="text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.file ? (
          <span className="text-xs text-muted-foreground">{node.file.status}</span>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <div className="ml-4 border-l pl-2">
          <FileTree nodes={node.children} />
        </div>
      ) : null}
    </li>
  );
}

function CommitDetails({ commit }: { commit: GitCommitEntry | null }) {
  if (!commit) {
    return <div className="p-4 text-sm text-muted-foreground">选择提交查看详情</div>;
  }

  return (
    <section className="git-panel-scroll overflow-auto p-4">
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

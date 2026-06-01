'use client';

import * as React from 'react';
import { Check, GitBranch, GitCommit, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { GitChange, GitProbe, GitStatus } from './workspace-types';

interface GitPanelProps {
  error: string | null;
  isLoading: boolean;
  probe: GitProbe | null;
  selectedPath: string | null;
  selectedPaths: Set<string>;
  status: GitStatus | null;
  onCommit: (message: string) => void;
  onInitRepository: () => void;
  onRefresh: () => void;
  onSelectChange: (path: string, checked: boolean) => void;
  onSelectFile: (path: string) => void;
  onStageSelected: () => void;
  onUnstageSelected: () => void;
}

export function GitPanel({
  error,
  isLoading,
  probe,
  selectedPath,
  selectedPaths,
  status,
  onCommit,
  onInitRepository,
  onRefresh,
  onSelectChange,
  onSelectFile,
  onStageSelected,
  onUnstageSelected,
}: GitPanelProps) {
  const [message, setMessage] = React.useState('');
  const selectedCount = selectedPaths.size;
  const canCommit = message.trim().length > 0 && selectedCount > 0;

  if (!probe) {
    return <PanelShell title="Git">正在检测 Git 状态</PanelShell>;
  }

  if (!probe.gitAvailable) {
    return (
      <PanelShell title="Git">
        <p className="text-sm text-muted-foreground">未检测到本机 Git 命令。</p>
      </PanelShell>
    );
  }

  if (!probe.isRepository) {
    return (
      <PanelShell title="Git">
        <div className="rounded-lg border border-dashed p-4">
          <h3 className="text-sm font-semibold">当前工作区还不是 Git 仓库</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            初始化后可以在这里查看变更、选择文件并提交。
          </p>
          <button
            className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            type="button"
            onClick={onInitRepository}
          >
            初始化 Git 仓库
          </button>
        </div>
      </PanelShell>
    );
  }

  const changes = status?.changes ?? [];

  return (
    <PanelShell
      action={
        <button
          aria-label="刷新 Git 状态"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
        </button>
      }
      title="提交"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranch size={14} />
        <span className="truncate">{status?.branch ?? probe.branch ?? 'HEAD'}</span>
        {status && status.ahead > 0 ? <span>领先 {status.ahead}</span> : null}
        {status && status.behind > 0 ? <span>落后 {status.behind}</span> : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {changes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">没有本地变更</p>
        ) : (
          <ul className="space-y-1">
            {changes.map((change) => (
              <li key={change.path}>
                <div
                  className={cn(
                    'grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    selectedPath === change.path && 'bg-muted text-foreground',
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectFile(change.path)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectFile(change.path);
                    }
                  }}
                >
                  <input
                    aria-label={`选择 ${change.path}`}
                    checked={selectedPaths.has(change.path)}
                    type="checkbox"
                    onChange={(event) =>
                      onSelectChange(change.path, event.currentTarget.checked)
                    }
                    onClick={(event) => event.stopPropagation()}
                  />
                  <span className="truncate">{change.path}</span>
                  <span className="text-xs text-muted-foreground">
                    {renderChangeBadge(change)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex gap-2">
          <button
            className="rounded-md border px-2 py-1 text-xs"
            type="button"
            onClick={onStageSelected}
          >
            暂存
          </button>
          <button
            className="rounded-md border px-2 py-1 text-xs"
            type="button"
            onClick={onUnstageSelected}
          >
            取消暂存
          </button>
        </div>
        <label className="block text-xs text-muted-foreground" htmlFor="git-commit-message">
          提交信息
        </label>
        <textarea
          className="min-h-28 w-full resize-none rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          id="git-commit-message"
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
        />
        <button
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canCommit || isLoading}
          type="button"
          onClick={() => onCommit(message)}
        >
          <GitCommit size={15} />
          提交 {selectedCount} 个文件
        </button>
      </div>
    </PanelShell>
  );
}

function PanelShell({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <aside className="flex h-full flex-col gap-3 rounded-lg border bg-background p-3 shadow-sm">
      <header className="flex items-center justify-between border-b pb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </aside>
  );
}

function renderChangeBadge(change: GitChange) {
  if (change.changeType === 'untracked') {
    return '新增';
  }

  if (change.staged) {
    return <Check size={13} />;
  }

  return change.workingTreeStatus || change.indexStatus || '改';
}

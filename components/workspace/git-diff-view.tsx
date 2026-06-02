'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import type { GitDiff } from './workspace-types';

interface GitDiffViewProps {
  diff: GitDiff | null;
  label?: string;
  error: string | null;
  isLoading: boolean;
}

export function GitDiffView({ diff, label, error, isLoading }: GitDiffViewProps) {
  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">正在读取差异</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-destructive">{error}</div>;
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择左侧变更查看差异
      </div>
    );
  }

  if (diff.binary) {
    return (
      <section className="h-full overflow-auto p-6">
        <h2 className="text-sm font-semibold">{diff.path}</h2>
        <p className="mt-4 rounded-md border p-4 text-sm text-muted-foreground">
          二进制文件暂不展示文本差异。
        </p>
      </section>
    );
  }

  const lines = diff.content.split('\n');

  return (
    <section className="h-full overflow-auto bg-background">
      <header className="sticky top-0 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <h2 className="text-sm font-semibold">{diff.path}</h2>
        <p className="text-xs text-muted-foreground">
          {label ?? (diff.staged ? '已暂存差异' : '工作区差异')}
        </p>
      </header>
      <pre className="p-6 text-xs leading-5">
        {lines.map((line, index) => (
          <div
            className={cn(
              line.startsWith('+') &&
                'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              line.startsWith('-') &&
                'bg-red-500/10 text-red-700 dark:text-red-300',
              line.startsWith('@@') && 'bg-muted text-muted-foreground',
            )}
            key={`${index}:${line}`}
          >
            {line || ' '}
          </div>
        ))}
      </pre>
    </section>
  );
}

'use client';

import * as React from 'react';
import { FileText, Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type {
  TextHighlightRange,
  WorkspaceGlobalSearchResult,
} from './workspace-global-search';

interface WorkspaceGlobalSearchDialogProps {
  indexStatus: 'error' | 'idle' | 'indexing' | 'ready';
  open: boolean;
  query: string;
  results: WorkspaceGlobalSearchResult[];
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: WorkspaceGlobalSearchResult) => void;
}

export function WorkspaceGlobalSearchDialog({
  indexStatus,
  open,
  query,
  results,
  onOpenChange,
  onQueryChange,
  onSelectResult,
}: WorkspaceGlobalSearchDialogProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const boundedActiveIndex = Math.min(
    activeIndex,
    Math.max(0, results.length - 1),
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[30%] max-w-3xl gap-0 overflow-hidden rounded-xl p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>搜索文档</DialogTitle>
          <DialogDescription>搜索当前工作区的 Markdown 文档</DialogDescription>
        </DialogHeader>
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <Search className="shrink-0 text-muted-foreground" size={17} />
          <Input
            ref={inputRef}
            aria-label="搜索文档"
            className="h-10 border-0 px-0 text-base shadow-none focus-visible:ring-0 md:text-sm"
            placeholder="搜索文档标题、路径或正文"
            role="searchbox"
            value={query}
            onChange={(event) => {
              setActiveIndex(0);
              onQueryChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) =>
                  Math.min(current + 1, Math.max(0, results.length - 1)),
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
              } else if (event.key === 'Enter' && results[boundedActiveIndex]) {
                event.preventDefault();
                onSelectResult(results[boundedActiveIndex]);
              }
            }}
          />
          <kbd className="rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[520px] overflow-y-auto p-2">
          {renderSearchState({
            activeIndex,
            indexStatus,
            query,
            results,
            onSelectResult,
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderSearchState({
  activeIndex,
  indexStatus,
  query,
  results,
  onSelectResult,
}: {
  activeIndex: number;
  indexStatus: WorkspaceGlobalSearchDialogProps['indexStatus'];
  query: string;
  results: WorkspaceGlobalSearchResult[];
  onSelectResult: (result: WorkspaceGlobalSearchResult) => void;
}) {
  const boundedActiveIndex = Math.min(
    activeIndex,
    Math.max(0, results.length - 1),
  );
  if (indexStatus === 'indexing') {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
        正在建立全文索引...
      </div>
    );
  }

  if (indexStatus === 'error') {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-destructive">
        无法建立全文索引
      </div>
    );
  }

  if (!query.trim()) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
        输入关键词搜索当前工作区
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
        没有匹配的文档
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {results.map((result, index) => (
        <button
          aria-label={`打开文档 ${result.document.title}`}
          className={cn(
            'flex w-full gap-3 rounded-lg px-3 py-2 text-left transition-colors',
            index === boundedActiveIndex
              ? 'bg-muted text-foreground'
              : 'hover:bg-muted/70',
          )}
          key={result.document.absolutePath}
          type="button"
          onClick={() => onSelectResult(result)}
        >
          <FileText className="mt-0.5 shrink-0 text-muted-foreground" size={16} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block truncate text-sm font-medium">
              <HighlightedText
                highlights={result.titleHighlights}
                text={result.document.title}
              />
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              <HighlightedText
                highlights={result.pathHighlights}
                text={result.document.relativePath}
              />
            </span>
            {result.snippet ? (
              <span className="line-clamp-2 block text-xs leading-5 text-muted-foreground">
                <HighlightedText
                  highlights={result.snippet.highlights}
                  text={result.snippet.text}
                />
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

function HighlightedText({
  highlights,
  text,
}: {
  highlights: TextHighlightRange[];
  text: string;
}) {
  if (highlights.length === 0) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  highlights.forEach((range) => {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }

    parts.push(
      <mark
        className="rounded-sm bg-[#f6d365]/45 px-0.5 text-foreground"
        key={`${range.start}-${range.end}`}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

'use client';

import { ChevronDown, X } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type {
  DocumentEditorTab,
} from './document-tabs';

interface DocumentTabBarProps {
  activeTabPath: string | null;
  tabs: DocumentEditorTab[];
  visibleTabLimit?: number;
  onCloseAllTabs: () => void;
  onCloseOtherTabs: (tabPath: string) => void;
  onCloseTab: (tabPath: string) => void;
  onCloseTabsToLeft: (tabPath: string) => void;
  onCloseTabsToRight: (tabPath: string) => void;
  onSelectTab: (tabPath: string) => void;
}

const DEFAULT_VISIBLE_TAB_LIMIT = 8;

export function DocumentTabBar({
  activeTabPath,
  tabs,
  visibleTabLimit = DEFAULT_VISIBLE_TAB_LIMIT,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
}: DocumentTabBarProps) {
  const visibleTabs = tabs.slice(0, visibleTabLimit);
  const overflowTabs = tabs.slice(visibleTabLimit);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex h-9 shrink-0 items-center bg-background px-1.5"
      data-testid="document-tab-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {visibleTabs.map((tab) => (
          <DocumentTabItem
            activeTabPath={activeTabPath}
            key={tab.absolutePath}
            tab={tab}
            onCloseAllTabs={onCloseAllTabs}
            onCloseOtherTabs={onCloseOtherTabs}
            onCloseTab={onCloseTab}
            onCloseTabsToLeft={onCloseTabsToLeft}
            onCloseTabsToRight={onCloseTabsToRight}
            onSelectTab={onSelectTab}
          />
        ))}
      </div>

      {overflowTabs.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="显示更多打开的文档"
              className="ml-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              type="button"
            >
              <ChevronDown size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {overflowTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.absolutePath}
                onSelect={() => onSelectTab(tab.absolutePath)}
              >
                <span className="truncate">{tab.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

type DocumentTabItemProps = Omit<
  DocumentTabBarProps,
  'tabs' | 'visibleTabLimit'
> & {
  tab: DocumentEditorTab;
};

function DocumentTabItem({
  activeTabPath,
  tab,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
}: DocumentTabItemProps) {
  const active = activeTabPath === tab.absolutePath;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          aria-selected={active}
          className={cn(
            'group flex h-7 max-w-56 min-w-28 cursor-default items-center rounded-md pl-2.5 pr-1 text-sm outline-none transition-colors',
            active
              ? 'bg-muted/55 text-foreground'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
          role="tab"
          tabIndex={0}
          title={tab.title}
          onClick={() => onSelectTab(tab.absolutePath)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTab(tab.absolutePath);
            }
          }}
        >
          <span className="min-w-0 flex-1 truncate">{tab.title}</span>
          <button
            aria-label={`关闭标签页 ${tab.title}`}
            className={cn(
              'ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100',
              active && 'opacity-100',
            )}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.absolutePath);
            }}
          >
            <X size={12} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => onCloseTab(tab.absolutePath)}>
          关闭
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseOtherTabs(tab.absolutePath)}>
          关闭其他标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseAllTabs()}>
          关闭所有标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseTabsToLeft(tab.absolutePath)}>
          关闭左侧标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseTabsToRight(tab.absolutePath)}>
          关闭右侧标签页
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

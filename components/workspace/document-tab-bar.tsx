'use client';

import { ChevronDown, PanelBottom, PanelRight, X } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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
  DocumentEditorGroup,
  DocumentEditorTab,
  EditorSplitDirection,
} from './document-tabs';

interface DocumentTabBarProps {
  group: DocumentEditorGroup;
  visibleTabLimit?: number;
  onCloseAllTabs: (groupId: string) => void;
  onCloseOtherTabs: (groupId: string, tabPath: string) => void;
  onCloseTab: (groupId: string, tabPath: string) => void;
  onCloseTabsToLeft: (groupId: string, tabPath: string) => void;
  onCloseTabsToRight: (groupId: string, tabPath: string) => void;
  onSelectTab: (groupId: string, tabPath: string) => void;
  onSplitTab: (
    groupId: string,
    tabPath: string,
    direction: EditorSplitDirection,
  ) => void;
}

const DEFAULT_VISIBLE_TAB_LIMIT = 8;

export function DocumentTabBar({
  group,
  visibleTabLimit = DEFAULT_VISIBLE_TAB_LIMIT,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
  onSplitTab,
}: DocumentTabBarProps) {
  const visibleTabs = group.tabs.slice(0, visibleTabLimit);
  const overflowTabs = group.tabs.slice(visibleTabLimit);

  if (group.tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex h-9 shrink-0 items-stretch border-b border-border/60 bg-background"
      data-testid={`document-tab-bar-${group.id}`}
    >
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {visibleTabs.map((tab) => (
          <DocumentTabItem
            group={group}
            key={tab.absolutePath}
            tab={tab}
            onCloseAllTabs={onCloseAllTabs}
            onCloseOtherTabs={onCloseOtherTabs}
            onCloseTab={onCloseTab}
            onCloseTabsToLeft={onCloseTabsToLeft}
            onCloseTabsToRight={onCloseTabsToRight}
            onSelectTab={onSelectTab}
            onSplitTab={onSplitTab}
          />
        ))}
      </div>

      {overflowTabs.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
          <button
            aria-label="显示更多打开的文档"
              className="mr-1 inline-flex w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              type="button"
            >
              <ChevronDown size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {overflowTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.absolutePath}
                onSelect={() => onSelectTab(group.id, tab.absolutePath)}
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

function DocumentTabItem({
  group,
  tab,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
  onSplitTab,
}: Omit<DocumentTabBarProps, 'visibleTabLimit'> & {
  tab: DocumentEditorTab;
}) {
  const active = group.activeTabPath === tab.absolutePath;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          aria-selected={active}
          className={cn(
            'group flex h-full max-w-56 min-w-28 cursor-default items-center border-r pl-2 pr-1 text-sm outline-none',
            active
              ? 'bg-background text-foreground'
              : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          role="tab"
          tabIndex={0}
          title={tab.title}
          onClick={() => onSelectTab(group.id, tab.absolutePath)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTab(group.id, tab.absolutePath);
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
              onCloseTab(group.id, tab.absolutePath);
            }}
          >
            <X size={12} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => onCloseTab(group.id, tab.absolutePath)}>
          关闭
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onCloseOtherTabs(group.id, tab.absolutePath)}
        >
          关闭其他标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseAllTabs(group.id)}>
          关闭所有标签页
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onCloseTabsToLeft(group.id, tab.absolutePath)}
        >
          关闭左侧标签页
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onCloseTabsToRight(group.id, tab.absolutePath)}
        >
          关闭右侧标签页
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onSplitTab(group.id, tab.absolutePath, 'right')}
        >
          <PanelRight size={14} />
          向右拆分
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onSplitTab(group.id, tab.absolutePath, 'down')}
        >
          <PanelBottom size={14} />
          向下拆分
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

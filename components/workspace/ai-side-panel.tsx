'use client';

import * as React from 'react';
import { Bot, Info, ListTree, Palette, Settings, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';

import type { DocumentTocSnapshot } from '@/components/editor/markdown-toc';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { DocumentMetaPanel } from './document-meta-panel';
import { DocumentTocPanel } from './document-toc-panel';
import { WorkspaceSettingsDialog } from './workspace-settings-dialog';
import type {
  AppSettings,
  RightPanelMode,
  WorkspaceNode,
} from './workspace-types';

export interface DocumentPanelData {
  markdown: string;
  metadata: { title: string; createdAt: string; updatedAt: string };
}

interface RightSidePanelProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  mode: RightPanelMode;
  tocSnapshot: DocumentTocSnapshot | null;
  width: number;
  workspaceRootPath: string | null;
}

interface RightToolRailProps {
  mode: RightPanelMode;
  workspaceRootPath: string | null;
  onModeChange: (mode: RightPanelMode) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

export function RightSidePanel({
  currentDocument,
  documentPanelData,
  mode,
  tocSnapshot,
  width,
  workspaceRootPath,
}: RightSidePanelProps) {
  if (!mode) {
    return null;
  }

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm"
      data-testid={getRightPanelTestId(mode)}
      style={{ width }}
    >
      {mode === 'ai' ? (
        <AiPanelContent currentDocument={currentDocument} />
      ) : mode === 'toc' ? (
        <DocumentTocPanel
          currentDocument={currentDocument}
          snapshot={tocSnapshot}
        />
      ) : (
        <DocumentMetaPanel
          currentDocument={currentDocument}
          documentPanelData={documentPanelData}
          workspaceRootPath={workspaceRootPath}
        />
      )}
    </aside>
  );
}

export function RightToolRail({
  mode,
  workspaceRootPath,
  onModeChange,
  onSettingsSaved,
}: RightToolRailProps) {
  const nextMode = (targetMode: Exclude<RightPanelMode, null>) =>
    mode === targetMode ? null : targetMode;
  const { setTheme, theme } = useTheme();
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  return (
    <nav
      className="flex h-full w-8 shrink-0 flex-col items-center gap-2 py-1"
      data-testid="right-tool-rail"
    >
      <button
        aria-label={mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
        className={rightToolButtonClassName(mode === 'ai')}
        data-testid="ai-panel-icon-button"
        type="button"
        onClick={() => onModeChange(nextMode('ai'))}
      >
        <span
          aria-hidden="true"
          className="size-[17px] bg-current"
          data-testid="ai-panel-icon"
          style={{
            WebkitMask: "url('/icons/ai-panel.svg') center / contain no-repeat",
            mask: "url('/icons/ai-panel.svg') center / contain no-repeat",
          }}
        />
      </button>

      <button
        aria-label={mode === 'toc' ? '折叠目录面板' : '展开目录面板'}
        className={rightToolButtonClassName(mode === 'toc')}
        data-testid="toc-panel-icon-button"
        type="button"
        onClick={() => onModeChange(nextMode('toc'))}
      >
        <ListTree size={17} />
      </button>

      <button
        aria-label={mode === 'meta' ? '折叠元信息面板' : '展开元信息面板'}
        className={rightToolButtonClassName(mode === 'meta')}
        data-testid="document-meta-panel-icon-button"
        type="button"
        onClick={() => onModeChange(nextMode('meta'))}
      >
        <Info size={17} />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="打开设置菜单"
            className={cn(rightToolButtonClassName(false), 'mt-auto')}
            data-testid="settings-menu-button"
            type="button"
          >
            <Settings size={17} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40" side="left">
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings size={15} />
            <span>设置...</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette size={15} />
              <span>主题</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-32">
              <DropdownMenuRadioGroup
                value={theme ?? 'light'}
                onValueChange={(value) => setTheme(value)}
              >
                <DropdownMenuRadioItem value="light">
                  亮色
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  暗色
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  跟随系统
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceSettingsDialog
        open={settingsOpen}
        workspaceRootPath={workspaceRootPath}
        onOpenChange={setSettingsOpen}
        onSettingsSaved={onSettingsSaved}
      />
    </nav>
  );
}

function getRightPanelTestId(mode: Exclude<RightPanelMode, null>) {
  switch (mode) {
    case 'ai':
      return 'ai-panel-island';
    case 'toc':
      return 'document-toc-panel';
    case 'meta':
      return 'document-meta-panel';
  }
}

function AiPanelContent({
  currentDocument,
}: {
  currentDocument: WorkspaceNode | null;
}) {
  return (
    <>
      <header className="flex h-12 items-center border-b px-3">
        <span className="truncate text-sm font-medium">AI 助手</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            {currentDocument?.title || currentDocument?.name || '未选择文档'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI 能力尚未接入。
          </p>
        </div>

        <div className="grid gap-2">
          <Button className="justify-start" type="button" variant="outline">
            <Sparkles size={15} />
            总结此页面
          </Button>
          <Button className="justify-start" type="button" variant="outline">
            <Bot size={15} />
            解释选中内容
          </Button>
          <Button className="justify-start" type="button" variant="outline">
            <ListTree size={15} />
            生成大纲
          </Button>
        </div>

        <textarea
          className="mt-auto min-h-24 resize-none rounded-md border bg-background p-3 text-sm outline-none"
          disabled
          placeholder="使用 AI 处理各种任务..."
        />
      </div>
    </>
  );
}

function rightToolButtonClassName(active: boolean) {
  return cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
    active &&
      'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
  );
}

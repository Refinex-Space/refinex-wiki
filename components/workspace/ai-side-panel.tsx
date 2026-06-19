'use client';

import * as React from 'react';
import { Info, ListTree, Palette, Settings } from 'lucide-react';
import { useTheme } from 'next-themes';

import type { DocumentTocSnapshot } from '@/components/editor/markdown-toc';
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
import { AiPanelContent } from './ai-panel/ai-panel-content';
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
  settingsVersion: number;
  tocSnapshot: DocumentTocSnapshot | null;
  width: number;
  workspaceRootPath: string | null;
  onOpenSettings: () => void;
}

interface RightToolRailProps {
  mode: RightPanelMode;
  settingsInitialSectionId?: 'appearance' | 'storage' | 'ai';
  settingsOpen: boolean;
  workspaceRootPath: string | null;
  onModeChange: (mode: RightPanelMode) => void;
  onOpenSettings: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

export function RightSidePanel({
  currentDocument,
  documentPanelData,
  mode,
  settingsVersion,
  tocSnapshot,
  width,
  workspaceRootPath,
  onOpenSettings,
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
        <AiPanelContent
          currentDocument={currentDocument}
          documentPanelData={documentPanelData}
          settingsVersion={settingsVersion}
          workspaceRootPath={workspaceRootPath}
          onOpenSettings={onOpenSettings}
        />
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
  settingsInitialSectionId = 'appearance',
  settingsOpen,
  workspaceRootPath,
  onModeChange,
  onOpenSettings,
  onSettingsOpenChange,
  onSettingsSaved,
}: RightToolRailProps) {
  const nextMode = (targetMode: Exclude<RightPanelMode, null>) =>
    mode === targetMode ? null : targetMode;
  const { setTheme, theme } = useTheme();

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
          <DropdownMenuItem onSelect={onOpenSettings}>
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
        initialSectionId={settingsInitialSectionId}
        open={settingsOpen}
        workspaceRootPath={workspaceRootPath}
        onOpenChange={onSettingsOpenChange}
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

function rightToolButtonClassName(active: boolean) {
  return cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
    active &&
      'bg-[#3574f0] text-white shadow-sm hover:bg-[#3574f0] hover:text-white',
  );
}

'use client';

import * as React from 'react';
import {
  Cloud,
  Database,
  FolderArchive,
  Search,
  Server,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  isTauriRuntime,
  readAppSettings,
  saveAppSettings,
} from './workspace-api';
import type { AppSettings } from './workspace-types';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  workspaceRootPath: string | null;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
  appearance: {
    pageWidthMode: 'standard',
  },
};

const STORAGE_SEARCH_TERMS = [
  '存储',
  '上传',
  '附件',
  '图片',
  '视频',
  '音频',
  '文件',
  'asset',
  '本地存储',
  'oss',
  '自定义 api',
];

const STORAGE_FIELD_DEFINITIONS = [
  {
    id: 'asset-directory',
    label: '资源目录',
    value: (assetDirectory: string) => assetDirectory,
    terms: ['资源目录', '目录', '路径', '本地', 'assets', '.refinex'],
  },
  {
    id: 'asset-url',
    label: '引用格式',
    value: () => 'refinex-asset://{assetId}',
    terms: ['引用格式', '引用', '格式', 'url', 'assetid', 'refinex-asset'],
  },
  {
    id: 'cleanup-policy',
    label: '清理策略',
    value: () => '保存或删除文档时清理未引用资源',
    terms: ['清理策略', '清理', '删除', '孤立资源'],
  },
];

export function WorkspaceSettingsDialog({
  open,
  workspaceRootPath,
  onOpenChange,
  onSettingsSaved,
}: WorkspaceSettingsDialogProps) {
  const [settings, setSettings] =
    React.useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loadState, setLoadState] = React.useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle');
  const [saveState, setSaveState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const assetDirectory = workspaceRootPath
    ? `${workspaceRootPath}/.refinex/assets`
    : '打开工作区后使用 .refinex/assets';
  const normalizedSearchQuery = normalizeSearchTerm(searchQuery);
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const storageSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    STORAGE_SEARCH_TERMS,
  );
  const matchingStorageFields = hasSearchQuery
    ? STORAGE_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : STORAGE_FIELD_DEFINITIONS;
  const shouldShowStorageSection =
    !hasSearchQuery || storageSectionMatches || matchingStorageFields.length > 0;
  const visibleStorageFields =
    hasSearchQuery && matchingStorageFields.length > 0 && !storageSectionMatches
      ? matchingStorageFields
      : STORAGE_FIELD_DEFINITIONS;

  React.useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!open) {
        return;
      }

      setSearchQuery('');
      setLoadState('loading');
      setSaveState('idle');
      setErrorMessage(null);

      if (!isTauriRuntime()) {
        setSettings(DEFAULT_APP_SETTINGS);
        setLoadState('loaded');
        return;
      }

      try {
        const nextSettings = await readAppSettings();

        if (!cancelled) {
          setSettings(nextSettings);
          setLoadState('loaded');
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState('error');
          setErrorMessage(
            error instanceof Error ? error.message : '无法读取应用设置',
          );
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleApply() {
    setSaveState('saving');
    setErrorMessage(null);

    if (!isTauriRuntime()) {
      setSaveState('saved');
      onSettingsSaved?.(settings);
      return;
    }

    try {
      const savedSettings = await saveAppSettings(settings);

      setSettings(savedSettings);
      onSettingsSaved?.(savedSettings);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setErrorMessage(error instanceof Error ? error.message : '无法保存应用设置');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[min(620px,calc(100vh-40px))] min-h-[500px] w-[860px] max-w-[calc(100vw-40px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[860px]">
        <DialogHeader className="gap-1 border-b px-5 py-3">
          <DialogTitle className="text-[15px]">设置</DialogTitle>
          <DialogDescription className="text-xs">
            配置全局上传和资源存储方式。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[184px_minmax(0,1fr)]">
          <aside className="space-y-3 border-r bg-muted/25 p-3">
            <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <Search size={14} />
              <input
                aria-label="搜索设置"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                placeholder="搜索设置"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery ? (
                <button
                  aria-label="清空设置搜索"
                  className="text-muted-foreground hover:text-foreground"
                  type="button"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={13} />
                </button>
              ) : null}
            </label>
            {shouldShowStorageSection ? (
              <button
                className="flex h-8 w-full items-center gap-2 rounded-md bg-[#3574f0] px-2 text-left text-sm font-medium text-white shadow-sm"
                type="button"
              >
                <Database size={15} />
                存储
              </button>
            ) : null}
          </aside>

          <section className="min-h-0 overflow-auto px-6 py-5">
            {shouldShowStorageSection ? (
              <>
                <div className="mb-4 max-w-[620px]">
                  <h2 className="text-[15px] font-semibold">存储</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    选择上传资源的默认存储方式。本期仅启用工作区本地存储。
                  </p>
                </div>

                <div className="max-w-[620px] space-y-5">
                  <div className="grid grid-cols-[136px_minmax(0,320px)] items-center gap-3">
                    <label
                      className="text-sm text-foreground"
                      htmlFor="storage-provider"
                    >
                      全局存储方式
                    </label>
                    <Select
                      value={settings.storage.defaultProvider}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          schemaVersion: 1,
                          storage: { defaultProvider: value as 'local' },
                        })
                      }
                    >
                      <SelectTrigger
                        id="storage-provider"
                        aria-label="全局存储方式"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">
                          <span className="flex items-center gap-2">
                            <FolderArchive size={15} />
                            本地存储
                          </span>
                        </SelectItem>
                        <SelectItem value="oss" disabled>
                          <span className="flex items-center gap-2">
                            <Cloud size={15} />
                            OSS 存储
                          </span>
                        </SelectItem>
                        <SelectItem value="api" disabled>
                          <span className="flex items-center gap-2">
                            <Server size={15} />
                            自定义 API
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t pt-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-medium">本地存储配置</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        上传文件跟随当前工作区保存，文档中仅写入稳定的资源引用。
                      </p>
                    </div>

                    <div className="grid gap-2">
                      {visibleStorageFields.map((field) => (
                        <ReadonlyField
                          key={field.id}
                          label={field.label}
                          value={field.value(assetDirectory)}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className={cn(
                      'min-h-8 rounded-md px-2.5 py-1.5 text-xs',
                      errorMessage
                        ? 'border border-destructive/40 text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {errorMessage ??
                      (saveState === 'saved'
                        ? '设置已保存。'
                        : '当前配置会作为全局上传默认值。')}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full max-w-[620px] flex-col items-center justify-center text-center">
                <Search className="mb-3 text-muted-foreground" size={26} />
                <h2 className="text-sm font-medium">未找到设置</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  没有匹配“{searchQuery}”的设置项。
                </p>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="mx-0 mb-0 min-h-13 rounded-none px-5 py-3">
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            disabled={loadState === 'loading' || saveState === 'saving'}
            size="sm"
            type="button"
            onClick={() => void handleApply()}
          >
            应用
          </Button>
          <Button
            disabled={loadState === 'loading' || saveState === 'saving'}
            size="sm"
            type="button"
            onClick={async () => {
              await handleApply();
              onOpenChange(false);
            }}
          >
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizeSearchTerm(term: string) {
  return term.trim().toLowerCase();
}

function matchesSearchTerms(query: string, terms: string[]) {
  if (!query) {
    return true;
  }

  return terms.some((term) => normalizeSearchTerm(term).includes(query));
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid grid-cols-[136px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        className="h-8 rounded-md bg-muted/20 font-mono text-xs"
        readOnly
        value={value}
      />
    </label>
  );
}

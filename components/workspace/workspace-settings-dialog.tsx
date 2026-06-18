'use client';

import * as React from 'react';
import {
  Cloud,
  Database,
  FolderArchive,
  Monitor,
  Moon,
  Palette,
  Search,
  Server,
  Sun,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';

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
import type { AppSettings, PageWidthMode } from './workspace-types';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  workspaceRootPath: string | null;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

type SettingsSectionId = 'appearance' | 'storage';

const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
  appearance: {
    pageWidthMode: 'wide',
  },
};

const APPEARANCE_SEARCH_TERMS = [
  '外观',
  '主题',
  '亮色',
  '暗色',
  '系统',
  '跟随系统',
  '页面宽度',
  '文档宽度',
  '阅读宽度',
  '标准',
  '全宽',
  '75%',
];

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

const SETTINGS_SECTIONS = [
  {
    id: 'appearance' as const,
    label: '外观',
    terms: APPEARANCE_SEARCH_TERMS,
  },
  {
    id: 'storage' as const,
    label: '存储',
    terms: STORAGE_SEARCH_TERMS,
  },
];

const APPEARANCE_FIELD_DEFINITIONS = [
  {
    id: 'theme',
    label: '主题',
    terms: ['主题', '亮色', '暗色', '系统', '跟随系统', 'light', 'dark', 'system'],
  },
  {
    id: 'page-width',
    label: '页面宽度',
    terms: ['页面宽度', '文档宽度', '阅读宽度', '标准', '全宽', '75%'],
  },
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
  const { setTheme, theme } = useTheme();
  const [settings, setSettings] =
    React.useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [activeSectionId, setActiveSectionId] =
    React.useState<SettingsSectionId>('appearance');
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
  const appearanceSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    SETTINGS_SECTIONS[0].terms,
  );
  const matchingAppearanceFields = hasSearchQuery
    ? APPEARANCE_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : APPEARANCE_FIELD_DEFINITIONS;
  const shouldShowAppearanceSection =
    !hasSearchQuery ||
    appearanceSectionMatches ||
    matchingAppearanceFields.length > 0;
  const visibleAppearanceFields =
    hasSearchQuery &&
    matchingAppearanceFields.length > 0 &&
    !appearanceSectionMatches
      ? matchingAppearanceFields
      : APPEARANCE_FIELD_DEFINITIONS;
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
  const visibleSections = SETTINGS_SECTIONS.filter((section) =>
    section.id === 'appearance'
      ? shouldShowAppearanceSection
      : shouldShowStorageSection,
  );
  const activeSection = visibleSections.some(
    (section) => section.id === activeSectionId,
  )
    ? activeSectionId
    : visibleSections[0]?.id;

  React.useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!open) {
        return;
      }

      setSearchQuery('');
      setActiveSectionId('appearance');
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
          setSettings(withDefaultAppSettings(nextSettings));
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

  function updatePageWidthMode(pageWidthMode: PageWidthMode) {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        pageWidthMode,
      },
    }));
  }

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

      setSettings(withDefaultAppSettings(savedSettings));
      onSettingsSaved?.(withDefaultAppSettings(savedSettings));
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
            配置应用外观、上传和资源存储方式。
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

            <div className="grid gap-1">
              {visibleSections.map((section) => (
                <button
                  key={section.id}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors',
                    activeSection === section.id
                      ? 'bg-[#3574f0] text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground',
                  )}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                >
                  {section.id === 'appearance' ? (
                    <Palette size={15} />
                  ) : (
                    <Database size={15} />
                  )}
                  {section.label}
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-auto px-6 py-5">
            {activeSection === 'appearance' ? (
              <AppearanceSettingsSection
                errorMessage={errorMessage}
                pageWidthMode={settings.appearance.pageWidthMode}
                saveState={saveState}
                theme={theme ?? 'system'}
                visibleFields={visibleAppearanceFields.map((field) => field.id)}
                onPageWidthModeChange={updatePageWidthMode}
                onThemeChange={setTheme}
              />
            ) : null}

            {activeSection === 'storage' ? (
              <StorageSettingsSection
                assetDirectory={assetDirectory}
                errorMessage={errorMessage}
                saveState={saveState}
                settings={settings}
                visibleFields={visibleStorageFields}
                onStorageProviderChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    schemaVersion: 1,
                    storage: { defaultProvider: value },
                  }))
                }
              />
            ) : null}

            {!activeSection ? (
              <div className="flex h-full max-w-[620px] flex-col items-center justify-center text-center">
                <Search className="mb-3 text-muted-foreground" size={26} />
                <h2 className="text-sm font-medium">未找到设置</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  没有匹配“{searchQuery}”的设置项。
                </p>
              </div>
            ) : null}
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

function AppearanceSettingsSection({
  errorMessage,
  pageWidthMode,
  saveState,
  theme,
  visibleFields,
  onPageWidthModeChange,
  onThemeChange,
}: {
  errorMessage: string | null;
  pageWidthMode: PageWidthMode;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  theme: string;
  visibleFields: string[];
  onPageWidthModeChange: (pageWidthMode: PageWidthMode) => void;
  onThemeChange: (theme: string) => void;
}) {
  const showTheme = visibleFields.includes('theme');
  const showPageWidth = visibleFields.includes('page-width');

  return (
    <>
      <div className="mb-5 max-w-[620px]">
        <h2 className="text-[15px] font-semibold">外观</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          调整应用主题和编辑器页面宽度。
        </p>
      </div>

      <div className="max-w-[620px] space-y-6">
        {showTheme ? (
          <section className={cn(showPageWidth && 'border-b pb-5')}>
            <h3 className="text-sm font-medium">主题</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              跟随系统会同步当前操作系统外观。
            </p>
            <div className="mt-3 grid w-fit grid-cols-3 rounded-md border bg-muted/30 p-0.5">
              <SegmentedRadioButton
                checked={theme === 'system'}
                icon={<Monitor size={14} />}
                label="跟随系统"
                onClick={() => onThemeChange('system')}
              />
              <SegmentedRadioButton
                checked={theme === 'light'}
                icon={<Sun size={14} />}
                label="亮色"
                onClick={() => onThemeChange('light')}
              />
              <SegmentedRadioButton
                checked={theme === 'dark'}
                icon={<Moon size={14} />}
                label="暗色"
                onClick={() => onThemeChange('dark')}
              />
            </div>
          </section>
        ) : null}

        {showPageWidth ? (
          <section>
            <h3 className="text-sm font-medium">页面宽度</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              控制文档正文宽度，不改变左右侧栏宽度。
            </p>
            <div className="mt-3 grid w-fit grid-cols-2 rounded-md border bg-muted/30 p-0.5">
              <SegmentedRadioButton
                checked={pageWidthMode === 'standard'}
                label="标准"
                onClick={() => onPageWidthModeChange('standard')}
              />
              <SegmentedRadioButton
                checked={pageWidthMode === 'wide'}
                label="全宽"
                onClick={() => onPageWidthModeChange('wide')}
              />
            </div>
          </section>
        ) : null}

        <SettingsFeedback
          defaultMessage="当前配置会作为全局外观默认值。"
          errorMessage={errorMessage}
          saveState={saveState}
        />
      </div>
    </>
  );
}

function StorageSettingsSection({
  assetDirectory,
  errorMessage,
  saveState,
  settings,
  visibleFields,
  onStorageProviderChange,
}: {
  assetDirectory: string;
  errorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  settings: AppSettings;
  visibleFields: typeof STORAGE_FIELD_DEFINITIONS;
  onStorageProviderChange: (value: 'local') => void;
}) {
  return (
    <>
      <div className="mb-4 max-w-[620px]">
        <h2 className="text-[15px] font-semibold">存储</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          选择上传资源的默认存储方式。本期仅启用工作区本地存储。
        </p>
      </div>

      <div className="max-w-[620px] space-y-5">
        <div className="grid grid-cols-[136px_minmax(0,320px)] items-center gap-3">
          <label className="text-sm text-foreground" htmlFor="storage-provider">
            全局存储方式
          </label>
          <Select
            value={settings.storage.defaultProvider}
            onValueChange={(value) =>
              onStorageProviderChange(value as 'local')
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
            {visibleFields.map((field) => (
              <ReadonlyField
                key={field.id}
                label={field.label}
                value={field.value(assetDirectory)}
              />
            ))}
          </div>
        </div>

        <SettingsFeedback
          defaultMessage="当前配置会作为全局上传默认值。"
          errorMessage={errorMessage}
          saveState={saveState}
        />
      </div>
    </>
  );
}

function SettingsFeedback({
  defaultMessage,
  errorMessage,
  saveState,
}: {
  defaultMessage: string;
  errorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}) {
  return (
    <div
      aria-live="polite"
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
          : saveState === 'saving'
            ? '正在保存设置...'
            : defaultMessage)}
    </div>
  );
}

function SegmentedRadioButton({
  checked,
  icon,
  label,
  onClick,
}: {
  checked: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        'flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-[5px] px-3 text-xs transition-colors',
        checked
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      role="radio"
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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

function withDefaultAppSettings(settings: AppSettings): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    storage: {
      ...DEFAULT_APP_SETTINGS.storage,
      ...settings.storage,
    },
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      ...settings.appearance,
    },
  };
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

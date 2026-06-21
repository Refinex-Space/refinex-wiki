'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  FolderArchive,
  GitBranch,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Server,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { WorkspaceResizeHandle } from './workspace-resize-handle';
import {
  detectAiAccounts,
  deleteAiProviderSecret,
  ensureWorkspace,
  gitProbe,
  gitRemoteInfo,
  gitSyncNow,
  getAiProviderSecretStatus,
  isTauriRuntime,
  listAiAgentProfiles,
  listSystemFonts,
  readAppSettings,
  saveAppSettings,
  saveWorkspaceGitSyncSettings,
  saveAiProviderSecret,
} from './workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from './workspace-settings';
import type {
  AiConfiguredProfile,
  AppearanceFontSettings,
  AppSettings,
  GitProbe,
  GitRemoteInfo,
  GitSyncConflictResolution,
  PageWidthMode,
  SystemFontOptions,
  WorkspaceGitSyncSettings,
} from './workspace-types';
import type {
  AiAgentProfile,
  AiAssistantAccount,
} from './ai-panel/ai-types';
import type {
  AiProviderConfig,
  AiProviderSecretStatus,
  AiProviderSettings,
} from './ai-provider/provider-types';

interface WorkspaceSettingsPageProps {
  header?: React.ReactNode;
  initialSectionId?: SettingsSectionId;
  sidebarResize?: {
    max: number;
    min: number;
    onResize: (width: number) => void;
  };
  sidebarWidth?: number;
  workspaceRootPath: string | null;
  onBack: () => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

type SettingsSectionId = 'appearance' | 'storage' | 'git-sync' | 'ai';

const APPEARANCE_SEARCH_TERMS = [
  '外观',
  '主题',
  '字体',
  'UI 字体',
  '文档字体',
  '代码块字体',
  'font',
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

const FALLBACK_SYSTEM_FONT_OPTIONS: SystemFontOptions = {
  code: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'Monaco'],
  document: [
    'Songti SC',
    'PingFang SC',
    'Microsoft YaHei',
    'Noto Serif CJK SC',
    'SimSun',
  ],
  recommendations: DEFAULT_APP_SETTINGS.appearance.fonts,
  ui: [
    'SF Pro Text',
    'PingFang SC',
    'Microsoft YaHei',
    'Segoe UI',
    'Geist',
  ],
};

const DEFAULT_GIT_SYNC_SETTINGS: WorkspaceGitSyncSettings = {
  conflictResolution: 'abort',
  enabled: true,
  intervalMinutes: 10,
  lastSyncedAt: null,
};

const DEFAULT_GIT_REMOTE_INFO: GitRemoteInfo = {
  remoteUrl: null,
  webUrl: null,
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

const GIT_SYNC_SEARCH_TERMS = [
  'git',
  'Git',
  'Git Sync',
  '同步',
  '远程仓库',
  'remote',
  'repository',
  '上次同步',
  '同步频率',
  '冲突',
  '差异',
  '立即同步',
  '移除',
];

const AI_SEARCH_TERMS = [
  'ai',
  'AI',
  '模型',
  '供应商',
  'Providers',
  'provider',
  'model',
  'runtime',
  'agent',
  'API Key',
  'Secret',
  'Fake Echo',
  'Local',
  'Codex',
  'Claude',
  'Accounts',
  'Models',
  '测试运行时',
  '启用模型',
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
  {
    id: 'git-sync' as const,
    label: 'Git Sync',
    terms: GIT_SYNC_SEARCH_TERMS,
  },
  {
    id: 'ai' as const,
    label: 'AI',
    terms: AI_SEARCH_TERMS,
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
  {
    id: 'ui-font',
    label: 'UI 字体',
    terms: ['字体', 'UI 字体', '界面字体', '侧边栏字体', '系统字体', 'font'],
  },
  {
    id: 'document-font',
    label: '文档字体',
    terms: ['字体', '文档字体', '编辑器字体', '正文字体', '阅读字体', 'font'],
  },
  {
    id: 'code-font',
    label: '代码块字体',
    terms: ['字体', '代码块字体', '等宽字体', 'monospace', 'code font', 'font'],
  },
];

const STORAGE_FIELD_DEFINITIONS = [
  {
    id: 'asset-directory',
    label: '资源目录',
    value: (assetDirectory: string) => assetDirectory,
    terms: ['资源目录', '目录', '路径', '本地', 'assets', '.madora'],
  },
  {
    id: 'asset-url',
    label: '引用格式',
    value: () => 'madora-asset://{assetId}',
    terms: ['引用格式', '引用', '格式', 'url', 'assetid', 'madora-asset'],
  },
  {
    id: 'cleanup-policy',
    label: '清理策略',
    value: () => '保存或删除文档时清理未引用资源',
    terms: ['清理策略', '清理', '删除', '孤立资源'],
  },
];

const GIT_SYNC_FIELD_DEFINITIONS = [
  {
    id: 'enabled',
    label: '启用 Git 同步',
    terms: ['启用 Git 同步', '开关', 'Git Sync', 'manage git', 'auto sync'],
  },
  {
    id: 'remote-url',
    label: '远程仓库地址',
    terms: ['远程仓库地址', 'remote url', 'repository', '仓库地址', '跳转'],
  },
  {
    id: 'last-synced',
    label: '上次同步时间',
    terms: ['上次同步时间', 'last synced', '同步时间'],
  },
  {
    id: 'interval',
    label: '同步频率',
    terms: ['同步频率', 'backup interval', 'minutes', '分钟'],
  },
  {
    id: 'conflict-resolution',
    label: '差异处理策略',
    terms: ['差异处理策略', '冲突', '放弃', '本地仓库', '远程仓库'],
  },
  {
    id: 'sync-now',
    label: '立即同步',
    terms: ['立即同步', 'sync now', 'pull', 'push'],
  },
  {
    id: 'remove',
    label: '移除',
    terms: ['移除', 'remove', '关闭管理'],
  },
];

const AI_FIELD_DEFINITIONS = [
  {
    id: 'enabled-profile',
    label: '启用模型',
    terms: ['启用模型', '默认模型', 'profile', 'agent', '模型'],
  },
  {
    id: 'provider',
    label: '供应商',
    terms: ['供应商', 'provider', 'Providers', 'OpenAI', 'Anthropic', 'Ollama'],
  },
  {
    id: 'model',
    label: '模型 ID',
    terms: ['模型', 'model', '默认模型', 'fake-echo'],
  },
  {
    id: 'secret',
    label: 'API Key',
    terms: ['API Key', 'Secret', '密钥', 'key', 'token'],
  },
  {
    id: 'runtime',
    label: '运行方式',
    terms: ['运行方式', 'runtime', '测试运行时', 'fake'],
  },
];

export function WorkspaceSettingsPage({
  header,
  initialSectionId = 'appearance',
  sidebarResize,
  sidebarWidth = 280,
  workspaceRootPath,
  onBack,
  onSettingsSaved,
}: WorkspaceSettingsPageProps) {
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
  const [detectedAccounts, setDetectedAccounts] = React.useState<
    AiAssistantAccount[]
  >([]);
  const [gitSyncSettings, setGitSyncSettings] =
    React.useState<WorkspaceGitSyncSettings>(DEFAULT_GIT_SYNC_SETTINGS);
  const [gitProbeState, setGitProbeState] = React.useState<GitProbe | null>(
    null,
  );
  const [gitRemoteState, setGitRemoteState] = React.useState<GitRemoteInfo>(
    DEFAULT_GIT_REMOTE_INFO,
  );
  const [gitSyncActionState, setGitSyncActionState] = React.useState<
    'idle' | 'saving' | 'syncing' | 'saved' | 'synced' | 'error'
  >('idle');
  const [gitSyncMessage, setGitSyncMessage] = React.useState<string | null>(
    null,
  );
  const [systemFonts, setSystemFonts] = React.useState<SystemFontOptions>(
    FALLBACK_SYSTEM_FONT_OPTIONS,
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const assetDirectory = workspaceRootPath
    ? `${workspaceRootPath}/.madora/assets`
    : '打开工作区后使用 .madora/assets';
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
  const gitSyncSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    GIT_SYNC_SEARCH_TERMS,
  );
  const matchingGitSyncFields = hasSearchQuery
    ? GIT_SYNC_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : GIT_SYNC_FIELD_DEFINITIONS;
  const shouldShowGitSyncSection =
    !hasSearchQuery ||
    gitSyncSectionMatches ||
    matchingGitSyncFields.length > 0;
  const visibleGitSyncFields =
    hasSearchQuery &&
    matchingGitSyncFields.length > 0 &&
    !gitSyncSectionMatches
      ? matchingGitSyncFields
      : GIT_SYNC_FIELD_DEFINITIONS;
  const aiSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    AI_SEARCH_TERMS,
  );
  const matchingAiFields = hasSearchQuery
    ? AI_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : AI_FIELD_DEFINITIONS;
  const shouldShowAiSection =
    !hasSearchQuery || aiSectionMatches || matchingAiFields.length > 0;
  const visibleAiFields =
    hasSearchQuery && matchingAiFields.length > 0 && !aiSectionMatches
      ? matchingAiFields
      : AI_FIELD_DEFINITIONS;
  const visibleSections = SETTINGS_SECTIONS.filter((section) =>
    section.id === 'appearance'
      ? shouldShowAppearanceSection
      : section.id === 'storage'
        ? shouldShowStorageSection
        : section.id === 'git-sync'
          ? shouldShowGitSyncSection
          : shouldShowAiSection,
  );
  const activeSection = visibleSections.some(
    (section) => section.id === activeSectionId,
  )
    ? activeSectionId
    : visibleSections[0]?.id;

  React.useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setSearchQuery('');
      setActiveSectionId(initialSectionId);
      setLoadState('loading');
      setSaveState('idle');
      setErrorMessage(null);

      if (!isTauriRuntime()) {
        setSettings(DEFAULT_APP_SETTINGS);
        setDetectedAccounts([]);
        setGitSyncSettings(DEFAULT_GIT_SYNC_SETTINGS);
        setGitProbeState(null);
        setGitRemoteState(DEFAULT_GIT_REMOTE_INFO);
        setGitSyncActionState('idle');
        setGitSyncMessage(null);
        setSystemFonts(FALLBACK_SYSTEM_FONT_OPTIONS);
        setLoadState('loaded');
        return;
      }

      try {
        const [
          nextSettings,
          workspaceMetadata,
          nextGitProbe,
          nextGitRemote,
          runtimeProfiles,
          nextDetectedAccounts,
          nextSystemFonts,
        ] =
          await Promise.all([
            readAppSettings(),
            workspaceRootPath
              ? ensureWorkspace(workspaceRootPath)
              : Promise.resolve(null),
            workspaceRootPath
              ? Promise.resolve(gitProbe(workspaceRootPath)).catch(() => null)
              : Promise.resolve(null),
            workspaceRootPath
              ? Promise.resolve(gitRemoteInfo(workspaceRootPath)).catch(
                  () => DEFAULT_GIT_REMOTE_INFO,
                )
              : Promise.resolve(DEFAULT_GIT_REMOTE_INFO),
            workspaceRootPath
              ? listAiAgentProfiles(workspaceRootPath)
              : Promise.resolve([]),
            detectAiAccounts(),
            listSystemFonts().catch(() => FALLBACK_SYSTEM_FONT_OPTIONS),
          ]);

        if (!cancelled) {
          const normalizedSettings = withDefaultAppSettings(nextSettings);

          setSettings(
            mergeRuntimeAiProfiles(normalizedSettings, runtimeProfiles),
          );
          setGitSyncSettings(
            withDefaultGitSyncSettings(workspaceMetadata?.gitSync),
          );
          setGitProbeState(nextGitProbe);
          setGitRemoteState(nextGitRemote);
          setGitSyncActionState('idle');
          setGitSyncMessage(null);
          setDetectedAccounts(nextDetectedAccounts);
          setSystemFonts(mergeSystemFontOptions(nextSystemFonts));
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
  }, [initialSectionId, workspaceRootPath]);

  function updatePageWidthMode(pageWidthMode: PageWidthMode) {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        pageWidthMode,
      },
    }));
  }

  function updateAppearanceFont(
    fontKey: keyof AppearanceFontSettings,
    fontFamily: string,
  ) {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        fonts: {
          ...current.appearance.fonts,
          [fontKey]: fontFamily,
        },
      },
    }));
  }

  function updateEnabledAiProfile(enabledProfileId: string | null) {
    setSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        enabledProfileId,
        profiles: current.ai.profiles.map((profile) => ({
          ...profile,
          enabled: profile.id === enabledProfileId,
        })),
      },
      schemaVersion: 1,
    }));
  }

  function updateAiProviderSettings(providers: AiProviderSettings) {
    setSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        providers,
      },
      schemaVersion: 1,
    }));
  }

  function updateGitSyncSettings(
    updater: (settings: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings,
  ) {
    setGitSyncSettings((current) => withDefaultGitSyncSettings(updater(current)));
    setGitSyncActionState('idle');
    setGitSyncMessage(null);
  }

  async function persistGitSyncSettings(
    nextSettings = gitSyncSettings,
  ): Promise<WorkspaceGitSyncSettings> {
    const normalized = withDefaultGitSyncSettings(nextSettings);

    if (!isTauriRuntime() || !workspaceRootPath) {
      setGitSyncSettings(normalized);
      return normalized;
    }

    const saved = await saveWorkspaceGitSyncSettings(
      workspaceRootPath,
      normalized,
    );

    setGitSyncSettings(withDefaultGitSyncSettings(saved));

    return withDefaultGitSyncSettings(saved);
  }

  async function handleGitSyncNow() {
    if (!workspaceRootPath) {
      return;
    }

    setGitSyncActionState('syncing');
    setGitSyncMessage(null);

    try {
      const saved = await persistGitSyncSettings(gitSyncSettings);
      const result = await gitSyncNow(workspaceRootPath, saved.conflictResolution);
      const nextSettings = {
        ...saved,
        lastSyncedAt: result.lastSyncedAt,
      };

      await persistGitSyncSettings(nextSettings);
      setGitSyncActionState('synced');
      setGitSyncMessage(`同步完成：${formatGitSyncTimestamp(result.lastSyncedAt)}`);
    } catch (error) {
      setGitSyncActionState('error');
      setGitSyncMessage(
        error instanceof Error ? error.message : 'Git Sync 同步失败',
      );
    }
  }

  async function handleGitSyncRemove() {
    const nextSettings = {
      ...gitSyncSettings,
      enabled: false,
    };

    setGitSyncActionState('saving');
    setGitSyncMessage(null);

    try {
      await persistGitSyncSettings(nextSettings);
      setGitSyncActionState('saved');
      setGitSyncMessage('已关闭 Git Sync 管理，仓库内容保持不变。');
    } catch (error) {
      setGitSyncActionState('error');
      setGitSyncMessage(
        error instanceof Error ? error.message : '无法关闭 Git Sync',
      );
    }
  }

  async function handleApply() {
    setSaveState('saving');
    setGitSyncActionState('saving');
    setErrorMessage(null);
    setGitSyncMessage(null);

    if (!isTauriRuntime()) {
      setSaveState('saved');
      setGitSyncActionState('saved');
      onSettingsSaved?.(settings);
      return;
    }

    try {
      const [savedSettings] = await Promise.all([
        saveAppSettings(settings),
        persistGitSyncSettings(gitSyncSettings),
      ]);

      setSettings(withDefaultAppSettings(savedSettings));
      onSettingsSaved?.(withDefaultAppSettings(savedSettings));
      setSaveState('saved');
      setGitSyncActionState('saved');
    } catch (error) {
      setSaveState('error');
      setGitSyncActionState('error');
      setErrorMessage(error instanceof Error ? error.message : '无法保存应用设置');
    }
  }

  return (
    <section
      aria-label="设置"
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-sidebar"
      data-testid="workspace-settings-page"
    >
      <aside
        className="flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
        data-testid="workspace-settings-sidebar"
        style={{ width: sidebarWidth }}
      >
        <header
          className="h-10 shrink-0"
          data-tauri-drag-region="deep"
        />

        <div className="px-2 pb-2 pr-4">
          <button
            aria-label="返回应用"
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            <span>返回应用</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4 pr-4">
          <label className="flex h-8 items-center gap-2 rounded-md border border-sidebar-border/60 bg-background/70 px-2 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
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
            <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
              个人
            </p>
            {visibleSections.map((section) => (
              <button
                key={section.id}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors',
                  activeSection === section.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
                )}
                type="button"
                onClick={() => setActiveSectionId(section.id)}
              >
                <SettingsSectionIcon sectionId={section.id} />
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {sidebarResize ? (
        <WorkspaceResizeHandle
          aria-label="调整设置侧栏宽度"
          className="-mx-2"
          direction="left"
          max={sidebarResize.max}
          min={sidebarResize.min}
          value={sidebarWidth}
          onResize={sidebarResize.onResize}
        />
      ) : null}

      <div
        className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_1px_3px_rgba(15,23,42,0.05),0_18px_42px_-28px_rgba(15,23,42,0.45)]"
        data-testid="workspace-editor-column"
      >
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
          data-chrome="codex-main-surface"
          data-testid="workspace-settings-main-surface"
        >
          {header}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1120px] px-8 py-10 pb-24">
              {activeSection === 'appearance' ? (
                <AppearanceSettingsSection
                  errorMessage={errorMessage}
                  fontOptions={systemFonts}
                  fontSettings={settings.appearance.fonts}
                  pageWidthMode={settings.appearance.pageWidthMode}
                  saveState={saveState}
                  theme={theme ?? 'system'}
                  visibleFields={visibleAppearanceFields.map(
                    (field) => field.id,
                  )}
                  onFontChange={updateAppearanceFont}
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

              {activeSection === 'git-sync' ? (
                <GitSyncSettingsSection
                  actionMessage={gitSyncMessage}
                  actionState={gitSyncActionState}
                  gitProbe={gitProbeState}
                  remoteInfo={gitRemoteState}
                  settings={gitSyncSettings}
                  visibleFields={visibleGitSyncFields.map((field) => field.id)}
                  onRemove={() => void handleGitSyncRemove()}
                  onSettingsChange={updateGitSyncSettings}
                  onSyncNow={() => void handleGitSyncNow()}
                />
              ) : null}

              {activeSection === 'ai' ? (
                <AiSettingsSection
                  errorMessage={errorMessage}
                  saveState={saveState}
                  detectedAccounts={detectedAccounts}
                  settings={settings}
                  visibleFields={visibleAiFields.map((field) => field.id)}
                  onEnabledProfileChange={updateEnabledAiProfile}
                  onProviderSettingsChange={updateAiProviderSettings}
                />
              ) : null}

              {!activeSection ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Search className="mb-3 text-muted-foreground" size={26} />
                  <h2 className="text-sm font-medium">未找到设置</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    没有匹配“{searchQuery}”的设置项。
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="flex min-h-13 shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
            <Button size="sm" type="button" variant="outline" onClick={onBack}>
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
                onBack();
              }}
            >
              确定
            </Button>
          </footer>
        </section>
      </div>
    </section>
  );
}

function AppearanceSettingsSection({
  errorMessage,
  fontOptions,
  fontSettings,
  pageWidthMode,
  saveState,
  theme,
  visibleFields,
  onFontChange,
  onPageWidthModeChange,
  onThemeChange,
}: {
  errorMessage: string | null;
  fontOptions: SystemFontOptions;
  fontSettings: AppearanceFontSettings;
  pageWidthMode: PageWidthMode;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  theme: string;
  visibleFields: string[];
  onFontChange: (
    fontKey: keyof AppearanceFontSettings,
    fontFamily: string,
  ) => void;
  onPageWidthModeChange: (pageWidthMode: PageWidthMode) => void;
  onThemeChange: (theme: string) => void;
}) {
  const showTheme = visibleFields.includes('theme');
  const showPageWidth = visibleFields.includes('page-width');
  const showFonts = visibleFields.some((field) =>
    ['ui-font', 'document-font', 'code-font'].includes(field),
  );

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
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ThemePreviewRadioButton
                checked={theme === 'system'}
                label="跟随系统"
                testId="theme-preview-system"
                variant="system"
                onClick={() => onThemeChange('system')}
              />
              <ThemePreviewRadioButton
                checked={theme === 'light'}
                label="亮色"
                testId="theme-preview-light"
                variant="light"
                onClick={() => onThemeChange('light')}
              />
              <ThemePreviewRadioButton
                checked={theme === 'dark'}
                label="暗色"
                testId="theme-preview-dark"
                variant="dark"
                onClick={() => onThemeChange('dark')}
              />
            </div>
          </section>
        ) : null}

        {showPageWidth ? (
          <section className={cn(showFonts && 'border-b pb-5')}>
            <h3 className="text-sm font-medium">页面宽度</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              控制文档正文宽度，不改变左右侧栏宽度。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <PageWidthPreviewRadioButton
                checked={pageWidthMode === 'standard'}
                label="标准"
                testId="page-width-preview-standard"
                variant="standard"
                onClick={() => onPageWidthModeChange('standard')}
              />
              <PageWidthPreviewRadioButton
                checked={pageWidthMode === 'wide'}
                label="全宽"
                testId="page-width-preview-wide"
                variant="wide"
                onClick={() => onPageWidthModeChange('wide')}
              />
            </div>
          </section>
        ) : null}

        {showFonts ? (
          <section>
            <h3 className="text-sm font-medium">字体</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              分别控制系统界面、文档正文和代码块字体。
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border">
              {visibleFields.includes('ui-font') ? (
                <FontSettingRow
                  description="侧边栏、工具栏、设置面板等编辑器以外的界面文本。"
                  label="UI 字体"
                  options={fontOptions.ui}
                  sample="Madora · 本地知识库"
                  value={fontSettings.ui}
                  onChange={(value) => onFontChange('ui', value)}
                />
              ) : null}
              {visibleFields.includes('document-font') ? (
                <FontSettingRow
                  description="编辑器和阅览模式中的文章正文。"
                  label="文档字体"
                  options={fontOptions.document}
                  sample="先让它存在，再把它做好。"
                  value={fontSettings.document}
                  onChange={(value) => onFontChange('document', value)}
                />
              ) : null}
              {visibleFields.includes('code-font') ? (
                <FontSettingRow
                  description="代码块、行内代码、快捷键和等宽文本。"
                  label="代码块字体"
                  options={fontOptions.code}
                  sample="const note = markdown;"
                  value={fontSettings.code}
                  onChange={(value) => onFontChange('code', value)}
                />
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              默认搭配优先使用系统原生 UI 字体、中文文章字体和专业等宽代码字体。
            </p>
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

function FontSettingRow({
  description,
  label,
  options,
  sample,
  value,
  onChange,
}: {
  description: string;
  label: string;
  options: string[];
  sample: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalizedOptions = ensureFontOption(options, value);

  return (
    <div className="grid gap-3 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
        <p
          className="mt-2 truncate text-sm text-foreground/85"
          style={{ fontFamily: buildPreviewFontStack(value) }}
        >
          {sample}
        </p>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-9 w-full bg-background/70 transition-[background-color,border-color,box-shadow] hover:border-ring/45 hover:bg-accent/60 hover:text-accent-foreground hover:shadow-sm data-[state=open]:border-ring/60 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="end"
          className="max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[22rem] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain p-1"
          data-testid={`font-select-content-${label}`}
          position="popper"
        >
          {normalizedOptions.map((fontFamily) => (
            <SelectItem
              className="min-h-8 px-2 pr-8 text-sm transition-colors hover:bg-accent/70 hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              key={fontFamily}
              value={fontFamily}
            >
              <span style={{ fontFamily: buildPreviewFontStack(fontFamily) }}>
                {fontFamily}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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

function GitSyncSettingsSection({
  actionMessage,
  actionState,
  gitProbe,
  remoteInfo,
  settings,
  visibleFields,
  onRemove,
  onSettingsChange,
  onSyncNow,
}: {
  actionMessage: string | null;
  actionState: 'idle' | 'saving' | 'syncing' | 'saved' | 'synced' | 'error';
  gitProbe: GitProbe | null;
  remoteInfo: GitRemoteInfo;
  settings: WorkspaceGitSyncSettings;
  visibleFields: string[];
  onRemove: () => void;
  onSettingsChange: (
    updater: (settings: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings,
  ) => void;
  onSyncNow: () => void;
}) {
  const gitAvailable = gitProbe?.gitAvailable ?? true;
  const isRepository = gitProbe?.isRepository ?? false;
  const enabled = settings.enabled && gitAvailable;
  const isSyncing = actionState === 'syncing';
  const canSync =
    enabled &&
    isRepository &&
    Boolean(remoteInfo.remoteUrl) &&
    !isSyncing &&
    actionState !== 'saving';
  const showEnabled = visibleFields.includes('enabled');
  const showRemoteUrl = visibleFields.includes('remote-url');
  const showLastSynced = visibleFields.includes('last-synced');
  const showInterval = visibleFields.includes('interval');
  const showConflictResolution = visibleFields.includes('conflict-resolution');
  const showSyncNow = visibleFields.includes('sync-now');
  const showRemove = visibleFields.includes('remove');

  return (
    <div
      className="max-w-[1120px] space-y-6 pb-8"
      data-testid="git-sync-settings-shell"
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Git Sync</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          通过 Git 远程仓库同步当前工作区。
        </p>
      </div>

      <div className="space-y-6">
        {!gitAvailable ? (
          <div className="rounded-xl bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            未检测到本机 Git 命令。安装 Git 后会默认启用 Git Sync。
          </div>
        ) : null}

        {showEnabled ? (
          <section
            className="rounded-xl bg-muted/30"
            data-testid="git-sync-enable-card"
          >
            <SettingRow
              description="显示 Git Sync 控制项，并允许 Madora 提交、拉取和推送这个工作区。"
              label="启用 Git 同步"
              control={
                <PillSwitch
                  checked={enabled}
                  disabled={!gitAvailable}
                  label="启用 Git 同步"
                  onChange={(checked) =>
                    onSettingsChange((current) => ({
                      ...current,
                      enabled: checked,
                    }))
                  }
                />
              }
            />
          </section>
        ) : null}

        {showRemoteUrl || showLastSynced ? (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground">仓库</h3>
            <div
              className="mt-2 overflow-hidden rounded-xl bg-muted/30"
              data-testid="git-sync-repository-card"
            >
              {showRemoteUrl ? (
                <div className="grid gap-3 border-b border-border/60 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                  <span className="text-muted-foreground">远程仓库地址</span>
                  <div className="flex min-w-0 items-center gap-3 sm:justify-end">
                    <code
                      className="min-w-0 break-all font-mono text-sm leading-6 text-foreground sm:text-right"
                      data-testid="git-sync-remote-url"
                    >
                      {remoteInfo.remoteUrl ?? '未检测到 origin remote'}
                    </code>
                    {remoteInfo.webUrl ? (
                      <a
                        aria-label="打开远程仓库"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        href={remoteInfo.webUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {showLastSynced ? (
                <div className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                  <span className="text-muted-foreground">上次同步时间</span>
                  <span
                    className="min-w-0 leading-6 text-foreground sm:text-right"
                    data-testid="git-sync-last-synced"
                  >
                    {settings.lastSyncedAt
                      ? formatGitSyncTimestamp(settings.lastSyncedAt)
                      : '尚未同步'}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {showInterval || showConflictResolution || showSyncNow ? (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground">
              同步偏好
            </h3>
            <div
              className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/30"
              data-testid="git-sync-preferences-card"
            >
              {showInterval ? (
                <SettingRow
                  description="自动同步当前工作区的时间间隔。"
                  label="同步频率"
                  control={
                    <Select
                      value={String(settings.intervalMinutes)}
                      onValueChange={(value) =>
                        onSettingsChange((current) => ({
                          ...current,
                          intervalMinutes: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label="同步频率"
                        className="h-10 w-full min-w-[180px] rounded-lg border-border/80 bg-background/80 sm:w-[180px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="end"
                        avoidCollisions={false}
                        data-testid="git-sync-interval-content"
                        position="popper"
                        side="bottom"
                        sideOffset={4}
                      >
                        {[1, 2, 3, 5, 10, 15, 30, 60].map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {minutes} 分钟
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              ) : null}

              {showConflictResolution ? (
                <SettingRow
                  description="同步出现差异时选择保留哪一侧。"
                  label="差异处理策略"
                  control={
                    <Select
                      value={settings.conflictResolution}
                      onValueChange={(value) =>
                        onSettingsChange((current) => ({
                          ...current,
                          conflictResolution:
                            value as GitSyncConflictResolution,
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label="差异处理策略"
                        className="h-10 w-full min-w-[180px] rounded-lg border-border/80 bg-background/80 sm:w-[180px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="end"
                        avoidCollisions={false}
                        position="popper"
                        side="bottom"
                        sideOffset={4}
                      >
                        <SelectItem value="abort">放弃</SelectItem>
                        <SelectItem value="local">本地仓库</SelectItem>
                        <SelectItem value="remote">远程仓库</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
              ) : null}

              {showSyncNow ? (
                <SettingRow
                  description="立即提交、拉取并推送当前工作区变更。"
                  label="立即同步"
                  control={
                    <Button
                      className="h-9 rounded-lg"
                      disabled={!canSync}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={onSyncNow}
                    >
                      <RefreshCw
                        className={cn(isSyncing ? 'animate-spin' : null)}
                        data-testid="git-sync-now-icon"
                        size={14}
                      />
                      {isSyncing ? '同步中' : '立即同步'}
                    </Button>
                  }
                />
              ) : null}
            </div>
            {!isRepository && gitAvailable ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                当前工作区还不是 Git 仓库，请先在 Git 面板初始化仓库。
              </p>
            ) : null}
            {isRepository && !remoteInfo.remoteUrl ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                当前仓库未配置 origin remote，配置后才能同步到远程。
              </p>
            ) : null}
          </section>
        ) : null}

        {showRemove ? (
          <section
            className="rounded-xl bg-destructive/5 p-5"
            data-testid="git-sync-danger-zone"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-destructive">移除</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  关闭 Madora 对 Git Sync 的管理，不删除本地 .git 目录和提交历史。
                </p>
                <Button
                  className="mt-3 h-9 rounded-lg"
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={onRemove}
                >
                  <Trash2 size={14} />
                  移除 Git Sync
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <GitSyncFeedback message={actionMessage} state={actionState} />
      </div>
    </div>
  );
}

function mergeRuntimeAiProfiles(
  settings: AppSettings,
  runtimeProfiles: AiAgentProfile[],
): AppSettings {
  const existingProfileIds = new Set(
    settings.ai.profiles.map((profile) => profile.id),
  );
  const runtimeSettingsProfiles = runtimeProfiles
    .filter((profile) => !existingProfileIds.has(profile.id))
    .map((profile) => aiAgentProfileToSettingsProfile(profile));

  return {
    ...settings,
    ai: {
      ...settings.ai,
      profiles: [...settings.ai.profiles, ...runtimeSettingsProfiles],
    },
  };
}

function aiAgentProfileToSettingsProfile(
  profile: AiAgentProfile,
): AiConfiguredProfile {
  return {
    enabled: false,
    id: profile.id,
    isTestRuntime: profile.isTestRuntime,
    kind: profile.kind,
    label: profile.label,
    modelId: profile.modelId,
    modelLabel: profile.modelLabel,
    providerId: profile.providerId,
    providerLabel: profile.providerLabel,
  };
}

function AiSettingsSection({
  errorMessage,
  saveState,
  detectedAccounts,
  settings,
  visibleFields,
  onEnabledProfileChange,
  onProviderSettingsChange,
}: {
  errorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  detectedAccounts: AiAssistantAccount[];
  settings: AppSettings;
  visibleFields: string[];
  onEnabledProfileChange: (profileId: string | null) => void;
  onProviderSettingsChange: (settings: AiProviderSettings) => void;
}) {
  const providerSettings = settings.ai.providers;
  const [selectedProviderId, setSelectedProviderId] = React.useState(
    providerSettings.agentDefaultProviderId ??
      providerSettings.defaultProviderId ??
      providerSettings.providers[0]?.id ??
      '',
  );
  const [secretDraft, setSecretDraft] = React.useState('');
  const [secretState, setSecretState] = React.useState<
    'idle' | 'checking' | 'saving' | 'deleting' | 'error'
  >('idle');
  const [secretMessage, setSecretMessage] = React.useState<string | null>(null);
  const effectiveSelectedProviderId = providerSettings.providers.some(
    (provider) => provider.id === selectedProviderId,
  )
    ? selectedProviderId
    : providerSettings.providers[0]?.id ?? '';
  const selectedProvider =
    providerSettings.providers.find(
      (provider) => provider.id === effectiveSelectedProviderId,
    ) ??
    providerSettings.providers[0] ??
    null;
  const selectedProfile =
    settings.ai.profiles.find(
      (profile) => profile.id === settings.ai.enabledProfileId,
    ) ?? null;
  const metadataProfile = selectedProfile ?? settings.ai.profiles[0] ?? null;
  const showEnabledProfile = visibleFields.includes('enabled-profile');
  const showProvider = visibleFields.includes('provider');
  const showModel = visibleFields.includes('model');
  const showRuntime = visibleFields.includes('runtime');
  const showSecret = visibleFields.includes('secret');

  function updateProvider(
    providerId: string,
    updater: (provider: AiProviderConfig) => AiProviderConfig,
  ) {
    onProviderSettingsChange({
      ...providerSettings,
      providers: providerSettings.providers.map((provider) =>
        provider.id === providerId ? updater(provider) : provider,
      ),
    });
  }

  function updateProviderModel(provider: AiProviderConfig, modelId: string) {
    onProviderSettingsChange({
      ...providerSettings,
      agentDefaultModelId:
        providerSettings.agentDefaultProviderId === provider.id
          ? modelId
          : providerSettings.agentDefaultModelId,
      defaultModelId:
        providerSettings.defaultProviderId === provider.id
          ? modelId
          : providerSettings.defaultModelId,
      providers: providerSettings.providers.map((item) =>
        item.id === provider.id
          ? {
              ...item,
              defaultModelId: modelId,
            }
          : item,
      ),
    });
  }

  function setAgentDefaultProvider(provider: AiProviderConfig) {
    onProviderSettingsChange({
      ...providerSettings,
      agentDefaultModelId: provider.defaultModelId,
      agentDefaultProviderId: provider.id,
      defaultModelId: providerSettings.defaultModelId ?? provider.defaultModelId,
      defaultProviderId: providerSettings.defaultProviderId ?? provider.id,
    });
  }

  async function refreshSecretStatus(provider: AiProviderConfig) {
    if (provider.secretStatus === 'notRequired') return;

    setSecretState('checking');
    setSecretMessage(null);
    try {
      const status = isTauriRuntime()
        ? await getAiProviderSecretStatus(provider.id)
        : { status: provider.secretStatus === 'configured' ? 'configured' : 'missing' };
      const nextSecretStatus: AiProviderSecretStatus =
        status.status === 'configured' ? 'configured' : 'missing';

      updateProvider(provider.id, (current) => ({
        ...current,
        secretStatus: nextSecretStatus,
      }));
      setSecretState('idle');
      setSecretMessage(nextSecretStatus === 'configured' ? '密钥已配置。' : '未配置密钥。');
    } catch (error) {
      setSecretState('error');
      setSecretMessage(error instanceof Error ? error.message : '无法读取密钥状态');
    }
  }

  async function saveProviderSecret(provider: AiProviderConfig) {
    if (!secretDraft.trim() || provider.secretStatus === 'notRequired') return;

    setSecretState('saving');
    setSecretMessage(null);
    try {
      const status = isTauriRuntime()
        ? await saveAiProviderSecret(provider.id, secretDraft)
        : ({ status: 'configured' } satisfies { status: AiProviderSecretStatus });
      const nextSecretStatus: AiProviderSecretStatus =
        status.status === 'configured' ? 'configured' : 'missing';

      updateProvider(provider.id, (current) => ({
        ...current,
        secretStatus: nextSecretStatus,
      }));
      setSecretDraft('');
      setSecretState('idle');
      setSecretMessage('密钥已写入系统 Secret Store。');
    } catch (error) {
      setSecretState('error');
      setSecretMessage(error instanceof Error ? error.message : '无法保存密钥');
    }
  }

  async function deleteProviderSecret(provider: AiProviderConfig) {
    if (provider.secretStatus === 'notRequired') return;

    setSecretState('deleting');
    setSecretMessage(null);
    try {
      const status = isTauriRuntime()
        ? await deleteAiProviderSecret(provider.id)
        : ({ status: 'missing' } satisfies { status: AiProviderSecretStatus });
      const nextSecretStatus: AiProviderSecretStatus =
        status.status === 'configured' ? 'configured' : 'missing';

      updateProvider(provider.id, (current) => ({
        ...current,
        secretStatus: nextSecretStatus,
      }));
      setSecretState('idle');
      setSecretMessage('密钥已删除。');
    } catch (error) {
      setSecretState('error');
      setSecretMessage(error instanceof Error ? error.message : '无法删除密钥');
    }
  }

  return (
    <>
      <div className="mb-4 max-w-[620px]">
        <h2 className="text-[15px] font-semibold">AI 模型</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          配置右侧 AI 面板的 provider、模型和本地 assistant accounts。
        </p>
      </div>

      <div className="max-w-[620px] space-y-5">
        {showProvider || showModel || showSecret ? (
          <section className="border-b pb-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium">Providers</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                API keys stay in the system Secret Store. Settings only persist metadata.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="grid content-start gap-1">
                {providerSettings.providers.map((provider) => (
                  <button
                    aria-pressed={selectedProvider?.id === provider.id}
                    className={cn(
                      'grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 text-left text-sm transition-colors',
                      selectedProvider?.id === provider.id
                        ? 'border-[#3574f0] bg-[#3574f0]/10'
                        : 'bg-background hover:bg-muted/30',
                    )}
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setSecretDraft('');
                      setSecretMessage(null);
                    }}
                  >
                    <span className="truncate">{provider.name}</span>
                    <ProviderStatusBadge provider={provider} />
                  </button>
                ))}
              </div>

              {selectedProvider ? (
                <div className="grid gap-3 rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Cloud size={15} />
                        <h4 className="truncate text-sm font-medium">
                          {selectedProvider.name}
                        </h4>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedProvider.apiStyle}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      variant={selectedProvider.enabled ? 'secondary' : 'outline'}
                      onClick={() =>
                        updateProvider(selectedProvider.id, (provider) => ({
                          ...provider,
                          enabled: !provider.enabled,
                        }))
                      }
                    >
                      {selectedProvider.enabled ? '已启用' : '启用'}
                    </Button>
                  </div>

                  {showProvider ? (
                    <label className="grid gap-1.5 text-xs text-muted-foreground">
                      Base URL
                      <Input
                        className="h-8 text-sm"
                        value={selectedProvider.baseUrl}
                        onChange={(event) =>
                          updateProvider(selectedProvider.id, (provider) => ({
                            ...provider,
                            baseUrl: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {showModel ? (
                    <div className="grid gap-1.5">
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor="ai-provider-default-model"
                      >
                        Default model
                      </label>
                      <Select
                        value={selectedProvider.defaultModelId}
                        onValueChange={(modelId) =>
                          updateProviderModel(selectedProvider, modelId)
                        }
                      >
                        <SelectTrigger
                          id="ai-provider-default-model"
                          aria-label="Provider default model"
                          className="h-8"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedProvider.models.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="w-fit"
                        size="sm"
                        type="button"
                        variant={
                          providerSettings.agentDefaultProviderId === selectedProvider.id
                            ? 'secondary'
                            : 'outline'
                        }
                        onClick={() => setAgentDefaultProvider(selectedProvider)}
                      >
                        设为 AI 面板默认
                      </Button>
                    </div>
                  ) : null}

                  {showSecret && selectedProvider.secretStatus !== 'notRequired' ? (
                    <div className="grid gap-2">
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor="ai-provider-secret"
                      >
                        API Key
                      </label>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
                        <Input
                          id="ai-provider-secret"
                          className="h-8 text-sm"
                          placeholder="写入系统 Secret Store"
                          type="password"
                          value={secretDraft}
                          onChange={(event) => setSecretDraft(event.target.value)}
                        />
                        <Button
                          aria-label="保存 provider API Key"
                          disabled={!secretDraft.trim() || secretState === 'saving'}
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => void saveProviderSecret(selectedProvider)}
                        >
                          <KeyRound size={15} />
                        </Button>
                        <Button
                          aria-label="刷新 provider API Key 状态"
                          disabled={secretState === 'checking'}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => void refreshSecretStatus(selectedProvider)}
                        >
                          检测
                        </Button>
                        <Button
                          aria-label="删除 provider API Key"
                          disabled={secretState === 'deleting'}
                          size="icon"
                          type="button"
                          variant="outline"
                          onClick={() => void deleteProviderSecret(selectedProvider)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      {secretMessage ? (
                        <p
                          className={cn(
                            'text-xs',
                            secretState === 'error'
                              ? 'text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {secretMessage}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="border-b pb-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium">Accounts</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use assistant accounts without adding API keys.
            </p>
          </div>

          <div className="grid gap-2">
            {detectedAccounts.length > 0 ? (
              detectedAccounts.map((account) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border bg-muted/10 px-3 py-2"
                  key={account.id}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <AccountProviderIcon accountId={account.id} />
                      <span className="truncate text-sm font-medium">
                        {account.label}
                      </span>
                      {account.transport ? (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {account.transport}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {account.version ??
                        account.commandPath ??
                        account.message ??
                        account.providerLabel}
                    </p>
                  </div>
                  <AccountStatusBadge status={account.status} />
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                未检测到本地 Codex 或 Claude CLI。
              </div>
            )}
          </div>
        </section>

        {showEnabledProfile ? (
          <div className="grid grid-cols-[136px_minmax(0,320px)] items-center gap-3">
            <label className="text-sm text-foreground" htmlFor="ai-profile">
              启用模型
            </label>
            <Select
              value={settings.ai.enabledProfileId ?? 'none'}
              onValueChange={(value) =>
                onEnabledProfileChange(value === 'none' ? null : value)
              }
            >
              <SelectTrigger
                id="ai-profile"
                aria-label="启用模型"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不启用 AI</SelectItem>
                {settings.ai.profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <span className="flex items-center gap-2">
                      <Bot size={15} />
                      {profile.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <section className="border-t pt-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium">Models</h3>
          </div>
          <div className="grid gap-3">
            {detectedAccounts
              .filter((account) => account.models.length > 0)
              .map((account) => (
                <div className="grid gap-1.5" key={account.id}>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <AccountProviderIcon accountId={account.id} />
                    {account.label} Models
                  </div>
                  <div className="grid gap-1">
                    {account.models.map((model) => (
                      <button
                        aria-pressed={settings.ai.enabledProfileId === model.profileId}
                        className={cn(
                          'grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 text-left text-sm transition-colors',
                          settings.ai.enabledProfileId === model.profileId
                            ? 'border-[#3574f0] bg-[#3574f0]/10 text-foreground'
                            : 'bg-background hover:bg-muted/30',
                        )}
                        key={model.profileId}
                        type="button"
                        onClick={() => onEnabledProfileChange(model.profileId)}
                      >
                        <span className="truncate">{model.label}</span>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          Adapter pending
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            {detectedAccounts.every((account) => account.models.length === 0) ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                当前没有可展示的本地模型目录。
              </div>
            ) : null}
          </div>
        </section>

        {metadataProfile ? (
          <div className="border-t pt-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium">模型元数据</h3>
            </div>

            <div className="grid gap-2">
              {showProvider ? (
                <ReadonlyField
                  label="供应商"
                  value={metadataProfile.providerLabel}
                />
              ) : null}
              {showModel ? (
                <ReadonlyField label="模型 ID" value={metadataProfile.modelId} />
              ) : null}
              {showRuntime ? (
                <ReadonlyField
                  label="运行方式"
                  value={getAiRuntimeLabel(metadataProfile)}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {metadataProfile?.isTestRuntime ? (
          <div className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
            <Cpu size={13} />
            测试运行时
          </div>
        ) : null}

        <SettingsFeedback
          defaultMessage="当前配置会作为右侧 AI 面板的默认模型。"
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

function GitSyncFeedback({
  message,
  state,
}: {
  message: string | null;
  state: 'idle' | 'saving' | 'syncing' | 'saved' | 'synced' | 'error';
}) {
  const isError = state === 'error';

  return (
    <div
      aria-live="polite"
      className={cn(
        'min-h-8 rounded-md px-2.5 py-1.5 text-xs',
        isError ? 'border border-destructive/40 text-destructive' : 'text-muted-foreground',
      )}
    >
      {message ??
        (state === 'saving'
          ? '正在保存 Git Sync 设置...'
          : state === 'syncing'
            ? '正在同步工作区...'
            : state === 'saved'
              ? 'Git Sync 设置已保存。'
              : 'Git Sync 配置保存在当前工作区。')}
    </div>
  );
}

function SettingsSectionIcon({ sectionId }: { sectionId: SettingsSectionId }) {
  switch (sectionId) {
    case 'appearance':
      return <Palette size={15} />;
    case 'storage':
      return <Database size={15} />;
    case 'git-sync':
      return <GitBranch size={15} />;
    case 'ai':
      return <Bot size={15} />;
  }
}

function ThemePreviewRadioButton({
  checked,
  label,
  testId,
  variant,
  onClick,
}: {
  checked: boolean;
  label: string;
  testId: string;
  variant: 'dark' | 'light' | 'system';
  onClick: () => void;
}) {
  const Icon =
    variant === 'system' ? Monitor : variant === 'light' ? Sun : Moon;

  return (
    <button
      aria-label={label}
      aria-checked={checked}
      className={cn(
        'group grid min-h-[156px] gap-2 rounded-lg border bg-background p-2 text-left transition-colors hover:border-[#3574f0]/60',
        checked
          ? 'border-[#3574f0] shadow-[0_0_0_2px_rgba(53,116,240,0.14)]'
          : 'border-border',
      )}
      data-testid={testId}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <div className="relative h-24 overflow-hidden rounded-md border border-border/70 bg-muted/30 transition-colors group-hover:border-[#3574f0]/35">
        <ThemeArticlePreview variant={variant} />
        {checked ? (
          <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#3574f0] text-white shadow-sm">
            <CheckCircle2 size={13} strokeWidth={2.2} />
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          'flex min-w-0 items-center justify-center gap-1.5 text-sm font-medium',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon size={15} strokeWidth={1.8} />
        {label}
      </span>
    </button>
  );
}

function ThemeArticlePreview({
  variant,
}: {
  variant: 'dark' | 'light' | 'system';
}) {
  if (variant === 'system') {
    return (
      <div className="grid h-full grid-cols-2">
        <ArticleMiniature mode="light" />
        <ArticleMiniature mode="dark" />
      </div>
    );
  }

  return <ArticleMiniature mode={variant} />;
}

function ArticleMiniature({ mode }: { mode: 'dark' | 'light' }) {
  const dark = mode === 'dark';

  return (
    <div
      className={cn(
        'relative h-full overflow-hidden px-3 py-2',
        dark ? 'bg-[#181b20]' : 'bg-[#f8fafc]',
      )}
    >
      <div
        className={cn(
          'mx-auto h-full max-w-[112px] rounded-md border px-3 py-2 shadow-sm',
          dark
            ? 'border-white/10 bg-[#242932]'
            : 'border-slate-200 bg-white',
        )}
      >
        <div
          className={cn(
            'mb-1 h-1.5 w-10 rounded-full',
            dark ? 'bg-slate-500' : 'bg-slate-300',
          )}
        />
        <div
          className={cn(
            'mb-2 h-2 w-16 rounded-full',
            dark ? 'bg-slate-300' : 'bg-slate-700',
          )}
        />
        <div className="space-y-1">
          <PreviewLine mode={mode} width="w-full" />
          <PreviewLine mode={mode} width="w-4/5" />
          <PreviewLine mode={mode} width="w-11/12" />
        </div>
        <div
          className={cn(
            'mt-2 grid gap-1 rounded border-l-2 py-1 pl-2',
            dark
              ? 'border-[#60a5fa] bg-white/5'
              : 'border-[#3574f0] bg-[#eff6ff]',
          )}
        >
          <PreviewLine mode={mode} width="w-10/12" />
          <PreviewLine mode={mode} width="w-7/12" />
        </div>
      </div>
    </div>
  );
}

function PageWidthPreviewRadioButton({
  checked,
  label,
  testId,
  variant,
  onClick,
}: {
  checked: boolean;
  label: string;
  testId: string;
  variant: PageWidthMode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-checked={checked}
      className={cn(
        'group grid min-h-32 gap-2 rounded-lg border bg-background p-2 text-left transition-colors hover:border-[#3574f0]/60',
        checked
          ? 'border-[#3574f0] shadow-[0_0_0_2px_rgba(53,116,240,0.14)]'
          : 'border-border',
      )}
      data-testid={testId}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <div className="relative h-20 overflow-hidden rounded-md border border-border/70 bg-muted/20 px-3 py-2 transition-colors group-hover:border-[#3574f0]/35">
        <div
          className={cn(
            'mx-auto h-full rounded-md border bg-background px-3 py-2 shadow-sm',
            variant === 'standard' ? 'max-w-[104px]' : 'max-w-[172px]',
          )}
        >
          <div className="mb-2 h-2 w-14 rounded-full bg-foreground/50" />
          <div className="space-y-1">
            <PreviewLine mode="light" width="w-full" />
            <PreviewLine mode="light" width="w-11/12" />
            <PreviewLine mode="light" width="w-4/5" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <span className="h-2 rounded bg-[#3574f0]/20" />
            <span className="h-2 rounded bg-[#3574f0]/15" />
            <span className="h-2 rounded bg-[#3574f0]/10" />
          </div>
        </div>
        {checked ? (
          <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#3574f0] text-white shadow-sm">
            <CheckCircle2 size={13} strokeWidth={2.2} />
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          'text-center text-sm font-medium',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </button>
  );
}

function PreviewLine({
  mode,
  width,
}: {
  mode: 'dark' | 'light';
  width: string;
}) {
  return (
    <span
      className={cn(
        'block h-1 rounded-full',
        width,
        mode === 'dark' ? 'bg-slate-500/80' : 'bg-slate-200',
      )}
    />
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

function withDefaultGitSyncSettings(
  settings?: Partial<WorkspaceGitSyncSettings> | null,
): WorkspaceGitSyncSettings {
  const interval =
    settings?.intervalMinutes ?? DEFAULT_GIT_SYNC_SETTINGS.intervalMinutes;
  const conflictResolution =
    settings?.conflictResolution ??
    DEFAULT_GIT_SYNC_SETTINGS.conflictResolution;

  return {
    conflictResolution: isGitSyncConflictResolution(conflictResolution)
      ? conflictResolution
      : DEFAULT_GIT_SYNC_SETTINGS.conflictResolution,
    enabled: settings?.enabled ?? DEFAULT_GIT_SYNC_SETTINGS.enabled,
    intervalMinutes: [1, 2, 3, 5, 10, 15, 30, 60].includes(interval)
      ? interval
      : DEFAULT_GIT_SYNC_SETTINGS.intervalMinutes,
    lastSyncedAt: settings?.lastSyncedAt ?? null,
  };
}

function isGitSyncConflictResolution(
  value: string,
): value is GitSyncConflictResolution {
  return value === 'abort' || value === 'local' || value === 'remote';
}

function formatGitSyncTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function mergeSystemFontOptions(options: SystemFontOptions): SystemFontOptions {
  return {
    code: ensureFontOptionList(options.code, [
      options.recommendations.code,
      ...FALLBACK_SYSTEM_FONT_OPTIONS.code,
    ]),
    document: ensureFontOptionList(options.document, [
      options.recommendations.document,
      ...FALLBACK_SYSTEM_FONT_OPTIONS.document,
    ]),
    recommendations: {
      ...FALLBACK_SYSTEM_FONT_OPTIONS.recommendations,
      ...options.recommendations,
    },
    ui: ensureFontOptionList(options.ui, [
      options.recommendations.ui,
      ...FALLBACK_SYSTEM_FONT_OPTIONS.ui,
    ]),
  };
}

function ensureFontOption(options: string[], value: string) {
  return ensureFontOptionList(options, [value]);
}

function ensureFontOptionList(options: string[], required: string[]) {
  const seen = new Set<string>();
  const nextOptions: string[] = [];

  for (const option of [...required, ...options]) {
    const normalized = option.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    nextOptions.push(normalized);
  }

  return nextOptions;
}

function buildPreviewFontStack(fontFamily: string) {
  return `${quoteCssFontFamily(fontFamily)}, var(--madora-ui-font)`;
}

function quoteCssFontFamily(fontFamily: string) {
  return `'${fontFamily.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function AccountProviderIcon({ accountId }: { accountId: string }) {
  if (accountId === 'codex') {
    return <Bot className="shrink-0" size={15} />;
  }

  if (accountId === 'claude') {
    return <span className="shrink-0 text-xs font-semibold">AI</span>;
  }

  return <Cpu className="shrink-0" size={15} />;
}

function ProviderStatusBadge({ provider }: { provider: AiProviderConfig }) {
  const ready =
    provider.enabled &&
    (provider.secretStatus === 'configured' ||
      provider.secretStatus === 'notRequired');

  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[11px]',
        ready
          ? 'bg-emerald-50 text-emerald-700'
          : provider.secretStatus === 'missing'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {provider.secretStatus === 'notRequired'
        ? 'Local'
        : provider.secretStatus === 'configured'
          ? 'Key'
          : 'No key'}
    </span>
  );
}

function AccountStatusBadge({
  status,
}: {
  status: AiAssistantAccount['status'];
}) {
  const connected = status === 'connected';
  const label = getAccountStatusLabel(status);

  return (
    <span
      className={cn(
        'flex h-6 items-center gap-1 rounded-md px-2 text-xs',
        connected
          ? 'bg-emerald-50 text-emerald-700'
          : status === 'missing'
            ? 'bg-muted text-muted-foreground'
            : 'bg-amber-50 text-amber-700',
      )}
    >
      {connected ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {label}
    </span>
  );
}

function getAccountStatusLabel(status: AiAssistantAccount['status']) {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'detected':
      return 'Detected';
    case 'misconfigured':
      return 'Needs setup';
    case 'missing':
      return 'Missing';
  }
}

function getAiRuntimeLabel(profile: AiConfiguredProfile) {
  return profile.isTestRuntime ? '测试运行时' : profile.kind;
}

function SettingRow({
  control,
  description,
  label,
}: {
  control: React.ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,auto)] sm:items-center">
      <div className="min-w-0">
        <p className="text-base font-medium tracking-tight">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex justify-start sm:justify-end">{control}</div>
    </div>
  );
}

function PillSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-primary bg-primary' : 'border-input bg-muted',
      )}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function ReadonlyField({
  action,
  label,
  value,
}: {
  action?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <label className="grid grid-cols-[136px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <Input
          className="h-8 min-w-0 rounded-md bg-muted/20 font-mono text-xs"
          readOnly
          value={value}
        />
        {action}
      </span>
    </label>
  );
}

'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  FolderArchive,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Search,
  Server,
  Sun,
  Trash2,
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
  detectAiAccounts,
  deleteAiProviderSecret,
  getAiProviderSecretStatus,
  isTauriRuntime,
  listAiAgentProfiles,
  readAppSettings,
  saveAppSettings,
  saveAiProviderSecret,
} from './workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from './workspace-settings';
import type {
  AiConfiguredProfile,
  AppSettings,
  PageWidthMode,
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

interface WorkspaceSettingsDialogProps {
  initialSectionId?: SettingsSectionId;
  open: boolean;
  workspaceRootPath: string | null;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

type SettingsSectionId = 'appearance' | 'storage' | 'ai';

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

export function WorkspaceSettingsDialog({
  initialSectionId = 'appearance',
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
  const [detectedAccounts, setDetectedAccounts] = React.useState<
    AiAssistantAccount[]
  >([]);
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
      if (!open) {
        return;
      }

      setSearchQuery('');
      setActiveSectionId(initialSectionId);
      setLoadState('loading');
      setSaveState('idle');
      setErrorMessage(null);

      if (!isTauriRuntime()) {
        setSettings(DEFAULT_APP_SETTINGS);
        setDetectedAccounts([]);
        setLoadState('loaded');
        return;
      }

      try {
        const [nextSettings, runtimeProfiles, nextDetectedAccounts] =
          await Promise.all([
            readAppSettings(),
            workspaceRootPath
              ? listAiAgentProfiles(workspaceRootPath)
              : Promise.resolve([]),
            detectAiAccounts(),
          ]);

        if (!cancelled) {
          const normalizedSettings = withDefaultAppSettings(nextSettings);

          setSettings(
            mergeRuntimeAiProfiles(normalizedSettings, runtimeProfiles),
          );
          setDetectedAccounts(nextDetectedAccounts);
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
  }, [initialSectionId, open, workspaceRootPath]);

  function updatePageWidthMode(pageWidthMode: PageWidthMode) {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        pageWidthMode,
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
            配置应用外观、上传、资源存储方式和 AI 模型。
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
                  <SettingsSectionIcon sectionId={section.id} />
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

function SettingsSectionIcon({ sectionId }: { sectionId: SettingsSectionId }) {
  switch (sectionId) {
    case 'appearance':
      return <Palette size={15} />;
    case 'storage':
      return <Database size={15} />;
    case 'ai':
      return <Bot size={15} />;
  }
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

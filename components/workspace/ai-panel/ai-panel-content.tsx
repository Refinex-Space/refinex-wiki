'use client';

import * as React from 'react';
import {
  Check,
  Download,
  FileText,
  History,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  X,
} from 'lucide-react';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import { Button } from '@/components/ui/button';
import {
  cancelAiTurn,
  isTauriRuntime,
  listAiAgentModels,
  listAiAgentProfiles,
  listenAiEvents,
  readAppSettings,
  sendAiPrompt,
  startAiSession,
} from '@/components/workspace/workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from '@/components/workspace/workspace-settings';
import type { WorkspaceNode } from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

import { buildAiContextPack } from './ai-context';
import {
  createInitialAiPanelState,
  reduceAiPanelState,
} from './ai-reducer';
import type { AiDetectedModel, AiIntent } from './ai-types';

interface AiPanelContentProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  settingsVersion?: number;
  workspaceRootPath: string | null;
  onOpenSettings?: () => void;
}

export function AiPanelContent({
  currentDocument,
  documentPanelData,
  settingsVersion = 0,
  workspaceRootPath,
  onOpenSettings,
}: AiPanelContentProps) {
  const [state, dispatch] = React.useReducer(
    reduceAiPanelState,
    undefined,
    createInitialAiPanelState,
  );
  const [appSettings, setAppSettings] =
    React.useState(DEFAULT_APP_SETTINGS);
  const [prompt, setPrompt] = React.useState('');
  const [activePopover, setActivePopover] = React.useState<
    'actions' | 'history' | 'models' | null
  >(null);
  const [models, setModels] = React.useState<AiDetectedModel[]>([]);
  const [modelsLoadedForRoot, setModelsLoadedForRoot] = React.useState<
    string | null
  >(null);
  const [modelSearch, setModelSearch] = React.useState('');
  const [historySearch, setHistorySearch] = React.useState('');
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(
    null,
  );
  const [sessionNotice, setSessionNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!workspaceRootPath) {
      return;
    }

    let cancelled = false;
    const rootPath = workspaceRootPath;

    async function loadAiConfiguration() {
      try {
        const [profiles, settings] = await Promise.all([
          listAiAgentProfiles(rootPath),
          loadAppSettings(),
        ]);

        if (!cancelled) {
          const normalizedSettings = withDefaultAppSettings(settings);
          const selectedProfileId = selectInitialProfileId(
            profiles,
            normalizedSettings.ai.enabledProfileId,
          );

          setAppSettings(normalizedSettings);
          dispatch({
            profiles,
            selectedProfileId,
            type: 'profilesLoaded',
          });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            message:
              error instanceof Error ? error.message : '无法读取 AI agent 列表',
            type: 'errorRaised',
          });
        }
      }
    }

    void loadAiConfiguration();

    return () => {
      cancelled = true;
    };
  }, [settingsVersion, workspaceRootPath]);

  React.useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    listenAiEvents((event) => {
      if (!disposed) {
        dispatch({ event, type: 'runtimeEventReceived' });
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const selectedProfile = state.profiles.find(
    (profile) => profile.id === state.selectedProfileId,
  );
  const selectedSettingsProfile =
    appSettings.ai.profiles.find(
      (profile) => profile.id === appSettings.ai.enabledProfileId,
    ) ?? null;
  const profileReady =
    Boolean(workspaceRootPath) &&
    Boolean(state.selectedProfileId) &&
    Boolean(selectedProfile) &&
    selectedProfile?.detection.status === 'available';
  const runtimeReady = profileReady;
  const profileMetadata = selectedProfile ?? selectedSettingsProfile;
  const effectiveSelectedModelId = selectedModelId ?? profileMetadata?.modelId ?? null;
  const selectedModel =
    models.find((model) => model.id === effectiveSelectedModelId) ?? null;
  const settingsDisabled =
    Boolean(workspaceRootPath) &&
    !profileReady;

  const loadModels = React.useCallback(async () => {
    if (!workspaceRootPath || modelsLoadedForRoot === workspaceRootPath) {
      return;
    }

    try {
      const runtimeModels = await listAiAgentModels(workspaceRootPath);

      setModels(runtimeModels);
      setModelsLoadedForRoot(workspaceRootPath);
      setSelectedModelId((current) => current ?? runtimeModels[0]?.id ?? null);
    } catch (error) {
      dispatch({
        message:
          error instanceof Error ? error.message : '无法读取本地模型列表',
        type: 'errorRaised',
      });
    }
  }, [modelsLoadedForRoot, workspaceRootPath]);

  const submitPrompt = React.useCallback(
    async (content: string, intent: AiIntent = 'chat') => {
      const trimmed = content.trim();

      if (!workspaceRootPath || !runtimeReady || !trimmed) {
        return;
      }

      const context = buildAiContextPack({
        currentDocument,
        documentPanelData,
        intent,
        workspaceRootPath,
      });
      const userMessageId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `user-${Date.now()}`;

      dispatch({ type: 'connectRequested' });

      try {
        if (!state.selectedProfileId || !selectedProfile) {
          return;
        }

        const session =
          state.session ??
          (await startAiSession({
            context,
            profileId: state.selectedProfileId,
            rootPath: workspaceRootPath,
          }));

        if (!state.session) {
          dispatch({
            event: { session, type: 'sessionStarted' },
            type: 'runtimeEventReceived',
          });
        }

        dispatch({
          content: trimmed,
          id: userMessageId,
          type: 'userMessageSubmitted',
        });

        await sendAiPrompt({
          context,
          prompt: trimmed,
          sessionId: session.sessionId,
        });
        setPrompt('');
      } catch (error) {
        dispatch({
          message: error instanceof Error ? error.message : 'AI 请求失败',
          type: 'errorRaised',
        });
      }
    },
    [
      currentDocument,
      documentPanelData,
      runtimeReady,
      selectedProfile,
      state.selectedProfileId,
      state.session,
      workspaceRootPath,
    ],
  );
  const canSend =
    Boolean(workspaceRootPath) &&
    runtimeReady &&
    Boolean(prompt.trim()) &&
    state.status !== 'streaming' &&
    state.status !== 'connecting';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex min-h-12 items-center justify-end gap-1 border-b px-2">
        <IconToolButton
          active={activePopover === 'actions'}
          ariaLabel="快捷动作"
          onClick={() =>
            setActivePopover(activePopover === 'actions' ? null : 'actions')
          }
        >
          <Sparkles size={16} />
        </IconToolButton>
        <IconToolButton
          ariaLabel="新会话"
          onClick={() => {
            dispatch({ type: 'sessionCleared' });
            setSessionNotice('New session');
            setActivePopover(null);
          }}
        >
          <Plus size={17} />
        </IconToolButton>
        <IconToolButton
          active={activePopover === 'history'}
          ariaLabel="历史会话"
          onClick={() =>
            setActivePopover(activePopover === 'history' ? null : 'history')
          }
        >
          <History size={17} />
        </IconToolButton>
        <IconToolButton ariaLabel="关闭 AI 面板" onClick={() => setActivePopover(null)}>
          <X size={17} />
        </IconToolButton>
      </header>

      {activePopover === 'actions' ? (
        <FloatingPanel className="right-3 top-14 w-[220px] p-3">
          <Button
            disabled={!profileReady || !documentPanelData}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setActivePopover(null);
              submitPrompt('Generate Title', 'summarize-document');
            }}
          >
            Generate Title
          </Button>
        </FloatingPanel>
      ) : null}

      {activePopover === 'history' ? (
        <FloatingPanel className="right-3 top-14 w-[320px] overflow-hidden p-0">
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search..."
              value={historySearch}
              onChange={(event) => setHistorySearch(event.currentTarget.value)}
            />
            <Search size={17} />
            <Download size={16} />
          </div>
          <div className="grid gap-1 p-2 text-sm">
            <p className="px-2 py-1 text-xs text-muted-foreground">2w ago</p>
            {SESSION_HISTORY.filter((item) =>
              item.title.toLowerCase().includes(historySearch.toLowerCase()),
            ).map((item) => (
              <button
                className="grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md px-2 text-left hover:bg-muted"
                key={item.id}
                type="button"
              >
                <span className="truncate">{item.title}</span>
                {item.active ? <Check size={16} /> : null}
              </button>
            ))}
          </div>
        </FloatingPanel>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mb-3 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <FileText size={15} />
          <span className="truncate">
            {currentDocument?.title || currentDocument?.name || '未选择文档'}
          </span>
          {documentPanelData?.markdown ? (
            <span className="shrink-0">
              {documentPanelData.markdown.length} ch
            </span>
          ) : null}
        </div>

        {settingsDisabled ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <h3 className="text-sm font-medium">未启用 AI 模型</h3>
            <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
              需要先在 AI Account 中连接本地 Codex 或 Claude Code。
            </p>
            <Button
              className="mt-3"
              disabled={!onOpenSettings}
              size="sm"
              type="button"
              variant="outline"
              onClick={onOpenSettings}
            >
              <Settings size={14} />
              打开 AI 设置
            </Button>
          </div>
        ) : state.messages.length === 0 ? (
          <div className="flex min-h-[260px] flex-col justify-center text-sm text-muted-foreground">
            <p>{sessionNotice ?? '选择一个操作，或直接输入问题。'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.messages.map((message) => (
              <div
                className={cn(
                  'whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6',
                  message.role === 'user'
                    ? 'ml-auto max-w-[88%] bg-primary text-primary-foreground'
                    : 'mr-auto max-w-[92%] border bg-muted/20',
                )}
                key={message.id}
              >
                {message.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {activePopover === 'models' ? (
        <FloatingPanel
          className="bottom-[92px] left-3 right-3 max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:right-auto sm:w-[320px]"
          testId="ai-model-popover"
        >
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search models..."
              value={modelSearch}
              onChange={(event) => setModelSearch(event.currentTarget.value)}
            />
            <Search size={16} />
          </div>
          <ModelList
            models={models}
            query={modelSearch}
            selectedModelId={effectiveSelectedModelId}
            onSelect={(model) => {
              setSelectedModelId(model.id);
              dispatch({ profileId: model.profileId, type: 'profileSelected' });
              setActivePopover(null);
            }}
          />
        </FloatingPanel>
      ) : null}

      {state.error ? (
        <p className="border-t px-3 py-2 text-xs text-destructive">{state.error}</p>
      ) : null}

      <form
        className="border-t bg-background p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt(prompt);
        }}
      >
        <div
          className="rounded-xl border bg-background p-3 shadow-sm"
          data-testid="ai-composer"
        >
          <textarea
            className="min-h-20 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!workspaceRootPath || !runtimeReady}
            placeholder="向 AI 询问当前工作区..."
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
          <div
            className="mt-2 flex items-center justify-between gap-2"
            data-testid="ai-composer-footer"
          >
            <div className="relative flex min-w-0 items-center gap-2">
              <Button
                aria-label="选择模型"
                className="max-w-[160px] justify-start truncate px-2 text-xs"
                disabled={!workspaceRootPath}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  const nextOpen = activePopover !== 'models';
                  setActivePopover(nextOpen ? 'models' : null);
                  if (nextOpen) {
                    void loadModels();
                  }
                }}
              >
                <Sparkles size={14} />
                <span className="truncate">
                  {selectedModel?.label ?? profileMetadata?.label ?? '选择模型'}
                </span>
              </Button>
              <span className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                Current Note {documentPanelData?.markdown?.length ?? 0} ch
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                aria-label="停止"
                disabled={!state.session || state.status !== 'streaming'}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => {
                  if (state.session) {
                    cancelAiTurn(state.session.sessionId);
                  }
                }}
              >
                <Square size={15} />
              </Button>
              <Button
                aria-label="发送"
                disabled={!canSend}
                size="icon"
                type="submit"
              >
                <Send size={15} />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

async function loadAppSettings() {
  if (!isTauriRuntime()) {
    return DEFAULT_APP_SETTINGS;
  }

  return readAppSettings();
}

function selectInitialProfileId(
  profiles: Array<{
    detection: { status: string };
    id: string;
    isTestRuntime: boolean;
  }>,
  persistedProfileId: string | null,
) {
  const persistedProfile = profiles.find(
    (profile) => profile.id === persistedProfileId,
  );

  if (
    persistedProfile &&
    !persistedProfile.isTestRuntime &&
    persistedProfile.detection.status === 'available'
  ) {
    return persistedProfile.id;
  }

  return (
    profiles.find(
      (profile) =>
        !profile.isTestRuntime && profile.detection.status === 'available',
    )?.id ??
    profiles.find((profile) => profile.detection.status === 'available')?.id ??
    null
  );
}

const SESSION_HISTORY = [
  {
    active: true,
    id: 'permissions-context',
    title: '权限上下文代码注释补充',
  },
  {
    active: false,
    id: 'mermaid-layout',
    title: 'Mermaid流程图排版优化',
  },
];

function FloatingPanel({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        'absolute z-20 rounded-md border bg-background shadow-lg',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function IconToolButton({
  active = false,
  ariaLabel,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      className={cn(active && 'bg-muted text-foreground')}
      size="icon"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ModelList({
  models,
  query,
  selectedModelId,
  onSelect,
}: {
  models: AiDetectedModel[];
  query: string;
  selectedModelId: string | null;
  onSelect: (model: AiDetectedModel) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = models.filter((model) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      model.label.toLowerCase().includes(normalizedQuery) ||
      model.id.toLowerCase().includes(normalizedQuery) ||
      model.providerLabel.toLowerCase().includes(normalizedQuery)
    );
  });
  const providerGroups = filteredModels.reduce<
    Array<{ providerId: string; providerLabel: string; models: AiDetectedModel[] }>
  >((groups, model) => {
    const group = groups.find((item) => item.providerId === model.providerId);

    if (group) {
      group.models.push(model);
    } else {
      groups.push({
        models: [model],
        providerId: model.providerId,
        providerLabel: model.providerLabel,
      });
    }

    return groups;
  }, []);

  if (models.length === 0) {
    return (
      <div className="p-4 text-sm leading-6 text-muted-foreground">
        当前本地助手没有返回可选择模型。
      </div>
    );
  }

  return (
    <div className="max-h-[360px] overflow-auto p-2">
      {providerGroups.map((group) => (
        <div className="grid gap-1 border-b py-2 last:border-b-0" key={group.providerId}>
          <div className="px-2 text-xs font-medium text-muted-foreground">
            {group.providerLabel} Models
          </div>
          {group.models.map((model) => (
            <button
              className="grid h-9 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md px-2 text-left text-sm hover:bg-muted"
              key={model.id}
              type="button"
              onClick={() => onSelect(model)}
            >
              <span className="truncate">{model.label}</span>
              {selectedModelId === model.id ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      ))}
      {providerGroups.length === 0 ? (
        <div className="p-2 text-sm text-muted-foreground">没有匹配模型。</div>
      ) : null}
    </div>
  );
}

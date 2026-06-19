'use client';

import * as React from 'react';
import {
  Bot,
  FileText,
  ListTree,
  Send,
  Settings,
  Sparkles,
  Square,
} from 'lucide-react';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import { Button } from '@/components/ui/button';
import {
  cancelAiTurn,
  isTauriRuntime,
  listAiAgentProfiles,
  listenAiEvents,
  readAppSettings,
  requestAiChat,
  sendAiPrompt,
  startAiSession,
} from '@/components/workspace/workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from '@/components/workspace/workspace-settings';
import type { WorkspaceNode } from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

import {
  buildAiChatRequest,
  parseAiChatText,
} from '../ai-provider/chat-adapters';
import { resolveAgentModelSelection } from '../ai-provider/provider-settings';
import { buildAiContextPack } from './ai-context';
import {
  createInitialAiPanelState,
  reduceAiPanelState,
} from './ai-reducer';
import type { AiIntent } from './ai-types';

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
          const selectedProfileId = normalizedSettings.ai.enabledProfileId;

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
  const providerSelection = React.useMemo(
    () => resolveAgentModelSelection(appSettings.ai.providers),
    [appSettings.ai.providers],
  );
  const providerReady =
    Boolean(workspaceRootPath) &&
    Boolean(providerSelection.provider) &&
    Boolean(providerSelection.model);
  const profileReady =
    Boolean(workspaceRootPath) &&
    Boolean(state.selectedProfileId) &&
    Boolean(selectedProfile) &&
    selectedProfile?.detection.status === 'available';
  const runtimeReady = providerReady || profileReady;
  const profileMetadata = providerReady
    ? {
        isTestRuntime: false,
        label: `${providerSelection.provider?.name ?? 'AI'} / ${
          providerSelection.model?.name ?? 'model'
        }`,
        modelLabel: providerSelection.model?.name ?? 'model',
        providerLabel: providerSelection.provider?.name ?? 'AI',
      }
    : (selectedProfile ?? selectedSettingsProfile);
  const settingsDisabled =
    Boolean(workspaceRootPath) &&
    !providerReady &&
    !appSettings.ai.enabledProfileId;

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
        if (providerSelection.provider && providerSelection.model) {
          const messageId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `assistant-${Date.now()}`;

          dispatch({
            content: trimmed,
            id: userMessageId,
            type: 'userMessageSubmitted',
          });

          const response = await requestAiChat(
            buildAiChatRequest({
              context,
              model: providerSelection.model,
              prompt: trimmed,
              provider: providerSelection.provider,
            }),
          );
          const text = parseAiChatText(response.body);

          dispatch({
            event: {
              delta: text || 'AI provider returned an empty response.',
              messageId,
              sessionId: 'provider-direct',
              type: 'messageDelta',
            },
            type: 'runtimeEventReceived',
          });
          dispatch({
            event: {
              messageId,
              sessionId: 'provider-direct',
              type: 'messageCompleted',
            },
            type: 'runtimeEventReceived',
          });
          dispatch({
            event: {
              cancelled: false,
              sessionId: 'provider-direct',
              type: 'turnCompleted',
            },
            type: 'runtimeEventReceived',
          });
          setPrompt('');
          return;
        }

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
      providerSelection.model,
      providerSelection.provider,
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
    <>
      <header className="flex min-h-14 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">AI 助手</span>
            <span className="truncate text-xs text-muted-foreground">
              {profileMetadata?.label ?? '未启用 AI 模型'}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <StatusPill label={profileMetadata?.providerLabel ?? '未配置'} />
            <StatusPill label={profileMetadata?.modelLabel ?? '未配置'} />
            {profileMetadata?.isTestRuntime ? (
              <StatusPill label="测试运行时" />
            ) : null}
          </div>
        </div>
        <Button
          aria-label="打开 AI 设置"
          disabled={!onOpenSettings}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onOpenSettings}
        >
          <Settings size={15} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <FileText className="mt-0.5 text-muted-foreground" size={15} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {currentDocument?.title || currentDocument?.name || '未选择文档'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {workspaceRootPath
                ? '上下文以 Markdown 发送到当前启用的 runtime。'
                : '请选择工作区后使用 AI。'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <QuickActionButton
            disabled={!profileReady || !documentPanelData}
            icon={<Sparkles size={15} />}
            label="总结此页面"
            onClick={() => submitPrompt('总结此页面', 'summarize-document')}
          />
          <QuickActionButton
            disabled={!profileReady || !documentPanelData}
            icon={<Bot size={15} />}
            label="解释当前文档"
            onClick={() => submitPrompt('解释当前文档', 'explain-selection')}
          />
          <QuickActionButton
            disabled={!profileReady || !documentPanelData}
            icon={<ListTree size={15} />}
            label="生成大纲"
            onClick={() => submitPrompt('生成大纲', 'generate-outline')}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-background p-3">
          {settingsDisabled ? (
            <div className="flex h-full min-h-36 flex-col items-center justify-center text-center">
              <h3 className="text-sm font-medium">未启用 AI 模型</h3>
              <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
                需要先在设置中启用一个模型 profile。
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
            <div className="flex h-full min-h-36 flex-col justify-center text-sm text-muted-foreground">
              <p>选择一个操作，或直接输入问题。</p>
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

        {state.error ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}

        <form
          className="rounded-md border bg-background"
          onSubmit={(event) => {
            event.preventDefault();
            submitPrompt(prompt);
          }}
        >
          <textarea
            className="min-h-20 w-full resize-none rounded-md bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!workspaceRootPath || !runtimeReady}
            placeholder="向 AI 询问当前工作区..."
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
          <div className="flex items-center justify-between border-t px-2 py-2">
            <span className="truncate px-1 text-xs text-muted-foreground">
              {runtimeReady
                ? `${profileMetadata?.providerLabel ?? 'AI'} / ${
                    profileMetadata?.modelLabel ?? 'model'
                  }`
                : settingsDisabled
                  ? '未启用 AI 模型'
                  : 'AI runtime 未连接'}
            </span>
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
        </form>
      </div>
    </>
  );
}

async function loadAppSettings() {
  if (!isTauriRuntime()) {
    return DEFAULT_APP_SETTINGS;
  }

  return readAppSettings();
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="max-w-full truncate rounded-md border bg-muted/30 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
      {label}
    </span>
  );
}

function QuickActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className="min-w-0 justify-center px-2 text-xs"
      disabled={disabled}
      type="button"
      variant="outline"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

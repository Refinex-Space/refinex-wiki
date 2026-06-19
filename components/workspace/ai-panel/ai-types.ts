import type { AiConfiguredProfileKind } from '@/components/workspace/workspace-types';

export type AiAgentProfileKind = AiConfiguredProfileKind;

export type AiDetectionStatus = 'available' | 'missing' | 'misconfigured';
export type AiAccountStatus =
  | 'connected'
  | 'detected'
  | 'missing'
  | 'misconfigured';

export type AiIntent =
  | 'chat'
  | 'summarize-document'
  | 'explain-selection'
  | 'generate-outline';

export interface AiAgentCapabilities {
  readWorkspace: boolean;
  writeWorkspace: boolean;
  shell: boolean;
  diff: boolean;
  models: boolean;
  slashCommands: boolean;
}

export interface AiAgentProfile {
  id: string;
  label: string;
  kind: AiAgentProfileKind;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  isTestRuntime: boolean;
  command?: string;
  args?: string[];
  envKeys?: string[];
  cwdMode?: 'workspaceRoot' | 'home' | 'fixed';
  capabilities: AiAgentCapabilities;
  detection: {
    status: AiDetectionStatus;
    message?: string;
  };
}

export interface AiDetectedModel {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  profileId: string;
  available: boolean;
}

export interface AiAssistantAccount {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  status: AiAccountStatus;
  commandPath?: string;
  version?: string;
  transport?: string;
  message?: string;
  models: AiDetectedModel[];
}

export interface AiContextPack {
  workspaceRootPath: string;
  document?: {
    path: string;
    title: string;
    markdown: string;
    modifiedAt: number | null;
    contentHash: string;
    dirty: boolean;
  };
  selection?: {
    markdown: string;
    from: number;
    to: number;
  };
  toc?: Array<{
    depth: number;
    text: string;
    line?: number;
  }>;
  intent: AiIntent;
}

export interface StartAiSessionInput {
  context: AiContextPack;
  profileId: string;
  rootPath: string;
}

export interface SendAiPromptInput {
  context: AiContextPack;
  prompt: string;
  sessionId: string;
}

export interface AiSessionInfo {
  profileId: string;
  rootPath: string;
  sessionId: string;
  status: 'running' | 'stopped';
}

export type AiRuntimeEvent =
  | {
      type: 'sessionStarted';
      session: AiSessionInfo;
    }
  | {
      type: 'messageDelta';
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'messageCompleted';
      sessionId: string;
      messageId: string;
    }
  | {
      type: 'turnCompleted';
      sessionId: string;
      cancelled: boolean;
    }
  | {
      type: 'sessionExited';
      sessionId: string;
    }
  | {
      type: 'error';
      sessionId?: string;
      message: string;
    };

export interface AiPanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type AiPanelStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'error'
  | 'stopped';

export interface AiPanelState {
  error: string | null;
  messages: AiPanelMessage[];
  profiles: AiAgentProfile[];
  selectedProfileId: string | null;
  session: AiSessionInfo | null;
  status: AiPanelStatus;
}

export type AiPanelAction =
  | {
      type: 'profilesLoaded';
      profiles: AiAgentProfile[];
      selectedProfileId?: string | null;
    }
  | { type: 'profileSelected'; profileId: string }
  | { type: 'connectRequested' }
  | { type: 'userMessageSubmitted'; id: string; content: string }
  | { type: 'runtimeEventReceived'; event: AiRuntimeEvent }
  | { type: 'errorRaised'; message: string }
  | { type: 'cleared' };

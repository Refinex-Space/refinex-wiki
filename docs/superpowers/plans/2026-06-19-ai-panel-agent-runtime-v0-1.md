---
owner: refinex
updated: 2026-06-19
status: proposed
referenced_by: docs/README.md#historical-superpowers-plans
---
# AI Panel Agent Runtime v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working AI panel runtime slice: a typed React AI panel, a Tauri-backed fake echo agent runtime, and a read-only chat loop that carries current Markdown document context without using real API keys or spawning real CLI agents.

**Architecture:** v0.1 implements the stable UI/runtime contract from `docs/superpowers/specs/2026-06-19-ai-panel-agent-runtime-design.md` without integrating a real ACP agent yet. React owns panel state and rendering, `workspace-api.ts` exposes a narrow AI facade, and a new Tauri `agent_runtime` module owns session lifecycle plus fake streaming events. This keeps the first slice testable without widening Tauri shell permissions or relying on `app/api`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest + Testing Library, Tauri v2, Rust, serde, uuid.

**Design Spec:** `docs/superpowers/specs/2026-06-19-ai-panel-agent-runtime-design.md`

---

## Scope Check

This plan implements only **v0.1: Runtime 骨架和只读对话** from the design spec.

In scope:

- AI runtime TypeScript types, reducer, and context builder.
- `workspace-api.ts` wrappers for AI Tauri commands/events.
- New Tauri `agent_runtime` module with a fake local echo profile.
- Right AI panel replaced with a functional read-only chat UI.
- Current Markdown document context included in prompt requests.
- Stop/cancel/session cleanup path.

Out of scope for this plan:

- Real ACP stdio integration.
- Claude/Codex/opencode SDK or CLI adapters.
- Provider API key storage.
- Permission request UI.
- Diff/apply UI.
- Remote agent, MCP, session persistence.
- Changes to `src-tauri/capabilities/default.json`.

## File Structure

**Create:**

- `components/workspace/ai-panel/ai-types.ts` — shared TypeScript contract for profiles, context packs, sessions, events, and UI reducer state.
- `components/workspace/ai-panel/ai-reducer.ts` — pure reducer for AI panel event handling.
- `components/workspace/ai-panel/ai-context.ts` — builds `AiContextPack` from current workspace document data.
- `components/workspace/ai-panel/ai-panel-content.tsx` — functional AI panel UI for v0.1.
- `components/workspace/ai-panel/__tests__/ai-reducer.test.ts`
- `components/workspace/ai-panel/__tests__/ai-context.test.ts`
- `components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`
- `src-tauri/src/agent_runtime.rs` — fake echo runtime and AI Tauri commands.

**Modify:**

- `components/workspace/workspace-types.ts` — export AI runtime TypeScript types from `ai-types.ts` only if central re-export is needed by existing workspace imports.
- `components/workspace/workspace-api.ts` — add AI command wrappers and `listenAiEvents`.
- `components/workspace/__tests__/workspace-api.test.ts` — verify AI wrappers and event listener.
- `components/workspace/ai-side-panel.tsx` — remove inline AI placeholder and render `AiPanelContent`.
- `components/workspace/workspace-layout.tsx` — pass `documentPanelData` and `workspaceRootPath` into AI panel through `RightSidePanel`.
- `src-tauri/src/lib.rs` — manage `AgentRuntimeState` and register new Tauri commands.
- `docs/README.md` — add this plan to the historical plan index.

**Do not modify in v0.1:**

- `src-tauri/capabilities/default.json`
- `app/api/ai/copilot/route.ts`
- `package.json`
- `pnpm-lock.yaml`
- CI, signing, installer, or infrastructure manifests.

---

### Task 1: Add AI Runtime Type Contract And Reducer

**Files:**
- Create: `components/workspace/ai-panel/ai-types.ts`
- Create: `components/workspace/ai-panel/ai-reducer.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-reducer.test.ts`

- [ ] **Step 1: Write reducer tests**

Create `components/workspace/ai-panel/__tests__/ai-reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createInitialAiPanelState, reduceAiPanelState } from '../ai-reducer';
import type { AiAgentProfile, AiRuntimeEvent } from '../ai-types';

const profile: AiAgentProfile = {
  capabilities: {
    diff: false,
    models: false,
    readWorkspace: true,
    shell: false,
    slashCommands: false,
    writeWorkspace: false,
  },
  detection: { status: 'available' },
  id: 'fake-echo',
  kind: 'fake',
  label: 'Fake Echo',
};

describe('reduceAiPanelState', () => {
  it('stores profiles and selects the first available profile', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      profiles: [profile],
      type: 'profilesLoaded',
    });

    expect(state.profiles).toEqual([profile]);
    expect(state.selectedProfileId).toBe('fake-echo');
  });

  it('marks the panel connecting before a session starts', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      type: 'connectRequested',
    });

    expect(state.status).toBe('connecting');
    expect(state.error).toBeNull();
  });

  it('stores a started session', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      session: {
        profileId: 'fake-echo',
        rootPath: '/repo',
        sessionId: 'ai-1',
        status: 'running',
      },
      type: 'sessionStarted',
    });

    expect(state.status).toBe('idle');
    expect(state.session?.sessionId).toBe('ai-1');
  });

  it('adds the user message when a prompt is submitted', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      content: '总结此页面',
      id: 'user-1',
      type: 'userMessageSubmitted',
    });

    expect(state.status).toBe('streaming');
    expect(state.messages).toEqual([
      { content: '总结此页面', id: 'user-1', role: 'user' },
    ]);
  });

  it('appends assistant deltas and completes the message', () => {
    const started = createInitialAiPanelState();
    const event: AiRuntimeEvent = {
      delta: 'Echo: hello',
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageDelta',
    };
    const withDelta = reduceAiPanelState(started, {
      event,
      type: 'runtimeEventReceived',
    });
    const completed = reduceAiPanelState(withDelta, {
      event: {
        messageId: 'assistant-1',
        sessionId: 'ai-1',
        type: 'messageCompleted',
      },
      type: 'runtimeEventReceived',
    });

    expect(completed.messages).toEqual([
      {
        content: 'Echo: hello',
        id: 'assistant-1',
        role: 'assistant',
      },
    ]);
    expect(completed.status).toBe('idle');
  });

  it('stores runtime errors and leaves streaming state', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      event: {
        message: '会话不存在',
        sessionId: 'ai-1',
        type: 'error',
      },
      type: 'runtimeEventReceived',
    });

    expect(state.status).toBe('error');
    expect(state.error).toBe('会话不存在');
  });

  it('clears session and messages', () => {
    const state = reduceAiPanelState(
      {
        ...createInitialAiPanelState(),
        messages: [{ content: 'x', id: 'm1', role: 'assistant' }],
        session: {
          profileId: 'fake-echo',
          rootPath: '/repo',
          sessionId: 'ai-1',
          status: 'running',
        },
      },
      { type: 'cleared' },
    );

    expect(state.messages).toEqual([]);
    expect(state.session).toBeNull();
    expect(state.status).toBe('idle');
  });
});
```

- [ ] **Step 2: Run the failing reducer test**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel/__tests__/ai-reducer.test.ts
```

Expected: FAIL because `ai-reducer.ts` and `ai-types.ts` do not exist.

- [ ] **Step 3: Add AI shared types**

Create `components/workspace/ai-panel/ai-types.ts`:

```ts
export type AiAgentProfileKind =
  | 'fake'
  | 'acp_stdio'
  | 'acp_websocket'
  | 'sdk_sidecar'
  | 'provider';

export type AiDetectionStatus = 'available' | 'missing' | 'misconfigured';

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
  | { type: 'profilesLoaded'; profiles: AiAgentProfile[] }
  | { type: 'profileSelected'; profileId: string }
  | { type: 'connectRequested' }
  | { type: 'userMessageSubmitted'; id: string; content: string }
  | { type: 'runtimeEventReceived'; event: AiRuntimeEvent }
  | { type: 'errorRaised'; message: string }
  | { type: 'cleared' };
```

- [ ] **Step 4: Add the reducer**

Create `components/workspace/ai-panel/ai-reducer.ts`:

```ts
import type { AiPanelAction, AiPanelState } from './ai-types';

export function createInitialAiPanelState(): AiPanelState {
  return {
    error: null,
    messages: [],
    profiles: [],
    selectedProfileId: null,
    session: null,
    status: 'idle',
  };
}

export function reduceAiPanelState(
  state: AiPanelState,
  action: AiPanelAction,
): AiPanelState {
  switch (action.type) {
    case 'profilesLoaded': {
      const selectedProfileId =
        state.selectedProfileId ??
        action.profiles.find((profile) => profile.detection.status === 'available')
          ?.id ??
        action.profiles[0]?.id ??
        null;

      return {
        ...state,
        profiles: action.profiles,
        selectedProfileId,
      };
    }
    case 'profileSelected':
      return {
        ...state,
        selectedProfileId: action.profileId,
      };
    case 'connectRequested':
      return {
        ...state,
        error: null,
        status: 'connecting',
      };
    case 'userMessageSubmitted':
      return {
        ...state,
        error: null,
        messages: [
          ...state.messages,
          { content: action.content, id: action.id, role: 'user' },
        ],
        status: 'streaming',
      };
    case 'runtimeEventReceived':
      return applyRuntimeEvent(state, action.event);
    case 'errorRaised':
      return {
        ...state,
        error: action.message,
        status: 'error',
      };
    case 'cleared':
      return createInitialAiPanelState();
  }
}

function applyRuntimeEvent(
  state: AiPanelState,
  event: AiPanelAction & { type: 'runtimeEventReceived' }['event'],
): AiPanelState {
  switch (event.type) {
    case 'sessionStarted':
      return {
        ...state,
        error: null,
        session: event.session,
        status: 'idle',
      };
    case 'messageDelta':
      return {
        ...state,
        messages: appendAssistantDelta(
          state.messages,
          event.messageId,
          event.delta,
        ),
        status: 'streaming',
      };
    case 'messageCompleted':
      return {
        ...state,
        status: 'idle',
      };
    case 'turnCompleted':
      return {
        ...state,
        status: event.cancelled ? 'stopped' : 'idle',
      };
    case 'sessionExited':
      return {
        ...state,
        session: null,
        status: 'stopped',
      };
    case 'error':
      return {
        ...state,
        error: event.message,
        status: 'error',
      };
  }
}

function appendAssistantDelta(
  messages: AiPanelState['messages'],
  messageId: string,
  delta: string,
) {
  const existing = messages.find((message) => message.id === messageId);

  if (!existing) {
    return [
      ...messages,
      {
        content: delta,
        id: messageId,
        role: 'assistant' as const,
      },
    ];
  }

  return messages.map((message) =>
    message.id === messageId
      ? { ...message, content: `${message.content}${delta}` }
      : message,
  );
}
```

- [ ] **Step 5: Run the reducer test**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel/__tests__/ai-reducer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/workspace/ai-panel/ai-types.ts components/workspace/ai-panel/ai-reducer.ts components/workspace/ai-panel/__tests__/ai-reducer.test.ts
git commit -m "feat(ai): 添加 AI 面板运行时状态模型"
```

---

### Task 2: Add Markdown Context Builder

**Files:**
- Create: `components/workspace/ai-panel/ai-context.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-context.test.ts`

- [ ] **Step 1: Write context builder tests**

Create `components/workspace/ai-panel/__tests__/ai-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildAiContextPack,
  createStableContentHash,
} from '../ai-context';

describe('createStableContentHash', () => {
  it('returns stable hashes for identical markdown', () => {
    expect(createStableContentHash('# 标题')).toBe(
      createStableContentHash('# 标题'),
    );
  });

  it('returns different hashes for different markdown', () => {
    expect(createStableContentHash('# A')).not.toBe(
      createStableContentHash('# B'),
    );
  });
});

describe('buildAiContextPack', () => {
  it('builds document context from current Markdown panel data', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/guide.md',
        id: '/repo/guide.md',
        kind: 'document',
        name: 'guide.md',
        relativePath: 'guide.md',
        title: '指南',
      },
      documentPanelData: {
        markdown: '# 指南\n\n正文',
        metadata: {
          createdAt: '2026-06-19T00:00:00Z',
          title: '指南',
          updatedAt: '2026-06-19T01:00:00Z',
        },
      },
      intent: 'summarize-document',
      workspaceRootPath: '/repo',
    });

    expect(context.workspaceRootPath).toBe('/repo');
    expect(context.intent).toBe('summarize-document');
    expect(context.document).toEqual(
      expect.objectContaining({
        dirty: false,
        markdown: '# 指南\n\n正文',
        modifiedAt: null,
        path: '/repo/guide.md',
        title: '指南',
      }),
    );
    expect(context.document?.contentHash).toMatch(/^fnv1a-/);
  });

  it('falls back to the document name when metadata title is empty', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/readme.md',
        id: '/repo/readme.md',
        kind: 'document',
        name: 'readme.md',
        relativePath: 'readme.md',
      },
      documentPanelData: {
        markdown: '# Readme',
        metadata: { createdAt: '', title: '', updatedAt: '' },
      },
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.document?.title).toBe('readme.md');
  });

  it('omits document context when no document is open', () => {
    const context = buildAiContextPack({
      currentDocument: null,
      documentPanelData: null,
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.document).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the failing context test**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel/__tests__/ai-context.test.ts
```

Expected: FAIL because `ai-context.ts` does not exist.

- [ ] **Step 3: Add the context builder**

Create `components/workspace/ai-panel/ai-context.ts`:

```ts
import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import type { WorkspaceNode } from '@/components/workspace/workspace-types';

import type { AiContextPack, AiIntent } from './ai-types';

interface BuildAiContextPackInput {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  intent: AiIntent;
  workspaceRootPath: string;
}

export function buildAiContextPack({
  currentDocument,
  documentPanelData,
  intent,
  workspaceRootPath,
}: BuildAiContextPackInput): AiContextPack {
  const context: AiContextPack = {
    intent,
    workspaceRootPath,
  };

  if (!currentDocument || !documentPanelData) {
    return context;
  }

  const title =
    documentPanelData.metadata.title ||
    currentDocument.title ||
    currentDocument.name;

  return {
    ...context,
    document: {
      contentHash: createStableContentHash(documentPanelData.markdown),
      dirty: false,
      markdown: documentPanelData.markdown,
      modifiedAt: null,
      path: currentDocument.absolutePath,
      title,
    },
  };
}

export function createStableContentHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
```

- [ ] **Step 4: Run the context test**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel/__tests__/ai-context.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/ai-panel/ai-context.ts components/workspace/ai-panel/__tests__/ai-context.test.ts
git commit -m "feat(ai): 构建 Markdown 文档上下文"
```

---

### Task 3: Add AI Facade To Workspace API

**Files:**
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Add failing API wrapper tests**

Modify `components/workspace/__tests__/workspace-api.test.ts`.

Add these imports to the existing import list from `../workspace-api`:

```ts
  cancelAiTurn,
  listAiAgentProfiles,
  listenAiEvents,
  sendAiPrompt,
  startAiSession,
  stopAiSession,
```

Append this test block after the terminal command tests:

```ts
describe('workspace-api AI runtime commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it('wraps AI runtime Tauri commands', async () => {
    const context = {
      intent: 'chat' as const,
      workspaceRootPath: '/repo',
    };

    invokeMock
      .mockResolvedValueOnce([
        {
          capabilities: {
            diff: false,
            models: false,
            readWorkspace: true,
            shell: false,
            slashCommands: false,
            writeWorkspace: false,
          },
          detection: { status: 'available' },
          id: 'fake-echo',
          kind: 'fake',
          label: 'Fake Echo',
        },
      ])
      .mockResolvedValueOnce({
        profileId: 'fake-echo',
        rootPath: '/repo',
        sessionId: 'ai-1',
        status: 'running',
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await listAiAgentProfiles('/repo');
    await startAiSession({
      context,
      profileId: 'fake-echo',
      rootPath: '/repo',
    });
    await sendAiPrompt({
      context,
      prompt: 'hello',
      sessionId: 'ai-1',
    });
    await cancelAiTurn('ai-1');
    await stopAiSession('ai-1');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_ai_agent_profiles', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'start_ai_session', {
      input: {
        context,
        profileId: 'fake-echo',
        rootPath: '/repo',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'send_ai_prompt', {
      input: {
        context,
        prompt: 'hello',
        sessionId: 'ai-1',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'cancel_ai_turn', {
      sessionId: 'ai-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'stop_ai_session', {
      sessionId: 'ai-1',
    });
  });

  it('wraps AI runtime event listener', async () => {
    const onEvent = vi.fn();
    const unlisten = vi.fn();

    listenMock.mockResolvedValueOnce(unlisten);

    await listenAiEvents(onEvent);

    expect(listenMock).toHaveBeenCalledWith('ai:event', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run the failing API wrapper test**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because the AI facade exports do not exist.

- [ ] **Step 3: Add AI imports to `workspace-api.ts`**

At the top of `components/workspace/workspace-api.ts`, add these type imports:

```ts
import type {
  AiAgentProfile,
  AiRuntimeEvent,
  AiSessionInfo,
  SendAiPromptInput,
  StartAiSessionInput,
} from './ai-panel/ai-types';
```

- [ ] **Step 4: Add AI facade functions to `workspace-api.ts`**

Insert these functions before `selectMarkdownSourceFiles`:

```ts
export async function listAiAgentProfiles(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiAgentProfile[]>('list_ai_agent_profiles', { rootPath });
}

export async function startAiSession(input: StartAiSessionInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiSessionInfo>('start_ai_session', { input });
}

export async function sendAiPrompt(input: SendAiPromptInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('send_ai_prompt', { input });
}

export async function cancelAiTurn(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('cancel_ai_turn', { sessionId });
}

export async function stopAiSession(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('stop_ai_session', { sessionId });
}

export async function listenAiEvents(
  handler: (event: AiRuntimeEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<AiRuntimeEvent>('ai:event', (event) => handler(event.payload));
}
```

- [ ] **Step 5: Run the API wrapper test**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS. Existing unused-import lint warnings in this test file may remain until the broader lint step.

- [ ] **Step 6: Commit**

```bash
git add components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat(ai): 添加 AI runtime 前端调用封装"
```

---

### Task 4: Add Tauri Fake Agent Runtime

**Files:**
- Create: `src-tauri/src/agent_runtime.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust runtime module**

Create `src-tauri/src/agent_runtime.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Default)]
pub struct AgentRuntimeState {
    runtime: Mutex<AgentRuntime>,
}

#[derive(Default)]
struct AgentRuntime {
    sessions: HashMap<String, AiSessionInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentCapabilities {
    pub read_workspace: bool,
    pub write_workspace: bool,
    pub shell: bool,
    pub diff: bool,
    pub models: bool,
    pub slash_commands: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentProfile {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub capabilities: AiAgentCapabilities,
    pub detection: AiAgentDetection,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentDetection {
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionInfo {
    pub session_id: String,
    pub profile_id: String,
    pub root_path: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartAiSessionInput {
    pub root_path: String,
    pub profile_id: String,
    pub context: AiContextPack,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendAiPromptInput {
    pub session_id: String,
    pub prompt: String,
    pub context: AiContextPack,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextPack {
    pub workspace_root_path: String,
    pub intent: String,
    pub document: Option<AiContextDocument>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextDocument {
    pub path: String,
    pub title: String,
    pub markdown: String,
    pub modified_at: Option<u128>,
    pub content_hash: String,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiRuntimeEvent {
    SessionStarted { session: AiSessionInfo },
    MessageDelta {
        session_id: String,
        message_id: String,
        delta: String,
    },
    MessageCompleted {
        session_id: String,
        message_id: String,
    },
    TurnCompleted {
        session_id: String,
        cancelled: bool,
    },
    SessionExited { session_id: String },
    Error {
        session_id: Option<String>,
        message: String,
    },
}

#[tauri::command]
pub fn list_ai_agent_profiles(root_path: String) -> Result<Vec<AiAgentProfile>, String> {
    validate_agent_root(&root_path)?;

    Ok(vec![fake_echo_profile()])
}

#[tauri::command]
pub fn start_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: StartAiSessionInput,
) -> Result<AiSessionInfo, String> {
    let root = validate_agent_root(&input.root_path)?;

    if input.profile_id != "fake-echo" {
        return Err("AI agent profile 不可用".to_string());
    }

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;
    let session = runtime.start_session(input.profile_id, root);
    emit_ai_event(
        &app,
        AiRuntimeEvent::SessionStarted {
            session: session.clone(),
        },
    );

    Ok(session)
}

#[tauri::command]
pub fn send_ai_prompt(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: SendAiPromptInput,
) -> Result<(), String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    if !runtime.has_session(&input.session_id) {
        emit_ai_event(
            &app,
            AiRuntimeEvent::Error {
                message: "AI 会话不存在".to_string(),
                session_id: Some(input.session_id),
            },
        );
        return Err("AI 会话不存在".to_string());
    }

    drop(runtime);

    let message_id = Uuid::new_v4().to_string();
    let response = build_fake_response(&input);

    emit_ai_event(
        &app,
        AiRuntimeEvent::MessageDelta {
            delta: response,
            message_id: message_id.clone(),
            session_id: input.session_id.clone(),
        },
    );
    emit_ai_event(
        &app,
        AiRuntimeEvent::MessageCompleted {
            message_id,
            session_id: input.session_id.clone(),
        },
    );
    emit_ai_event(
        &app,
        AiRuntimeEvent::TurnCompleted {
            cancelled: false,
            session_id: input.session_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn cancel_ai_turn(app: AppHandle, session_id: String) -> Result<(), String> {
    emit_ai_event(
        &app,
        AiRuntimeEvent::TurnCompleted {
            cancelled: true,
            session_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn stop_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<(), String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    runtime.stop_session(&session_id)?;
    emit_ai_event(&app, AiRuntimeEvent::SessionExited { session_id });

    Ok(())
}

impl AgentRuntime {
    fn start_session(&mut self, profile_id: String, root: PathBuf) -> AiSessionInfo {
        let session = AiSessionInfo {
            profile_id,
            root_path: root.to_string_lossy().to_string(),
            session_id: Uuid::new_v4().to_string(),
            status: "running".to_string(),
        };

        self.sessions
            .insert(session.session_id.clone(), session.clone());

        session
    }

    fn has_session(&self, session_id: &str) -> bool {
        self.sessions.contains_key(session_id)
    }

    fn stop_session(&mut self, session_id: &str) -> Result<(), String> {
        self.sessions
            .remove(session_id)
            .map(|_| ())
            .ok_or_else(|| "AI 会话不存在".to_string())
    }
}

fn fake_echo_profile() -> AiAgentProfile {
    AiAgentProfile {
        capabilities: AiAgentCapabilities {
            diff: false,
            models: false,
            read_workspace: true,
            shell: false,
            slash_commands: false,
            write_workspace: false,
        },
        detection: AiAgentDetection {
            message: None,
            status: "available".to_string(),
        },
        id: "fake-echo".to_string(),
        kind: "fake".to_string(),
        label: "Fake Echo".to_string(),
    }
}

fn build_fake_response(input: &SendAiPromptInput) -> String {
    match input.context.document.as_ref() {
        Some(document) => format!(
            "Echo: {}\n\nContext: {} ({})",
            input.prompt, document.title, document.content_hash
        ),
        None => format!("Echo: {}", input.prompt),
    }
}

fn validate_agent_root(root_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;

    if !root.is_dir() {
        return Err("工作区路径不是目录".to_string());
    }

    Ok(root)
}

fn emit_ai_event(app: &AppHandle, event: AiRuntimeEvent) {
    let _ = app.emit("ai:event", event);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_context(root: &str) -> AiContextPack {
        AiContextPack {
            document: None,
            intent: "chat".to_string(),
            workspace_root_path: root.to_string(),
        }
    }

    #[test]
    fn fake_profile_is_available_and_read_only() {
        let profile = fake_echo_profile();

        assert_eq!(profile.id, "fake-echo");
        assert_eq!(profile.detection.status, "available");
        assert!(profile.capabilities.read_workspace);
        assert!(!profile.capabilities.write_workspace);
        assert!(!profile.capabilities.shell);
    }

    #[test]
    fn validates_existing_directory_as_agent_root() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let root = validate_agent_root(&temp_dir.path().to_string_lossy())
            .expect("校验工作区失败");

        assert_eq!(root, temp_dir.path().canonicalize().unwrap());
    }

    #[test]
    fn rejects_missing_agent_root() {
        let error = validate_agent_root("/definitely/missing/refinex/wiki")
            .expect_err("缺失路径应失败");

        assert!(error.contains("工作区路径不可用"));
    }

    #[test]
    fn starts_and_stops_session() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let mut runtime = AgentRuntime::default();

        let session = runtime.start_session(
            "fake-echo".to_string(),
            temp_dir.path().canonicalize().unwrap(),
        );

        assert!(runtime.has_session(&session.session_id));
        runtime
            .stop_session(&session.session_id)
            .expect("停止 session 失败");
        assert!(!runtime.has_session(&session.session_id));
    }

    #[test]
    fn fake_response_includes_document_context_when_available() {
        let input = SendAiPromptInput {
            context: AiContextPack {
                document: Some(AiContextDocument {
                    content_hash: "fnv1a-abc".to_string(),
                    dirty: false,
                    markdown: "# 指南".to_string(),
                    modified_at: None,
                    path: "/repo/guide.md".to_string(),
                    title: "指南".to_string(),
                }),
                intent: "summarize-document".to_string(),
                workspace_root_path: "/repo".to_string(),
            },
            prompt: "总结此页面".to_string(),
            session_id: "ai-1".to_string(),
        };

        assert_eq!(
            build_fake_response(&input),
            "Echo: 总结此页面\n\nContext: 指南 (fnv1a-abc)"
        );
    }

    #[test]
    fn list_profiles_requires_valid_root() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let profiles = list_ai_agent_profiles(temp_dir.path().to_string_lossy().to_string())
            .expect("读取 profile 失败");

        assert_eq!(profiles, vec![fake_echo_profile()]);
    }

    #[test]
    fn context_helper_is_used_by_tests() {
        let context = test_context("/repo");

        assert_eq!(context.workspace_root_path, "/repo");
        assert_eq!(context.intent, "chat");
    }
}
```

- [ ] **Step 2: Register the runtime module**

Modify `src-tauri/src/lib.rs`.

Add the module declaration near the top:

```rust
mod agent_runtime;
```

Add managed state inside `tauri::Builder::default()`:

```rust
        .manage(agent_runtime::AgentRuntimeState::default())
```

Add the commands to `tauri::generate_handler![...]`:

```rust
            agent_runtime::list_ai_agent_profiles,
            agent_runtime::start_ai_session,
            agent_runtime::send_ai_prompt,
            agent_runtime::cancel_ai_turn,
            agent_runtime::stop_ai_session,
```

- [ ] **Step 3: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml agent_runtime
```

Expected: PASS.

- [ ] **Step 4: Run broader Tauri tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agent_runtime.rs src-tauri/src/lib.rs
git commit -m "feat(ai): 添加 Tauri AI fake runtime"
```

---

### Task 5: Build Functional AI Panel UI

**Files:**
- Create: `components/workspace/ai-panel/ai-panel-content.tsx`
- Test: `components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`

- [ ] **Step 1: Write AI panel UI tests**

Create `components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import type { AiRuntimeEvent } from '../ai-types';
import { AiPanelContent } from '../ai-panel-content';

const aiHandlers: Array<(event: AiRuntimeEvent) => void> = [];

const listAiAgentProfilesMock = vi.fn();
const startAiSessionMock = vi.fn();
const sendAiPromptMock = vi.fn();
const cancelAiTurnMock = vi.fn();
const stopAiSessionMock = vi.fn();

vi.mock('@/components/workspace/workspace-api', () => ({
  cancelAiTurn: (...args: unknown[]) => cancelAiTurnMock(...args),
  listAiAgentProfiles: (...args: unknown[]) => listAiAgentProfilesMock(...args),
  listenAiEvents: (handler: (event: AiRuntimeEvent) => void) => {
    aiHandlers.push(handler);
    return Promise.resolve(() => {
      const index = aiHandlers.indexOf(handler);
      if (index >= 0) {
        aiHandlers.splice(index, 1);
      }
    });
  },
  sendAiPrompt: (...args: unknown[]) => sendAiPromptMock(...args),
  startAiSession: (...args: unknown[]) => startAiSessionMock(...args),
  stopAiSession: (...args: unknown[]) => stopAiSessionMock(...args),
}));

const documentPanelData: DocumentPanelData = {
  markdown: '# 指南\n\n正文',
  metadata: {
    createdAt: '2026-06-19T00:00:00Z',
    title: '指南',
    updatedAt: '2026-06-19T01:00:00Z',
  },
};

const currentDocument = {
  absolutePath: '/repo/guide.md',
  id: '/repo/guide.md',
  kind: 'document' as const,
  name: 'guide.md',
  relativePath: 'guide.md',
  title: '指南',
};

describe('AiPanelContent', () => {
  beforeEach(() => {
    aiHandlers.splice(0, aiHandlers.length);
    listAiAgentProfilesMock.mockReset();
    startAiSessionMock.mockReset();
    sendAiPromptMock.mockReset();
    cancelAiTurnMock.mockReset();
    stopAiSessionMock.mockReset();

    listAiAgentProfilesMock.mockResolvedValue([
      {
        capabilities: {
          diff: false,
          models: false,
          readWorkspace: true,
          shell: false,
          slashCommands: false,
          writeWorkspace: false,
        },
        detection: { status: 'available' },
        id: 'fake-echo',
        kind: 'fake',
        label: 'Fake Echo',
      },
    ]);
    startAiSessionMock.mockResolvedValue({
      profileId: 'fake-echo',
      rootPath: '/repo',
      sessionId: 'ai-1',
      status: 'running',
    });
    sendAiPromptMock.mockResolvedValue(undefined);
    cancelAiTurnMock.mockResolvedValue(undefined);
    stopAiSessionMock.mockResolvedValue(undefined);
  });

  it('loads agent profiles for the workspace', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() =>
      expect(listAiAgentProfilesMock).toHaveBeenCalledWith('/repo'),
    );
    expect(await screen.findByText('Fake Echo')).toBeTruthy();
  });

  it('submits a prompt with current Markdown context', async () => {
    const user = userEvent.setup();
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      '总结此页面',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(startAiSessionMock).toHaveBeenCalled());
    expect(sendAiPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '总结此页面',
        sessionId: 'ai-1',
        context: expect.objectContaining({
          document: expect.objectContaining({
            markdown: '# 指南\n\n正文',
            path: '/repo/guide.md',
            title: '指南',
          }),
          intent: 'chat',
          workspaceRootPath: '/repo',
        }),
      }),
    );
    expect(screen.getByText('总结此页面')).toBeTruthy();
  });

  it('renders runtime assistant events', async () => {
    const user = userEvent.setup();
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      'hello',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(aiHandlers).toHaveLength(1));
    aiHandlers[0]({
      delta: 'Echo: hello',
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageDelta',
    });
    aiHandlers[0]({
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageCompleted',
    });

    expect(await screen.findByText('Echo: hello')).toBeTruthy();
  });

  it('cancels the current turn', async () => {
    const user = userEvent.setup();
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      'hello',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(startAiSessionMock).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '停止' }));

    expect(cancelAiTurnMock).toHaveBeenCalledWith('ai-1');
  });
});
```

- [ ] **Step 2: Run the failing AI panel UI test**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx
```

Expected: FAIL because `ai-panel-content.tsx` does not exist.

- [ ] **Step 3: Add the AI panel UI component**

Create `components/workspace/ai-panel/ai-panel-content.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Bot, ListTree, Send, Sparkles, Square } from 'lucide-react';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import { Button } from '@/components/ui/button';
import {
  cancelAiTurn,
  listAiAgentProfiles,
  listenAiEvents,
  sendAiPrompt,
  startAiSession,
} from '@/components/workspace/workspace-api';
import type { WorkspaceNode } from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

import { buildAiContextPack } from './ai-context';
import {
  createInitialAiPanelState,
  reduceAiPanelState,
} from './ai-reducer';
import type { AiIntent } from './ai-types';

interface AiPanelContentProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  workspaceRootPath: string | null;
}

export function AiPanelContent({
  currentDocument,
  documentPanelData,
  workspaceRootPath,
}: AiPanelContentProps) {
  const [state, dispatch] = React.useReducer(
    reduceAiPanelState,
    undefined,
    createInitialAiPanelState,
  );
  const [prompt, setPrompt] = React.useState('');

  React.useEffect(() => {
    if (!workspaceRootPath) {
      return;
    }

    let cancelled = false;

    listAiAgentProfiles(workspaceRootPath)
      .then((profiles) => {
        if (!cancelled) {
          dispatch({ profiles, type: 'profilesLoaded' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({
            message:
              error instanceof Error ? error.message : '无法读取 AI agent 列表',
            type: 'errorRaised',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath]);

  React.useEffect(() => {
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

  const submitPrompt = React.useCallback(
    async (content: string, intent: AiIntent = 'chat') => {
      if (!workspaceRootPath || !state.selectedProfileId || !content.trim()) {
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

      dispatch({
        content,
        id: userMessageId,
        type: 'userMessageSubmitted',
      });
      dispatch({ type: 'connectRequested' });

      try {
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

        await sendAiPrompt({
          context,
          prompt: content,
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
      state.selectedProfileId,
      state.session,
      workspaceRootPath,
    ],
  );

  const selectedProfile = state.profiles.find(
    (profile) => profile.id === state.selectedProfileId,
  );
  const canSend =
    Boolean(workspaceRootPath) &&
    Boolean(state.selectedProfileId) &&
    Boolean(prompt.trim()) &&
    state.status !== 'streaming' &&
    state.status !== 'connecting';

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b px-3">
        <span className="truncate text-sm font-medium">AI 助手</span>
        <span className="truncate text-xs text-muted-foreground">
          {selectedProfile?.label ?? '未连接'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            {currentDocument?.title || currentDocument?.name || '未选择文档'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {workspaceRootPath
              ? '当前上下文将以 Markdown 发送到本地 AI runtime。'
              : '请选择工作区后使用 AI。'}
          </p>
        </div>

        <div className="grid gap-2">
          <QuickActionButton
            disabled={!documentPanelData}
            icon={<Sparkles size={15} />}
            label="总结此页面"
            onClick={() => submitPrompt('总结此页面', 'summarize-document')}
          />
          <QuickActionButton
            disabled={!documentPanelData}
            icon={<Bot size={15} />}
            label="解释当前文档"
            onClick={() => submitPrompt('解释当前文档', 'explain-selection')}
          />
          <QuickActionButton
            disabled={!documentPanelData}
            icon={<ListTree size={15} />}
            label="生成大纲"
            onClick={() => submitPrompt('生成大纲', 'generate-outline')}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20 p-3">
          {state.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              选择一个操作，或直接输入问题。
            </p>
          ) : (
            <div className="space-y-3">
              {state.messages.map((message) => (
                <div
                  className={cn(
                    'rounded-md px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background',
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
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitPrompt(prompt);
          }}
        >
          <textarea
            className="min-h-20 flex-1 resize-none rounded-md border bg-background p-3 text-sm outline-none"
            disabled={!workspaceRootPath}
            placeholder="向 AI 询问当前工作区..."
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
          <div className="flex flex-col gap-2">
            <Button aria-label="发送" disabled={!canSend} size="icon" type="submit">
              <Send size={15} />
            </Button>
            <Button
              aria-label="停止"
              disabled={!state.session || state.status !== 'streaming'}
              size="icon"
              type="button"
              variant="outline"
              onClick={() => {
                if (state.session) {
                  cancelAiTurn(state.session.sessionId);
                }
              }}
            >
              <Square size={15} />
            </Button>
          </div>
        </form>
      </div>
    </>
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
      className="justify-start"
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
```

- [ ] **Step 4: Run the AI panel UI test**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/ai-panel/ai-panel-content.tsx components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx
git commit -m "feat(ai): 实现右侧 AI 对话面板"
```

---

### Task 6: Wire AI Panel Into Right Side Panel

**Files:**
- Modify: `components/workspace/ai-side-panel.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Add integration test expectations**

In `components/workspace/__tests__/workspace-layout.test.tsx`, add imports or mocks for AI API if not already covered by existing global mocks:

```ts
vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    listenAiEvents: vi.fn(() => Promise.resolve(() => {})),
    listAiAgentProfiles: vi.fn(() =>
      Promise.resolve([
        {
          capabilities: {
            diff: false,
            models: false,
            readWorkspace: true,
            shell: false,
            slashCommands: false,
            writeWorkspace: false,
          },
          detection: { status: 'available' },
          id: 'fake-echo',
          kind: 'fake',
          label: 'Fake Echo',
        },
      ]),
    ),
  };
});
```

Add this test near the right panel tests:

```tsx
it('opens the functional AI panel with the current document context', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByTestId('ai-panel-icon-button'));

  expect(await screen.findByText('AI 助手')).toBeTruthy();
  expect(await screen.findByText('Fake Echo')).toBeTruthy();
  expect(screen.getByPlaceholderText('向 AI 询问当前工作区...')).toBeTruthy();
});
```

- [ ] **Step 2: Run the failing integration test**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx -t "functional AI panel"
```

Expected: FAIL because `RightSidePanel` still renders the placeholder and does not pass `documentPanelData` into `AiPanelContent`.

- [ ] **Step 3: Replace the inline AI placeholder**

Modify `components/workspace/ai-side-panel.tsx`.

Add import:

```ts
import { AiPanelContent } from './ai-panel/ai-panel-content';
```

Change the AI branch in `RightSidePanel`:

```tsx
{mode === 'ai' ? (
  <AiPanelContent
    currentDocument={currentDocument}
    documentPanelData={documentPanelData}
    workspaceRootPath={workspaceRootPath}
  />
) : mode === 'toc' ? (
```

Delete the inline `AiPanelContent` function at the bottom of the file.

Remove unused imports from `components/workspace/ai-side-panel.tsx`:

```ts
Bot
Sparkles
Button
```

Keep `ListTree` because the right tool rail still uses it.

- [ ] **Step 4: Confirm `workspace-layout.tsx` already passes required props**

Verify this block remains unchanged:

```tsx
<RightSidePanel
  currentDocument={activePanelDocument}
  documentPanelData={documentPanelData}
  mode={workspace.rightPanelMode}
  tocSnapshot={tocSnapshot}
  width={rightPanelWidth}
  workspaceRootPath={workspaceRootPath}
/>
```

If TypeScript reports no prop mismatch, do not modify `workspace-layout.tsx`.

- [ ] **Step 5: Run the integration test**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx -t "functional AI panel"
```

Expected: PASS.

- [ ] **Step 6: Run focused AI/workspace tests**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/workspace/ai-side-panel.tsx components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat(ai): 接入右侧 AI 面板入口"
```

---

### Task 7: Run Full Verification For v0.1

**Files:**
- No code edits.

- [ ] **Step 1: Run narrow TypeScript tests**

Run:

```bash
pnpm test:run -- components/workspace/ai-panel components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run narrow Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml agent_runtime
```

Expected: PASS.

- [ ] **Step 3: Run broader frontend tests**

Run:

```bash
pnpm test:run
```

Expected: PASS.

- [ ] **Step 4: Run broader Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Run static and governance checks**

Run:

```bash
git diff --check
pnpm harness:check
pnpm lint
pnpm build:desktop:web
```

Expected:

- `git diff --check`: PASS.
- `pnpm harness:check`: 0 errors and 0 warnings.
- `pnpm lint`: 0 errors. Existing warnings must be called out if they remain unrelated.
- `pnpm build:desktop:web`: PASS.

- [ ] **Step 6: Manual smoke check**

Run:

```bash
pnpm desktop:dev
```

Expected:

1. App launches.
2. Open a workspace.
3. Click the right AI icon.
4. `Fake Echo` profile appears.
5. Type `hello` and press send.
6. The panel displays a user message and an assistant echo response.
7. Clicking stop during a turn calls cancel without changing Tauri permissions.

- [ ] **Step 7: Final commit**

```bash
git status --short
git add components/workspace/ai-panel components/workspace/ai-side-panel.tsx components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/workspace-layout.test.tsx src-tauri/src/agent_runtime.rs src-tauri/src/lib.rs
git commit -m "feat(ai): 接入右侧 AI runtime 骨架"
```

---

## Self-Review

Spec coverage:

- v0.1 AI panel component and event reducer: Task 1, Task 5, Task 6.
- `workspace-api.ts` AI facade: Task 3.
- Tauri `AgentRuntimeState`, profile detection, session start/stop/cancel: Task 4.
- fake echo adapter without real API key: Task 4.
- streaming/error/stop UI path: Task 1, Task 5, Task 7.
- Markdown document context: Task 2, Task 5.
- No frontend shell spawn and no permission expansion: File Structure and Task 7.

Deferred spec items:

- v0.2 ACP stdio agent integration.
- v0.3 permission request, diff preview, Markdown apply.
- v0.4 provider adapter and SDK sidecar.
- v0.5 remote agent, MCP, persistent sessions.

Placeholder scan:

- The plan intentionally avoids placeholder markers and unspecified implementation steps.
- Each code-changing step includes concrete code or an exact replacement.
- Each verification step lists exact commands and expected results.

Type consistency:

- TypeScript event names match Rust `serde(tag = "type", rename_all = "camelCase")`.
- `sessionId`, `profileId`, and `rootPath` match frontend camelCase expectations.
- Tauri command names match `workspace-api.ts` wrappers.

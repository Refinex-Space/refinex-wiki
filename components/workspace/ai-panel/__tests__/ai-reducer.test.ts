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
  isTestRuntime: true,
  kind: 'fake',
  label: 'Fake Echo',
  modelId: 'fake-echo',
  modelLabel: 'fake-echo',
  providerId: 'local',
  providerLabel: 'Local',
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

  it('keeps an explicit disabled profile selection from settings', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      profiles: [profile],
      selectedProfileId: null,
      type: 'profilesLoaded',
    });

    expect(state.profiles).toEqual([profile]);
    expect(state.selectedProfileId).toBeNull();
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
      event: {
        session: {
          profileId: 'fake-echo',
          rootPath: '/repo',
          sessionId: 'ai-1',
          status: 'running',
        },
        type: 'sessionStarted',
      },
      type: 'runtimeEventReceived',
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

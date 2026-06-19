import type {
  AiPanelAction,
  AiPanelState,
  AiRuntimeEvent,
} from './ai-types';

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
      const explicitSelectedProfileId = Object.prototype.hasOwnProperty.call(
        action,
        'selectedProfileId',
      );
      const selectedProfileId =
        explicitSelectedProfileId
          ? (action.selectedProfileId ?? null)
          : (state.selectedProfileId ??
            action.profiles.find(
              (profile) => profile.detection.status === 'available',
            )?.id ??
            action.profiles[0]?.id ??
            null);

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
  event: AiRuntimeEvent,
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

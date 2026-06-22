import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';

import { AiPanelContent } from '../ai-panel-content';
import type { AiRuntimeEvent } from '../ai-types';

const mocks = vi.hoisted(() => ({
  aiHandlers: [] as Array<(event: AiRuntimeEvent) => void>,
  cancelAiTurn: vi.fn(),
  isTauriRuntime: vi.fn(),
  listAiAgentModels: vi.fn(),
  listAiAgentProfiles: vi.fn(),
  readAppSettings: vi.fn(),
  requestAiChat: vi.fn(),
  sendAiPrompt: vi.fn(),
  startAiSession: vi.fn(),
  stopAiSession: vi.fn(),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  cancelAiTurn: (...args: unknown[]) => mocks.cancelAiTurn(...args),
  isTauriRuntime: () => mocks.isTauriRuntime(),
  listAiAgentProfiles: (...args: unknown[]) =>
    mocks.listAiAgentProfiles(...args),
  listAiAgentModels: (...args: unknown[]) => mocks.listAiAgentModels(...args),
  listenAiEvents: (handler: (event: AiRuntimeEvent) => void) => {
    mocks.aiHandlers.push(handler);

    return Promise.resolve(() => {
      const index = mocks.aiHandlers.indexOf(handler);

      if (index >= 0) {
        mocks.aiHandlers.splice(index, 1);
      }
    });
  },
  readAppSettings: (...args: unknown[]) => mocks.readAppSettings(...args),
  requestAiChat: (...args: unknown[]) => mocks.requestAiChat(...args),
  sendAiPrompt: (...args: unknown[]) => mocks.sendAiPrompt(...args),
  startAiSession: (...args: unknown[]) => mocks.startAiSession(...args),
  stopAiSession: (...args: unknown[]) => mocks.stopAiSession(...args),
}));

const documentPanelData: DocumentPanelData = {
  frontmatter: {},
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

const fakeEchoProfile = {
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

const codexProfile = {
  capabilities: {
    diff: true,
    models: true,
    readWorkspace: true,
    shell: false,
    slashCommands: true,
    writeWorkspace: true,
  },
  detection: { status: 'available' },
  id: 'codex:local',
  isTestRuntime: false,
  kind: 'codex_app_server',
  label: 'Codex',
  modelId: 'codex:local',
  modelLabel: 'Codex',
  providerId: 'codex',
  providerLabel: 'Codex',
};

const defaultAppSettings = {
  ai: {
    enabledProfileId: 'fake-echo',
    profiles: [
      {
        enabled: true,
        id: 'fake-echo',
        isTestRuntime: true,
        kind: 'fake',
        label: 'Fake Echo',
        modelId: 'fake-echo',
        modelLabel: 'fake-echo',
        providerId: 'local',
        providerLabel: 'Local',
      },
    ],
  },
  appearance: { pageWidthMode: 'wide' },
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
};

describe('AiPanelContent', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    mocks.aiHandlers.splice(0, mocks.aiHandlers.length);
    mocks.listAiAgentProfiles.mockReset();
    mocks.listAiAgentModels.mockReset();
    mocks.isTauriRuntime.mockReset();
    mocks.readAppSettings.mockReset();
    mocks.requestAiChat.mockReset();
    mocks.startAiSession.mockReset();
    mocks.sendAiPrompt.mockReset();
    mocks.cancelAiTurn.mockReset();
    mocks.stopAiSession.mockReset();

    mocks.listAiAgentProfiles.mockResolvedValue([fakeEchoProfile]);
    mocks.listAiAgentModels.mockResolvedValue([
      {
        available: true,
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        profileId: 'codex:local',
        providerId: 'codex',
        providerLabel: 'Codex',
      },
      {
        available: true,
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        profileId: 'codex:local',
        providerId: 'codex',
        providerLabel: 'Codex',
      },
    ]);
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.readAppSettings.mockResolvedValue(defaultAppSettings);
    mocks.requestAiChat.mockResolvedValue({
      body: { output_text: 'Provider response' },
      status: 200,
    });
    mocks.startAiSession.mockResolvedValue({
      profileId: 'fake-echo',
      rootPath: '/repo',
      sessionId: 'ai-1',
      status: 'running',
    });
    mocks.sendAiPrompt.mockResolvedValue(undefined);
    mocks.cancelAiTurn.mockResolvedValue(undefined);
    mocks.stopAiSession.mockResolvedValue(undefined);
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
      expect(mocks.listAiAgentProfiles).toHaveBeenCalledWith('/repo'),
    );
    expect(await screen.findByText('Fake Echo')).toBeTruthy();
  });

  it('does not subscribe to Tauri AI events outside the desktop runtime', () => {
    mocks.isTauriRuntime.mockReturnValue(false);

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath={null}
      />,
    );

    expect(mocks.aiHandlers).toHaveLength(0);
  });

  it('shows the selected assistant in the compact model control', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findByText('Fake Echo')).toBeTruthy();
    expect(screen.queryByText('Local')).toBeNull();
    expect(screen.queryByText('测试运行时')).toBeNull();
  });

  it('prefers a connected local assistant over the persisted fake echo profile', async () => {
    mocks.listAiAgentProfiles.mockResolvedValueOnce([
      fakeEchoProfile,
      codexProfile,
    ]);

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findByText('Codex')).toBeTruthy();
    expect(screen.queryByText('Fake Echo')).toBeNull();
  });

  it('loads selectable models from the runtime model command when the picker opens', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '选择模型' }));

    await waitFor(() =>
      expect(mocks.listAiAgentModels).toHaveBeenCalledWith('/repo'),
    );
    expect(await screen.findByPlaceholderText('Search models...')).toBeTruthy();
    expect(screen.getByText('Codex Models')).toBeTruthy();
    expect(screen.getAllByText('GPT-5.4').length).toBeGreaterThan(0);
    expect(screen.getByText('GPT-5.5')).toBeTruthy();
    expect(screen.queryByText('fake-echo')).toBeNull();
    expect(screen.getByTestId('ai-model-popover').className).toContain(
      'max-w-[calc(100vw-2rem)]',
    );
  });

  it('places model controls and send action inside the composer footer', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    const composer = screen.getByTestId('ai-composer');
    const footer = screen.getByTestId('ai-composer-footer');

    expect(composer.contains(footer)).toBe(true);
    expect(footer.contains(screen.getByRole('button', { name: '选择模型' }))).toBe(
      true,
    );
    expect(footer.contains(screen.getByRole('button', { name: '发送' }))).toBe(
      true,
    );
  });

  it('offers quick actions, new sessions, and searchable session history from the panel toolbar', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '快捷动作' }));
    expect(await screen.findByRole('button', { name: 'Generate Title' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '历史会话' }));
    expect(await screen.findByPlaceholderText('Search...')).toBeTruthy();
    expect(screen.getByText('权限上下文代码注释补充')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '新会话' }));
    expect(screen.getByText('New session')).toBeTruthy();
  });

  it('blocks prompts when no local AI profile is available', async () => {
    const openSettings = vi.fn();

    mocks.listAiAgentProfiles.mockResolvedValueOnce([]);
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        enabledProfileId: null,
        profiles: [
          {
            ...defaultAppSettings.ai.profiles[0],
            enabled: false,
          },
        ],
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
        onOpenSettings={openSettings}
      />,
    );

    expect(await screen.findAllByText('未启用 AI 模型')).not.toHaveLength(0);
    const settingsButtons = screen.getAllByRole('button', {
      name: '打开 AI 设置',
    });

    await userEvent.click(settingsButtons[settingsButtons.length - 1]);

    expect(openSettings).toHaveBeenCalled();
    expect(
      (
        screen.getByPlaceholderText(
          '向 AI 询问当前工作区...',
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
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
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.startAiSession).toHaveBeenCalled());
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          document: expect.objectContaining({
            markdown: '# 指南\n\n正文',
            path: '/repo/guide.md',
            title: '指南',
          }),
          intent: 'chat',
          workspaceRootPath: '/repo',
        }),
        prompt: '总结此页面',
        sessionId: 'ai-1',
      }),
    );
    expect(screen.getAllByText('总结此页面')).toHaveLength(1);
  });

  it('does not submit prompts through configured provider runtime', async () => {
    mocks.listAiAgentProfiles.mockResolvedValueOnce([]);
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        enabledProfileId: null,
        profiles: [
          {
            ...defaultAppSettings.ai.profiles[0],
            enabled: false,
          },
        ],
        providers: {
          agentDefaultModelId: 'gpt-5.4',
          agentDefaultProviderId: 'openai',
          defaultModelId: null,
          defaultProviderId: null,
          inlineDefaultModelId: null,
          inlineDefaultProviderId: null,
          providers: [
            {
              apiStyle: 'openai-responses',
              baseUrl: 'https://api.openai.com/v1',
              defaultModelId: 'gpt-5.4',
              enabled: true,
              id: 'openai',
              models: [
                {
                  capabilities: ['text'],
                  enabled: true,
                  id: 'gpt-5.4',
                  name: 'GPT-5.4',
                },
              ],
              name: 'OpenAI',
              secretStatus: 'configured',
              type: 'openai',
            },
          ],
        },
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findAllByText('未启用 AI 模型')).not.toHaveLength(0);
    expect(
      (
        screen.getByPlaceholderText(
          '向 AI 询问当前工作区...',
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(mocks.startAiSession).not.toHaveBeenCalled();
    expect(mocks.requestAiChat).not.toHaveBeenCalled();
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
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    mocks.aiHandlers[0]({
      delta: 'Echo: hello',
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageDelta',
    });
    mocks.aiHandlers[0]({
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
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(mocks.startAiSession).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '停止' }));

    expect(mocks.cancelAiTurn).toHaveBeenCalledWith('ai-1');
  });
});

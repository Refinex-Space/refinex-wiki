import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelAiTurn,
  createWorkspaceDirectory,
  createWorkspaceRoot,
  deleteAiProviderSecret,
  deleteWorkspaceNode,
  detectAiAccounts,
  ensureWorkspace,
  getAiProviderSecretStatus,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  gitBranches,
  gitCommit,
  gitCommitFileDiff,
  gitCommitFiles,
  gitDeleteFile,
  gitDiff,
  gitInit,
  gitLog,
  gitProbe,
  gitPush,
  gitRevertFile,
  gitStage,
  gitStatus,
  gitUnstage,
  listAiAgentProfiles,
  listenAiEvents,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  listDailyNotesForMonth,
  moveWorkspaceNode,
  openDailyNote,
  readMarkdownSourceFiles,
  readAppSettings,
  readWorkspaceAssetData,
  recordRecentDocument,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  requestAiChat,
  requestAiProviderJson,
  saveAppSettings,
  saveAiProviderSecret,
  sendAiPrompt,
  startAiSession,
  stopAiSession,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
  uploadWorkspaceAsset,
} from '../workspace-api';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [],
};

describe('workspace-api history', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records opened workspaces as most recent first', () => {
    recordWorkspaceHistory(snapshot);
    recordWorkspaceHistory({
      rootPath: '/docs',
      rootName: 'docs',
      nodes: [],
    });

    expect(getWorkspaceHistory()).toEqual([
      expect.objectContaining({ rootName: 'docs', rootPath: '/docs' }),
      expect.objectContaining({ rootName: 'repo', rootPath: '/repo' }),
    ]);
    expect(getRecentWorkspacePath()).toBe('/docs');
  });

  it('deduplicates an existing workspace path', () => {
    recordWorkspaceHistory(snapshot);
    recordWorkspaceHistory({
      rootPath: '/repo',
      rootName: 'repo-renamed',
      nodes: [],
    });

    expect(getWorkspaceHistory()).toHaveLength(1);
    expect(getWorkspaceHistory()[0]).toEqual(
      expect.objectContaining({ rootName: 'repo-renamed', rootPath: '/repo' }),
    );
  });

  it('removes a workspace from history without deleting other entries', () => {
    recordWorkspaceHistory(snapshot);
    recordWorkspaceHistory({
      rootPath: '/docs',
      rootName: 'docs',
      nodes: [],
    });

    expect(removeWorkspaceHistory('/docs')).toEqual([
      expect.objectContaining({ rootName: 'repo', rootPath: '/repo' }),
    ]);
    expect(getRecentWorkspacePath()).toBe('/repo');
  });

});

describe('workspace-api native Git commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('wraps native Git commands through Tauri', async () => {
    invokeMock
      .mockResolvedValueOnce({
        branch: null,
        gitAvailable: true,
        isRepository: false,
        rootPath: '/repo',
      })
      .mockResolvedValueOnce({
        branch: 'main',
        gitAvailable: true,
        isRepository: true,
        rootPath: '/repo',
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        binary: false,
        content: 'diff --git a/a.md b/a.md',
        path: 'a.md',
        staged: false,
        truncated: false,
      })
      .mockResolvedValueOnce([
        {
          commit: 'abc123',
          current: true,
          fullName: 'refs/heads/main',
          kind: 'local',
          name: 'main',
          upstream: 'origin/main',
        },
      ])
      .mockResolvedValueOnce([
        {
          authorEmail: 'refinex@example.com',
          authorName: 'refinex',
          authoredAt: '2026-06-02T00:00:00Z',
          body: '',
          hash: 'abc123',
          refs: ['HEAD -> main'],
          shortHash: 'abc123',
          subject: 'docs: update a',
        },
      ])
      .mockResolvedValueOnce([
        {
          changeType: 'modified',
          oldPath: null,
          path: 'a.md',
          status: 'M',
        },
      ])
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      });

    await gitProbe('/repo');
    await gitInit('/repo');
    await gitStatus('/repo');
    await gitDiff('/repo', 'a.md', false);
    await gitCommitFileDiff('/repo', 'abc123', 'a.md');
    await gitBranches('/repo');
    await gitLog('/repo');
    await gitCommitFiles('/repo', 'abc123');
    await gitStage('/repo', ['a.md']);
    await gitUnstage('/repo', ['a.md']);
    await gitCommit('/repo', 'docs: update a', ['a.md']);
    await gitPush('/repo');
    await gitRevertFile('/repo', 'a.md');
    await gitDeleteFile('/repo', 'a.md');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'git_probe', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'git_init', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'git_status', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'git_diff', {
      rootPath: '/repo',
      path: 'a.md',
      staged: false,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'git_commit_file_diff', {
      rootPath: '/repo',
      hash: 'abc123',
      path: 'a.md',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'git_branches', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'git_log', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'git_commit_files', {
      rootPath: '/repo',
      hash: 'abc123',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'git_stage', {
      rootPath: '/repo',
      paths: ['a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'git_unstage', {
      rootPath: '/repo',
      paths: ['a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'git_commit', {
      rootPath: '/repo',
      message: 'docs: update a',
      paths: ['a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(12, 'git_push', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(13, 'git_revert_file', {
      rootPath: '/repo',
      path: 'a.md',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(14, 'git_delete_file', {
      rootPath: '/repo',
      path: 'a.md',
    });
  });
});

describe('workspace-api terminal commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it('wraps terminal Tauri commands', async () => {
    invokeMock
      .mockResolvedValueOnce({
        cwd: '/repo',
        id: 'term-1',
        shell: '/bin/zsh',
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: 'missing' })
      .mockResolvedValueOnce({ status: 'configured' })
      .mockResolvedValueOnce({ status: 'missing' })
      .mockResolvedValueOnce({ status: 200, body: { data: [] } })
      .mockResolvedValueOnce({ status: 200, body: { text: 'ok' } });

    await expect(terminalSpawn('/repo', 120, 32)).resolves.toEqual({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });
    await terminalWrite('term-1', 'git status\r');
    await terminalResize('term-1', 100, 24);
    await terminalKill('term-1');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'terminal_spawn', {
      rootPath: '/repo',
      cols: 120,
      rows: 32,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'terminal_write', {
      sessionId: 'term-1',
      data: 'git status\r',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'terminal_resize', {
      sessionId: 'term-1',
      cols: 100,
      rows: 24,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'terminal_kill', {
      sessionId: 'term-1',
    });
  });

  it('wraps terminal event listeners', async () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const onExit = vi.fn();
    const unlisten = vi.fn();

    listenMock
      .mockResolvedValueOnce(unlisten)
      .mockResolvedValueOnce(unlisten)
      .mockResolvedValueOnce(unlisten);

    await listenTerminalData(onData);
    await listenTerminalExit(onExit);
    await listenTerminalError(onError);

    expect(listenMock).toHaveBeenNthCalledWith(
      1,
      'terminal:data',
      expect.any(Function),
    );
    expect(listenMock).toHaveBeenNthCalledWith(
      2,
      'terminal:exit',
      expect.any(Function),
    );
    expect(listenMock).toHaveBeenNthCalledWith(
      3,
      'terminal:error',
      expect.any(Function),
    );
  });
});

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
          isTestRuntime: true,
          kind: 'fake',
          label: 'Fake Echo',
          modelId: 'fake-echo',
          modelLabel: 'fake-echo',
          providerId: 'local',
          providerLabel: 'Local',
        },
      ])
      .mockResolvedValueOnce([
        {
          commandPath: '/usr/local/bin/codex',
          id: 'codex',
          label: 'Codex',
          message: 'Local Codex app-server detected.',
          models: [],
          providerId: 'openai',
          providerLabel: 'OpenAI',
          status: 'connected',
          transport: 'app-server',
          version: 'codex-cli 0.130.0',
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
    await detectAiAccounts();
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
    await getAiProviderSecretStatus('openai');
    await saveAiProviderSecret('openai', 'sk-test');
    await deleteAiProviderSecret('openai');
    await requestAiProviderJson({
      headers: {},
      method: 'GET',
      providerId: 'openai',
      url: 'https://api.openai.com/v1/models',
    });
    await requestAiChat({
      body: '{"model":"gpt-5.4","input":"hello"}',
      headers: { 'OpenAI-Beta': 'responses=v1' },
      providerId: 'openai',
      url: 'https://api.openai.com/v1/responses',
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_ai_agent_profiles', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'detect_ai_accounts');
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'start_ai_session', {
      input: {
        context,
        profileId: 'fake-echo',
        rootPath: '/repo',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'send_ai_prompt', {
      input: {
        context,
        prompt: 'hello',
        sessionId: 'ai-1',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'cancel_ai_turn', {
      sessionId: 'ai-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'stop_ai_session', {
      sessionId: 'ai-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'get_ai_provider_secret_status', {
      providerId: 'openai',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'save_ai_provider_secret', {
      providerId: 'openai',
      secret: 'sk-test',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'delete_ai_provider_secret', {
      providerId: 'openai',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'request_ai_provider_json', {
      request: {
        headers: {},
        method: 'GET',
        providerId: 'openai',
        url: 'https://api.openai.com/v1/models',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'request_ai_chat', {
      request: {
        body: '{"model":"gpt-5.4","input":"hello"}',
        headers: { 'OpenAI-Beta': 'responses=v1' },
        providerId: 'openai',
        url: 'https://api.openai.com/v1/responses',
      },
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

describe('workspace-api recent documents', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes record_recent_document with root and document path', async () => {
    invokeMock.mockResolvedValueOnce(['/repo/a.md']);

    const paths = await recordRecentDocument('/repo', '/repo/a.md');

    expect(paths).toEqual(['/repo/a.md']);
    expect(invokeMock).toHaveBeenLastCalledWith('record_recent_document', {
      rootPath: '/repo',
      documentPath: '/repo/a.md',
    });
  });

  it('invokes ensure_workspace with root path', async () => {
    invokeMock.mockResolvedValueOnce({
      schemaVersion: 1,
      recentDocumentPaths: ['/repo/a.md'],
      expandedPaths: [],
      sortOrder: {},
    });

    const metadata = await ensureWorkspace('/repo');

    expect(metadata.recentDocumentPaths).toEqual(['/repo/a.md']);
    expect(invokeMock).toHaveBeenLastCalledWith('ensure_workspace', {
      rootPath: '/repo',
    });
  });

  it('invokes Daily Note commands with root and date arguments', async () => {
    invokeMock
      .mockResolvedValueOnce({
        node: {
          id: 'Daily/2026/06/2026-06-20.md',
          name: '2026-06-20.md',
          kind: 'document',
          relativePath: 'Daily/2026/06/2026-06-20.md',
          absolutePath: '/repo/Daily/2026/06/2026-06-20.md',
          title: '2026-06-20',
        },
        content: {
          path: '/repo/Daily/2026/06/2026-06-20.md',
          content: '# 2026-06-20\n',
          modifiedAt: 1,
        },
      })
      .mockResolvedValueOnce({
        month: '2026-06',
        entries: [
          {
            date: '2026-06-20',
            documentPath: '/repo/Daily/2026/06/2026-06-20.md',
            hasContent: true,
            updatedAt: 1,
          },
        ],
      });

    await openDailyNote('/repo', '2026-06-20');
    await listDailyNotesForMonth('/repo', '2026-06');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'open_daily_note', {
      rootPath: '/repo',
      date: '2026-06-20',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'list_daily_notes_for_month', {
      rootPath: '/repo',
      month: '2026-06',
    });
  });
});

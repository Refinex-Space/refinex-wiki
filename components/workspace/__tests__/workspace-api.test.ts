import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceDirectory,
  createWorkspaceRoot,
  deleteWorkspaceNode,
  ensureWorkspace,
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
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  moveWorkspaceNode,
  readMarkdownSourceFiles,
  readAppSettings,
  readWorkspaceAssetData,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  saveAppSettings,
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
      .mockResolvedValueOnce(undefined);

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

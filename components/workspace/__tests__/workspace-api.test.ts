import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createImportedPlateDocuments,
  createPlateDocument,
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
  moveWorkspaceNode,
  readMarkdownSourceFiles,
  readPlateDocument,
  readAppSettings,
  readWorkspaceAssetData,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  saveAppSettings,
  savePlateDocument,
  uploadWorkspaceAsset,
} from '../workspace-api';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

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

describe('workspace-api native Plate commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('wraps native Plate workspace commands through Tauri', async () => {
    const envelope = {
      schemaVersion: 1,
      title: '指南',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z',
      content: [{ type: 'p', children: [{ text: '正文' }] }],
    };

    invokeMock
      .mockResolvedValueOnce({
        schemaVersion: 1,
        recentDocumentPath: null,
        expandedPaths: [],
        sortOrder: {},
      })
      .mockResolvedValueOnce({
        rootPath: '/Users/refinex/新知识库',
        rootName: '新知识库',
        nodes: [],
      })
      .mockResolvedValueOnce({
        path: '/repo/guide.plate.json',
        envelope,
        modifiedAt: 1,
      })
      .mockResolvedValueOnce({
        path: '/repo/guide.plate.json',
        modifiedAt: 2,
      })
      .mockResolvedValueOnce({
        node: {
          id: 'guide.plate.json',
          name: 'guide.plate.json',
          kind: 'document',
          relativePath: 'guide.plate.json',
          absolutePath: '/repo/guide.plate.json',
          title: '指南',
        },
        envelope,
      })
      .mockResolvedValueOnce({
        id: 'docs',
        name: 'docs',
        kind: 'directory',
        relativePath: 'docs',
        absolutePath: '/repo/docs',
        children: [],
      })
      .mockResolvedValueOnce([{ path: '/tmp/a.md', fileName: 'a.md', content: '# A' }])
      .mockResolvedValueOnce({ created: [], failed: [] })
      .mockResolvedValueOnce({
        id: 'guide-renamed.plate.json',
        name: 'guide-renamed.plate.json',
        kind: 'document',
        relativePath: 'guide-renamed.plate.json',
        absolutePath: '/repo/guide-renamed.plate.json',
        title: '新指南',
      })
      .mockResolvedValueOnce({ path: '/repo/guide-renamed.plate.json' })
      .mockResolvedValueOnce({
        rootPath: '/repo',
        rootName: 'repo',
        nodes: [],
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        storage: { defaultProvider: 'local' },
        appearance: { pageWidthMode: 'standard' },
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        storage: { defaultProvider: 'local' },
        appearance: { pageWidthMode: 'standard' },
      })
      .mockResolvedValueOnce({
        id: 'asset-a',
        url: 'refinex-asset://asset-a',
        name: 'cover.png',
        mediaType: 'image/png',
        size: 123,
        absolutePath: '/repo/.refinex/assets/files/as/asset-a.png',
      })
      .mockResolvedValueOnce({
        id: 'asset-a',
        name: 'cover.png',
        mediaType: 'image/png',
        size: 123,
        absolutePath: '/repo/.refinex/assets/files/as/asset-a.png',
      })
      .mockResolvedValueOnce({
        id: 'asset-a',
        name: 'cover.png',
        mediaType: 'image/png',
        base64Data: 'cG5n',
      });

    await ensureWorkspace('/repo');
    await createWorkspaceRoot('/Users/refinex', '新知识库');
    await readPlateDocument('/repo', '/repo/guide.plate.json');
    await savePlateDocument('/repo', '/repo/guide.plate.json', envelope);
    await createPlateDocument('/repo', '', '指南');
    await createWorkspaceDirectory('/repo', '', 'docs');
    await readMarkdownSourceFiles(['/tmp/a.md']);
    await createImportedPlateDocuments('/repo', '', [
      { title: 'A', sourceFileName: 'a.md', content: envelope.content },
    ]);
    await renameWorkspaceNode('/repo', '/repo/guide.plate.json', '新指南');
    await deleteWorkspaceNode('/repo', '/repo/guide.plate.json');
    await moveWorkspaceNode('/repo', {
      nodePath: '/repo/guide.plate.json',
      targetPath: '/repo/docs',
      position: 'inside',
    });
    await readAppSettings();
    await saveAppSettings({
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'standard' },
    });
    await uploadWorkspaceAsset('/repo', {
      base64Data: 'ZmlsZQ==',
      fileName: 'cover.png',
      mediaType: 'image/png',
    });
    await resolveWorkspaceAsset('/repo', 'asset-a');
    await readWorkspaceAssetData('/repo', 'asset-a');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'ensure_workspace', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'create_workspace_root', {
      parentPath: '/Users/refinex',
      workspaceName: '新知识库',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'read_plate_document', {
      rootPath: '/repo',
      documentPath: '/repo/guide.plate.json',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'save_plate_document', {
      rootPath: '/repo',
      documentPath: '/repo/guide.plate.json',
      envelope,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'create_plate_document', {
      rootPath: '/repo',
      parentPath: '',
      title: '指南',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'create_workspace_directory', {
      rootPath: '/repo',
      parentPath: '',
      name: 'docs',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'read_markdown_source_files', {
      sourcePaths: ['/tmp/a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      8,
      'create_imported_plate_documents',
      {
        rootPath: '/repo',
        targetDir: '',
        documents: [
          { title: 'A', sourceFileName: 'a.md', content: envelope.content },
        ],
      },
    );
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'rename_workspace_node', {
      rootPath: '/repo',
      nodePath: '/repo/guide.plate.json',
      newName: '新指南',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'delete_workspace_node', {
      rootPath: '/repo',
      nodePath: '/repo/guide.plate.json',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'move_workspace_node', {
      rootPath: '/repo',
      nodePath: '/repo/guide.plate.json',
      targetParentPath: '/repo/docs',
      beforePath: null,
      afterPath: null,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(12, 'read_app_settings');
    expect(invokeMock).toHaveBeenNthCalledWith(13, 'save_app_settings', {
      settings: {
        schemaVersion: 1,
        storage: { defaultProvider: 'local' },
        appearance: { pageWidthMode: 'standard' },
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(14, 'upload_workspace_asset', {
      rootPath: '/repo',
      input: {
        base64Data: 'ZmlsZQ==',
        fileName: 'cover.png',
        mediaType: 'image/png',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(15, 'resolve_workspace_asset', {
      rootPath: '/repo',
      assetId: 'asset-a',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(16, 'read_workspace_asset_data', {
      rootPath: '/repo',
      assetId: 'asset-a',
    });
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

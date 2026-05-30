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
  readMarkdownSourceFiles,
  readPlateDocument,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  savePlateDocument,
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
      .mockResolvedValueOnce({ path: '/repo/guide-renamed.plate.json' });

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
  });
});

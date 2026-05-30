import { beforeEach, describe, expect, it } from 'vitest';

import {
  getRecentWorkspacePath,
  getWorkspaceHistory,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
} from '../workspace-api';
import type { WorkspaceSnapshot } from '../workspace-types';

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

import { describe, expect, it } from 'vitest';

import {
  filterWorkspaceNodes,
  flattenDocuments,
  searchWorkspace,
} from '../workspace-tree';
import type { WorkspaceNode } from '../workspace-types';

const nodes: WorkspaceNode[] = [
  {
    id: 'dir-guides',
    name: 'Guides',
    kind: 'directory',
    relativePath: 'Guides',
    absolutePath: '/repo/Guides',
    children: [
      {
        id: 'doc-a',
        name: 'intro.md',
        kind: 'document',
        relativePath: 'Guides/intro.md',
        absolutePath: '/repo/Guides/intro.md',
        title: '入门指南',
      },
    ],
  },
  {
    id: 'doc-root',
    name: 'README.md',
    kind: 'document',
    relativePath: 'README.md',
    absolutePath: '/repo/README.md',
    title: '项目说明',
  },
];

describe('workspace-tree', () => {
  it('flattens Markdown document nodes only', () => {
    expect(flattenDocuments(nodes).map((item) => item.relativePath)).toEqual([
      'Guides/intro.md',
      'README.md',
    ]);
  });

  it('searches by filename, path, and native title', () => {
    expect(searchWorkspace(nodes, '入门')).toHaveLength(1);
    expect(searchWorkspace(nodes, 'guides')).toHaveLength(1);
    expect(searchWorkspace(nodes, 'readme')).toHaveLength(1);
  });

  it('keeps parent directory when descendants match filtered tree', () => {
    expect(filterWorkspaceNodes(nodes, 'intro')).toEqual([
      expect.objectContaining({
        kind: 'directory',
        children: [
          expect.objectContaining({
            relativePath: 'Guides/intro.md',
          }),
        ],
      }),
    ]);
  });
});

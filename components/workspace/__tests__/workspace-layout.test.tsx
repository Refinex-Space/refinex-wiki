import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPlateDocument,
  createWorkspaceDirectory,
  createWorkspaceRoot,
  loadWorkspaceTree,
  readPlateDocument,
  selectWorkspaceParentDirectory,
} from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: vi.fn(),
    theme: 'light',
  }),
}));

vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    onTocSnapshotChange,
  }: {
    onTocSnapshotChange?: (snapshot: unknown) => void;
  }) => (
    <button
      data-testid="plate-editor"
      type="button"
      onClick={() =>
        onTocSnapshotChange?.({
          activeContentId: 'h2-a',
          items: [
            {
              depth: 1,
              id: 'h2-a',
              originalDepth: 2,
              title: '背景',
              type: 'h2',
            },
          ],
          scrollToHeading: vi.fn(),
        })
      }
    >
      editor
    </button>
  ),
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    createPlateDocument: vi.fn(),
    createWorkspaceDirectory: vi.fn(),
    createWorkspaceRoot: vi.fn(),
    loadWorkspaceTree: vi.fn(),
    readPlateDocument: vi.fn(),
    selectWorkspaceParentDirectory: vi.fn(),
    setAppWindowTitle: vi.fn(),
  };
});

const createPlateDocumentMock = vi.mocked(createPlateDocument);
const createWorkspaceDirectoryMock = vi.mocked(createWorkspaceDirectory);
const createWorkspaceRootMock = vi.mocked(createWorkspaceRoot);
const loadWorkspaceTreeMock = vi.mocked(loadWorkspaceTree);
const readPlateDocumentMock = vi.mocked(readPlateDocument);
const selectWorkspaceParentDirectoryMock = vi.mocked(
  selectWorkspaceParentDirectory,
);

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'readme',
      name: 'README.plate.json',
      kind: 'document',
      relativePath: 'README.plate.json',
      absolutePath: '/repo/README.plate.json',
      title: '项目说明',
    },
  ],
};

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    createPlateDocumentMock.mockReset();
    createWorkspaceDirectoryMock.mockReset();
    createWorkspaceRootMock.mockReset();
    loadWorkspaceTreeMock.mockReset();
    readPlateDocumentMock.mockReset();
    selectWorkspaceParentDirectoryMock.mockReset();
  });

  it('shows empty workspace action before selecting folder', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(
      screen.getAllByRole('button', { name: '选择文件夹' }).length,
    ).toBeGreaterThan(0);
  });

  it('does not duplicate the empty workspace action in the sidebar document area', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(
      screen.queryByText('选择一个包含 Markdown 文档的文件夹。'),
    ).toBeNull();
  });

  it('filters documents by title', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.type(screen.getByPlaceholderText('搜索标题或路径'), '项目');

    expect(screen.getByText('项目说明')).toBeTruthy();
  });

  it('keeps ai panel collapsed by default and expands from the right tool rail', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('right-tool-rail')).toBeTruthy();
    expect(screen.getByTestId('ai-panel-icon')).toBeTruthy();
    expect(screen.queryByTestId('ai-panel-island')).toBeNull();
    expect(screen.queryByText('总结此页面')).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    expect(screen.getByTestId('ai-panel-island')).toBeTruthy();
    expect(screen.getByText('总结此页面')).toBeTruthy();
  });

  it('switches between ai and document toc from the right tool rail', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('right-tool-rail')).toBeTruthy();
    expect(screen.queryByTestId('ai-panel-island')).toBeNull();
    expect(screen.queryByTestId('document-toc-panel')).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    expect(screen.getByTestId('ai-panel-island')).toBeTruthy();
    expect(screen.queryByTestId('document-toc-panel')).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开目录面板' }));

    expect(screen.queryByTestId('ai-panel-island')).toBeNull();
    expect(screen.getByTestId('document-toc-panel')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '折叠目录面板' }));

    expect(screen.queryByTestId('ai-panel-island')).toBeNull();
    expect(screen.queryByTestId('document-toc-panel')).toBeNull();
  });

  it('keeps the active right tool visually highlighted', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '展开目录面板' }));

    expect(screen.getByTestId('toc-panel-icon-button').className).toContain(
      'bg-[#3574f0]',
    );
    expect(screen.getByTestId('ai-panel-icon-button').className).not.toContain(
      'bg-[#3574f0]',
    );
  });

  it('shows settings menu from the bottom of the right tool rail', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const rail = screen.getByTestId('right-tool-rail');
    const settingsButton = screen.getByRole('button', { name: '打开设置菜单' });

    expect(rail.lastElementChild).toBe(settingsButton);
    expect(settingsButton.className).toContain('mt-auto');

    await user.click(settingsButton);

    const themeSubmenu = screen.getByText('主题');

    expect(themeSubmenu).toBeTruthy();

    await user.hover(themeSubmenu);

    expect(await screen.findByText('亮色')).toBeTruthy();
    expect(screen.getByText('暗色')).toBeTruthy();
    expect(screen.getByText('跟随系统')).toBeTruthy();
  });

  it('renders toc snapshot from the active Plate editor in the right toc panel', async () => {
    const user = userEvent.setup();
    readPlateDocumentMock.mockResolvedValueOnce({
      envelope: {
        schemaVersion: 1,
        title: '项目说明',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [{ children: [{ text: '项目说明' }], type: 'h1' }],
      },
      modifiedAt: 1,
      path: '/repo/README.plate.json',
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await user.click(await screen.findByTestId('plate-editor'));
    await user.click(screen.getByRole('button', { name: '展开目录面板' }));

    expect(screen.getByRole('button', { name: '背景' })).toBeTruthy();
  });

  it('renders save state in the workspace bottom background area', async () => {
    const user = userEvent.setup();
    readPlateDocumentMock.mockResolvedValueOnce({
      envelope: {
        schemaVersion: 1,
        title: '项目说明',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [
          { children: [{ text: '项目说明' }], type: 'h1' },
          {
            children: [
              { text: '正文 ' },
              { children: [{ text: '加粗' }], bold: true },
            ],
            type: 'p',
          },
        ],
      },
      modifiedAt: 1,
      path: '/repo/README.plate.json',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await screen.findByTestId('plate-editor');

    const blocks = screen.getByTestId('workspace-main-blocks');
    const statusBar = screen.getByTestId('workspace-status-bar');

    expect(blocks.className).toContain('flex-1');
    expect(statusBar.textContent).toBe('字数：8已保存');
    expect(statusBar.className).toContain('shrink-0');
    expect(statusBar.className).not.toContain('absolute');
    expect(
      blocks.compareDocumentPosition(statusBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId('editor-status-bar')).toBeNull();
  });

  it('shows workspace guide in the top workspace entry when there is no history', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('还没有打开过的工作区')).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建工作区' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '选择其他目录' })).toBeTruthy();
  });

  it('creates a workspace from the top workspace entry', async () => {
    const user = userEvent.setup();
    createWorkspaceRootMock.mockResolvedValueOnce({
      rootPath: '/Users/refinex/知识库',
      rootName: '知识库',
      nodes: [],
    });
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建工作区' }));
    await user.type(screen.getByLabelText('工作区名称'), '知识库');
    await user.type(screen.getByLabelText('所在目录'), '/Users/refinex');
    await user.click(screen.getByRole('button', { name: '创建并打开' }));

    expect(createWorkspaceRootMock).toHaveBeenCalledWith(
      '/Users/refinex',
      '知识库',
    );
    expect((await screen.findAllByText('知识库')).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('/Users/refinex/知识库').length,
    ).toBeGreaterThan(0);
  });

  it('fills workspace parent path from directory picker', async () => {
    const user = userEvent.setup();
    selectWorkspaceParentDirectoryMock.mockResolvedValueOnce('/Users/refinex');
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建工作区' }));
    await user.click(screen.getByRole('button', { name: '选择所在目录' }));

    expect((screen.getByLabelText('所在目录') as HTMLInputElement).value).toBe(
      '/Users/refinex',
    );
  });

  it('shows first-content actions in an empty workspace', () => {
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    expect(screen.getByText('开始创建你的第一个文档')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '新建文档' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '新建目录' }).length).toBeGreaterThan(0);
    expect(screen.getByText('这个工作区还没有文档')).toBeTruthy();
  });

  it('creates and opens the first document from the editor empty state', async () => {
    const user = userEvent.setup();
    const createdNode = {
      id: 'untitled',
      name: '未命名文档.plate.json',
      kind: 'document' as const,
      relativePath: '未命名文档.plate.json',
      absolutePath: '/repo/未命名文档.plate.json',
      title: '未命名文档',
    };
    const envelope = {
      schemaVersion: 1 as const,
      title: '未命名文档',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z',
      content: [{ type: 'p', children: [{ text: '' }] }],
    };
    createPlateDocumentMock.mockResolvedValueOnce({
      node: createdNode,
      envelope,
    });
    loadWorkspaceTreeMock.mockResolvedValueOnce({
      ...snapshot,
      nodes: [createdNode],
    });
    readPlateDocumentMock.mockResolvedValueOnce({
      path: createdNode.absolutePath,
      envelope,
      modifiedAt: 1,
    });
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    await user.click(screen.getAllByRole('button', { name: '新建文档' })[0]);

    expect(createPlateDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名文档',
    );
    expect(await screen.findByTestId('plate-editor')).toBeTruthy();
  });

  it('creates a first directory from the sidebar empty state', async () => {
    const user = userEvent.setup();
    createWorkspaceDirectoryMock.mockResolvedValueOnce({
      id: '未命名目录',
      name: '未命名目录',
      kind: 'directory',
      relativePath: '未命名目录',
      absolutePath: '/repo/未命名目录',
      children: [],
    });
    loadWorkspaceTreeMock.mockResolvedValueOnce({
      ...snapshot,
      nodes: [
        {
          id: '未命名目录',
          name: '未命名目录',
          kind: 'directory',
          relativePath: '未命名目录',
          absolutePath: '/repo/未命名目录',
          children: [],
        },
      ],
    });
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    await user.click(screen.getAllByRole('button', { name: '新建目录' })[1]);

    expect(createWorkspaceDirectoryMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名目录',
    );
    expect(await screen.findByDisplayValue('未命名目录')).toBeTruthy();
  });

  it('shows current workspace in the top entry for quick switching', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'refinex-wiki:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('最近工作区')).toBeTruthy();
    expect(screen.getAllByText('repo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/repo').length).toBeGreaterThan(0);
  });

  it('creates root documents and directories from the top workspace entry', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'refinex-wiki:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    createPlateDocumentMock.mockResolvedValueOnce({
      node: {
        id: 'untitled',
        name: '未命名文档.plate.json',
        kind: 'document',
        relativePath: '未命名文档.plate.json',
        absolutePath: '/repo/未命名文档.plate.json',
        title: '未命名文档',
      },
      envelope: {
        schemaVersion: 1,
        title: '未命名文档',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [{ type: 'p', children: [{ text: '' }] }],
      },
    });
    createWorkspaceDirectoryMock.mockResolvedValueOnce({
      id: '未命名目录',
      name: '未命名目录',
      kind: 'directory',
      relativePath: '未命名目录',
      absolutePath: '/repo/未命名目录',
      children: [],
    });
    loadWorkspaceTreeMock.mockResolvedValue({
      ...snapshot,
      nodes: snapshot.nodes,
    });
    readPlateDocumentMock.mockResolvedValueOnce({
      path: '/repo/未命名文档.plate.json',
      envelope: {
        schemaVersion: 1,
        title: '未命名文档',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [{ type: 'p', children: [{ text: '' }] }],
      },
      modifiedAt: 1,
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建文档' }));
    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建目录' }));

    expect(createPlateDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名文档',
    );
    expect(createWorkspaceDirectoryMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名目录',
    );
  });

  it('does not render the duplicated bottom workspace switcher', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('workspace-switcher-footer')).toBeNull();
  });

  it('uses a glow status dot instead of a folder icon for the workspace entry', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('workspace-status-dot')).toBeTruthy();
    expect(screen.queryByTestId('workspace-root-folder-icon')).toBeNull();
  });

  it('closes the workspace menu when clicking outside the switcher card', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'refinex-wiki:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('最近工作区')).toBeTruthy();

    await user.click(document.body);

    expect(screen.queryByText('最近工作区')).toBeNull();
  });

  it('removes a workspace from recent workspace menu', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'refinex-wiki:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '移除工作区 repo' }));

    expect(
      screen.queryByRole('button', { name: '移除工作区 repo' }),
    ).toBeNull();
    expect(screen.getByText('还没有打开过的工作区')).toBeTruthy();
    expect(screen.queryByText('项目说明')).toBeNull();
    expect(screen.queryByText('/repo')).toBeNull();
    expect(screen.getByText('打开一个工作区')).toBeTruthy();
  });

  it('removes duplicated workspace display above search box', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByRole('button', { name: '切换工作区' })).toBeNull();
    expect(screen.getByPlaceholderText('搜索标题或路径')).toBeTruthy();
  });

  it('does not reserve an extra app title row in the web layout', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('workspace-titlebar')).toBeNull();
    expect(screen.queryByText('未选择文档')).toBeNull();
    expect(screen.getByPlaceholderText('搜索标题或路径')).toBeTruthy();
  });

  it('keeps the active document title out of the editor body chrome', async () => {
    const user = userEvent.setup();
    readPlateDocumentMock.mockResolvedValueOnce({
      path: '/repo/README.plate.json',
      envelope: {
        schemaVersion: 1,
        title: '项目说明',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [{ type: 'p', children: [{ text: '正文' }] }],
      },
      modifiedAt: 1,
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('editor-document-path')).toBeNull();

    await user.click(screen.getByText('项目说明'));

    expect(await screen.findByTestId('plate-editor')).toBeTruthy();
    expect(screen.queryByTestId('editor-document-path')).toBeNull();
  });

  it('keeps the sidebar toggle in the left tool rail', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const toolRail = screen.getByTestId('left-tool-rail');

    expect(
      toolRail.querySelector('button[aria-label="折叠目录"]'),
    ).not.toBeNull();
    expect(screen.queryByTestId('workspace-titlebar')).toBeNull();

    await user.click(screen.getByRole('button', { name: '折叠目录' }));

    expect(screen.getByRole('button', { name: '展开目录' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('搜索标题或路径')).toBeNull();
  });
});

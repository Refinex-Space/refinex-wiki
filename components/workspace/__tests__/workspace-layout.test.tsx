import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: () => <div data-testid="plate-editor" />,
}));

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'readme',
      name: 'README.md',
      kind: 'document',
      relativePath: 'README.md',
      absolutePath: '/repo/README.md',
      title: '项目说明',
    },
  ],
};

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it('shows workspace guide in bottom switcher when there is no history', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('还没有打开过的工作区')).toBeTruthy();
    expect(screen.getByRole('button', { name: '选择目录' })).toBeTruthy();
  });

  it('shows current workspace in bottom switcher for quick switching', async () => {
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
    expect(screen.getByText('打开一个 Markdown 工作区')).toBeTruthy();
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
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('editor-document-path')).toBeNull();

    await user.click(screen.getByText('项目说明'));

    expect(screen.getByTestId('plate-editor')).toBeTruthy();
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

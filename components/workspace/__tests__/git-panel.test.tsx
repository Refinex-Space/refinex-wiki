import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GitPanel } from '../git-panel';
import type { GitProbe, GitStatus } from '../workspace-types';

const probe: GitProbe = {
  branch: 'main',
  gitAvailable: true,
  isRepository: true,
  rootPath: '/repo',
};

const status: GitStatus = {
  ahead: 1,
  behind: 0,
  branch: 'main',
  changes: [
    {
      changeType: 'modified',
      indexStatus: '',
      oldPath: null,
      path: 'docs/a.md',
      staged: false,
      workingTreeStatus: 'M',
    },
  ],
  rootPath: '/repo',
  upstream: 'origin/main',
};

type RenderGitPanelOptions = Partial<
  React.ComponentProps<typeof GitPanel>
>;

function renderGitPanel(options: RenderGitPanelOptions = {}) {
  return render(
    <GitPanel
      error={null}
      isLoading={false}
      probe={probe}
      selectedPath={null}
      selectedPaths={new Set(['docs/a.md'])}
      status={status}
      onCommit={vi.fn()}
      onCommitSingleFile={vi.fn()}
      onDeleteFile={vi.fn()}
      onInitRepository={vi.fn()}
      onRefresh={vi.fn()}
      onRevertFile={vi.fn()}
      onSelectChange={vi.fn()}
      onSelectFile={vi.fn()}
      onStageSelected={vi.fn()}
      onUnstageFile={vi.fn()}
      onUnstageSelected={vi.fn()}
      {...options}
    />,
  );
}

describe('GitPanel', () => {
  it('shows init action for non repository workspace', () => {
    const onInitRepository = vi.fn();

    renderGitPanel({
      onInitRepository,
      probe: {
        branch: null,
        gitAvailable: true,
        isRepository: false,
        rootPath: '/repo',
      },
      selectedPaths: new Set(),
      status: null,
    });

    fireEvent.click(screen.getByRole('button', { name: '初始化 Git 仓库' }));

    expect(onInitRepository).toHaveBeenCalledTimes(1);
  });

  it('selects files and submits a commit message', async () => {
    const user = userEvent.setup();
    const onSelectChange = vi.fn();
    const onCommit = vi.fn();

    renderGitPanel({ onCommit, onSelectChange });

    await user.click(screen.getByRole('checkbox', { name: '选择 docs/a.md' }));
    await user.type(screen.getByLabelText('提交信息'), 'docs: update a');
    await user.click(screen.getByRole('button', { name: '提交 1 个文件' }));

    expect(onSelectChange).toHaveBeenCalledWith('docs/a.md', false);
    expect(onCommit).toHaveBeenCalledWith('docs: update a');
  });

  it('opens a context menu for a changed file and shows diff', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    renderGitPanel({ onSelectFile });

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /docs\/a.md/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '显示差异' }));

    expect(onSelectFile).toHaveBeenCalledWith('docs/a.md');
  });

  it('focuses commit message when committing a single file from menu', async () => {
    const user = userEvent.setup();
    const onCommitSingleFile = vi.fn();

    renderGitPanel({ onCommitSingleFile });

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /docs\/a.md/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '提交' }));

    expect(onCommitSingleFile).toHaveBeenCalledWith('docs/a.md');
    await waitFor(() => {
      expect(screen.getByLabelText('提交信息')).toBe(document.activeElement);
    });
  });

  it('confirms before reverting a file', async () => {
    const user = userEvent.setup();
    const onRevertFile = vi.fn();

    renderGitPanel({ onRevertFile });

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /docs\/a.md/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '回滚' }));
    await user.click(await screen.findByRole('button', { name: '确认回滚' }));

    expect(onRevertFile).toHaveBeenCalledWith('docs/a.md');
  });

  it('confirms before deleting a file', async () => {
    const user = userEvent.setup();
    const onDeleteFile = vi.fn();

    renderGitPanel({ onDeleteFile });

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /docs\/a.md/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '删除' }));
    await user.click(await screen.findByRole('button', { name: '确认删除' }));

    expect(onDeleteFile).toHaveBeenCalledWith('docs/a.md');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
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

describe('GitPanel', () => {
  it('shows init action for non repository workspace', () => {
    const onInitRepository = vi.fn();

    render(
      <GitPanel
        error={null}
        isLoading={false}
        probe={{
          branch: null,
          gitAvailable: true,
          isRepository: false,
          rootPath: '/repo',
        }}
        selectedPath={null}
        selectedPaths={new Set()}
        status={null}
        onCommit={vi.fn()}
        onInitRepository={onInitRepository}
        onRefresh={vi.fn()}
        onSelectChange={vi.fn()}
        onSelectFile={vi.fn()}
        onStageSelected={vi.fn()}
        onUnstageSelected={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '初始化 Git 仓库' }));

    expect(onInitRepository).toHaveBeenCalledTimes(1);
  });

  it('selects files and submits a commit message', async () => {
    const user = userEvent.setup();
    const onSelectChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <GitPanel
        error={null}
        isLoading={false}
        probe={probe}
        selectedPath={null}
        selectedPaths={new Set(['docs/a.md'])}
        status={status}
        onCommit={onCommit}
        onInitRepository={vi.fn()}
        onRefresh={vi.fn()}
        onSelectChange={onSelectChange}
        onSelectFile={vi.fn()}
        onStageSelected={vi.fn()}
        onUnstageSelected={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: '选择 docs/a.md' }));
    await user.type(screen.getByLabelText('提交信息'), 'docs: update a');
    await user.click(screen.getByRole('button', { name: '提交 1 个文件' }));

    expect(onSelectChange).toHaveBeenCalledWith('docs/a.md', false);
    expect(onCommit).toHaveBeenCalledWith('docs: update a');
  });
});

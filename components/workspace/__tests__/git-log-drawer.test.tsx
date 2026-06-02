import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GitLogDrawer } from '../git-log-drawer';
import type { GitBranchItem, GitCommitEntry, GitCommitFile } from '../workspace-types';

const branches: GitBranchItem[] = [
  {
    commit: 'abc123',
    current: true,
    fullName: 'refs/heads/main',
    kind: 'local',
    name: 'main',
    upstream: 'origin/main',
  },
  {
    commit: 'def456',
    current: false,
    fullName: 'refs/remotes/origin/dev',
    kind: 'remote',
    name: 'origin/dev',
    upstream: null,
  },
];

const commits: GitCommitEntry[] = [
  {
    authorEmail: 'refinex@example.com',
    authorName: 'refinex',
    authoredAt: '2026-06-02T19:00:00Z',
    body: '补充详情',
    hash: 'abc123abc123',
    refs: ['HEAD -> main', 'origin/main'],
    shortHash: 'abc123',
    subject: 'feat: add git log',
  },
  {
    authorEmail: 'refinex@example.com',
    authorName: 'refinex',
    authoredAt: '2026-06-01T19:00:00Z',
    body: '',
    hash: 'def456def456',
    refs: [],
    shortHash: 'def456',
    subject: 'docs: update',
  },
];

const files: GitCommitFile[] = [
  {
    changeType: 'modified',
    oldPath: null,
    path: 'src/main.ts',
    status: 'M',
  },
];

describe('GitLogDrawer', () => {
  it('renders IDEA-like branches, commits, files, and details', () => {
    render(
      <GitLogDrawer
        branches={branches}
        commits={commits}
        error={null}
        files={files}
        isLoading={false}
        open
        rootName="repo"
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelectCommit={vi.fn()}
      />,
    );

    expect(screen.getByText('Git 日志')).toBeTruthy();
    expect(screen.getByText('本地')).toBeTruthy();
    expect(screen.getByText('远程')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('origin/dev')).toBeTruthy();
    expect(screen.getAllByText('feat: add git log').length).toBeGreaterThan(1);
    expect(screen.getByText('main.ts')).toBeTruthy();
    expect(screen.getByText('abc123abc123')).toBeTruthy();
    expect(screen.getByText('补充详情')).toBeTruthy();
  });

  it('filters commits and selects a commit', async () => {
    const user = userEvent.setup();
    const onSelectCommit = vi.fn();

    render(
      <GitLogDrawer
        branches={branches}
        commits={commits}
        error={null}
        files={files}
        isLoading={false}
        open
        rootName="repo"
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelectCommit={onSelectCommit}
      />,
    );

    await user.type(screen.getByPlaceholderText('文本或哈希'), 'docs');
    await user.click(screen.getByRole('button', { name: /docs: update/ }));

    expect(
      screen.queryByRole('button', { name: /feat: add git log/ }),
    ).toBeNull();
    expect(onSelectCommit).toHaveBeenCalledWith('def456def456');
  });
});

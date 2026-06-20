import { fireEvent, render, screen } from '@testing-library/react';
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
  it('keeps the bottom drawer integrated without internal hard dividers', () => {
    render(
      <GitLogDrawer
        branches={branches}
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={vi.fn()}
        onResizeDetailsHeight={vi.fn()}
        onResizeDetailsWidth={vi.fn()}
        onSelectCommit={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByTestId('git-log-drawer').className).toContain('border-t');
    expect(screen.getByTestId('git-log-header').className).not.toContain(
      'border-b',
    );
    expect(screen.getByTestId('git-log-branches-pane').className).not.toContain(
      'border-r',
    );
    expect(screen.getByTestId('git-log-commits-pane').className).not.toContain(
      'border-b',
    );
    expect(screen.getByTestId('git-log-commit-search-row').className).not.toContain(
      'border-b',
    );
    expect(screen.getByTestId('git-log-details-pane').className).not.toContain(
      'border-l',
    );
    expect(screen.getByTestId('git-log-files-header').className).not.toContain(
      'border-b',
    );
  });

  it('aligns the branch and commit search fields on the same row', () => {
    render(
      <GitLogDrawer
        branches={branches}
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={vi.fn()}
        onResizeDetailsHeight={vi.fn()}
        onResizeDetailsWidth={vi.fn()}
        onSelectCommit={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByTestId('git-log-branch-search-row').className).toContain(
      'h-10',
    );
    expect(screen.getByTestId('git-log-commit-search-row').className).toContain(
      'h-10',
    );
    expect(screen.getByTestId('git-log-branch-search').className).not.toContain(
      'p-2',
    );
    expect(screen.getByTestId('git-log-commit-search').className).not.toContain(
      'p-2',
    );
  });

  it('renders IDEA-like branches, commits, files, and details', () => {
    render(
      <GitLogDrawer
        branches={branches}
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={vi.fn()}
        onResizeDetailsHeight={vi.fn()}
        onResizeDetailsWidth={vi.fn()}
        onSelectCommit={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByText('Git 日志')).toBeTruthy();
    expect(screen.queryByText('repo')).toBeNull();
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
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={vi.fn()}
        onResizeDetailsHeight={vi.fn()}
        onResizeDetailsWidth={vi.fn()}
        onSelectCommit={onSelectCommit}
        onSelectFile={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText('文本或哈希'), 'docs');
    await user.click(screen.getByRole('button', { name: /docs: update/ }));

    expect(
      screen.queryByRole('button', { name: /feat: add git log/ }),
    ).toBeNull();
    expect(onSelectCommit).toHaveBeenCalledWith('def456def456');
  });

  it('collapses commit file tree directories', async () => {
    const user = userEvent.setup();

    render(
      <GitLogDrawer
        branches={branches}
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={vi.fn()}
        onResizeDetailsHeight={vi.fn()}
        onResizeDetailsWidth={vi.fn()}
        onSelectCommit={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'src' }));

    expect(screen.queryByText('main.ts')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'src' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('resizes the details column and commit details area', () => {
    const onResizeBranchWidth = vi.fn();
    const onResizeDetailsWidth = vi.fn();
    const onResizeDetailsHeight = vi.fn();

    render(
      <GitLogDrawer
        branches={branches}
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={onResizeBranchWidth}
        onResizeDetailsHeight={onResizeDetailsHeight}
        onResizeDetailsWidth={onResizeDetailsWidth}
        onSelectCommit={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    const branchWidthHandle = screen.getByRole('separator', {
      name: '调整 Git 日志分支树宽度',
    });
    fireEvent.pointerDown(branchWidthHandle, { clientX: 260, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 340, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    const widthHandle = screen.getByRole('separator', {
      name: '调整 Git 日志详情宽度',
    });
    fireEvent.pointerDown(widthHandle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 760, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    const heightHandle = screen.getByRole('separator', {
      name: '调整 Git 提交信息高度',
    });
    fireEvent.pointerDown(heightHandle, { clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(document, { clientY: 580, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(onResizeBranchWidth).toHaveBeenCalledWith(340);
    expect(onResizeDetailsWidth).toHaveBeenCalledWith(500);
    expect(onResizeDetailsHeight).toHaveBeenCalledWith(340);
  });

  it('selects commit files from the file tree', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    render(
      <GitLogDrawer
        branches={branches}
        branchWidth={260}
        commits={commits}
        detailsHeight={220}
        detailsWidth={360}
        error={null}
        files={files}
        height={420}
        isLoading={false}
        open
        selectedCommitHash="abc123abc123"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onResizeBranchWidth={vi.fn()}
        onResizeDetailsHeight={vi.fn()}
        onResizeDetailsWidth={vi.fn()}
        onSelectCommit={vi.fn()}
        onSelectFile={onSelectFile}
      />,
    );

    await user.click(screen.getByRole('button', { name: /main.ts/ }));

    expect(onSelectFile).toHaveBeenCalledWith(files[0]);
  });
});

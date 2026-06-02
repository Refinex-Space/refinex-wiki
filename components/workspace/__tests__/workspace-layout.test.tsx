import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPlateDocument,
  createWorkspaceDirectory,
  createWorkspaceRoot,
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
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  loadWorkspaceTree,
  readAppSettings,
  readPlateDocument,
  saveAppSettings,
  selectWorkspaceParentDirectory,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
} from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

const { setThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: setThemeMock,
    theme: 'light',
  }),
}));

vi.mock('@/components/editor/plate-editor', () => ({
  PlateEditor: ({
    onTocSnapshotChange,
    pageWidthMode,
  }: {
    onTocSnapshotChange?: (snapshot: unknown) => void;
    pageWidthMode?: string;
  }) => (
    <button
      data-page-width-mode={pageWidthMode}
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

vi.mock('../xterm-terminal', () => ({
  XtermTerminal: ({
    output,
    sessionId,
  }: {
    output: string;
    sessionId: string;
  }) => <div data-testid={`mock-xterm-${sessionId}`}>{output}</div>,
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    createPlateDocument: vi.fn(),
    createWorkspaceDirectory: vi.fn(),
    createWorkspaceRoot: vi.fn(),
    gitBranches: vi.fn(),
    gitCommit: vi.fn(),
    gitCommitFileDiff: vi.fn(),
    gitCommitFiles: vi.fn(),
    gitDeleteFile: vi.fn(),
    gitDiff: vi.fn(),
    gitInit: vi.fn(),
    gitLog: vi.fn(),
    gitProbe: vi.fn(),
    gitPush: vi.fn(),
    gitRevertFile: vi.fn(),
    gitStage: vi.fn(),
    gitStatus: vi.fn(),
    gitUnstage: vi.fn(),
    listenTerminalData: vi.fn(),
    listenTerminalError: vi.fn(),
    listenTerminalExit: vi.fn(),
    loadWorkspaceTree: vi.fn(),
    readPlateDocument: vi.fn(),
    readAppSettings: vi.fn(),
    saveAppSettings: vi.fn(),
    selectWorkspaceParentDirectory: vi.fn(),
    setAppWindowTitle: vi.fn(),
    terminalKill: vi.fn(),
    terminalResize: vi.fn(),
    terminalSpawn: vi.fn(),
    terminalWrite: vi.fn(),
  };
});

const createPlateDocumentMock = vi.mocked(createPlateDocument);
const createWorkspaceDirectoryMock = vi.mocked(createWorkspaceDirectory);
const createWorkspaceRootMock = vi.mocked(createWorkspaceRoot);
const gitBranchesMock = vi.mocked(gitBranches);
const gitCommitMock = vi.mocked(gitCommit);
const gitCommitFileDiffMock = vi.mocked(gitCommitFileDiff);
const gitCommitFilesMock = vi.mocked(gitCommitFiles);
const gitDeleteFileMock = vi.mocked(gitDeleteFile);
const gitDiffMock = vi.mocked(gitDiff);
const gitInitMock = vi.mocked(gitInit);
const gitLogMock = vi.mocked(gitLog);
const gitProbeMock = vi.mocked(gitProbe);
const gitPushMock = vi.mocked(gitPush);
const gitRevertFileMock = vi.mocked(gitRevertFile);
const gitStageMock = vi.mocked(gitStage);
const gitStatusMock = vi.mocked(gitStatus);
const gitUnstageMock = vi.mocked(gitUnstage);
const listenTerminalDataMock = vi.mocked(listenTerminalData);
const listenTerminalErrorMock = vi.mocked(listenTerminalError);
const listenTerminalExitMock = vi.mocked(listenTerminalExit);
const loadWorkspaceTreeMock = vi.mocked(loadWorkspaceTree);
const readAppSettingsMock = vi.mocked(readAppSettings);
const readPlateDocumentMock = vi.mocked(readPlateDocument);
const saveAppSettingsMock = vi.mocked(saveAppSettings);
const selectWorkspaceParentDirectoryMock = vi.mocked(
  selectWorkspaceParentDirectory,
);
const terminalKillMock = vi.mocked(terminalKill);
const terminalResizeMock = vi.mocked(terminalResize);
const terminalSpawnMock = vi.mocked(terminalSpawn);
const terminalWriteMock = vi.mocked(terminalWrite);

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

const directorySnapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'guides',
      name: 'Guides',
      kind: 'directory',
      relativePath: 'Guides',
      absolutePath: '/repo/Guides',
      children: [
        {
          id: 'intro',
          name: 'intro.plate.json',
          kind: 'document',
          relativePath: 'Guides/intro.plate.json',
          absolutePath: '/repo/Guides/intro.plate.json',
          title: '入门指南',
        },
        {
          id: 'advanced',
          name: 'Advanced',
          kind: 'directory',
          relativePath: 'Guides/Advanced',
          absolutePath: '/repo/Guides/Advanced',
          children: [
            {
              id: 'deploy',
              name: 'deploy.plate.json',
              kind: 'document',
              relativePath: 'Guides/Advanced/deploy.plate.json',
              absolutePath: '/repo/Guides/Advanced/deploy.plate.json',
              title: '部署说明',
            },
          ],
        },
      ],
    },
  ],
};

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    createPlateDocumentMock.mockReset();
    createWorkspaceDirectoryMock.mockReset();
    createWorkspaceRootMock.mockReset();
    gitBranchesMock.mockReset();
    gitCommitMock.mockReset();
    gitCommitFileDiffMock.mockReset();
    gitCommitFilesMock.mockReset();
    gitDeleteFileMock.mockReset();
    gitDiffMock.mockReset();
    gitInitMock.mockReset();
    gitLogMock.mockReset();
    gitProbeMock.mockReset();
    gitPushMock.mockReset();
    gitRevertFileMock.mockReset();
    gitStageMock.mockReset();
    gitStatusMock.mockReset();
    gitUnstageMock.mockReset();
    listenTerminalDataMock.mockReset();
    listenTerminalErrorMock.mockReset();
    listenTerminalExitMock.mockReset();
    loadWorkspaceTreeMock.mockReset();
    readAppSettingsMock.mockReset();
    readPlateDocumentMock.mockReset();
    saveAppSettingsMock.mockReset();
    selectWorkspaceParentDirectoryMock.mockReset();
    terminalKillMock.mockReset();
    terminalResizeMock.mockReset();
    terminalSpawnMock.mockReset();
    terminalWriteMock.mockReset();
    setThemeMock.mockReset();
    listenTerminalDataMock.mockResolvedValue(vi.fn());
    listenTerminalErrorMock.mockResolvedValue(vi.fn());
    listenTerminalExitMock.mockResolvedValue(vi.fn());
    terminalKillMock.mockResolvedValue(undefined);
    terminalResizeMock.mockResolvedValue(undefined);
    terminalSpawnMock.mockResolvedValue({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });
    terminalWriteMock.mockResolvedValue(undefined);
    readAppSettingsMock.mockResolvedValue({
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'standard' },
    });
    saveAppSettingsMock.mockResolvedValue({
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'standard' },
    });
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

  it('shows a polished directory page and opens document cards', async () => {
    const user = userEvent.setup();
    readPlateDocumentMock.mockResolvedValueOnce({
      path: '/repo/Guides/intro.plate.json',
      modifiedAt: 1,
      envelope: {
        schemaVersion: 1,
        title: '入门指南',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        content: [{ type: 'p', children: [{ text: '正文' }] }],
      },
    });

    render(<WorkspaceLayout initialSnapshot={directorySnapshot} />);

    await user.click(screen.getByText('Guides'));

    const editorPane = within(screen.getByTestId('editor-pane-content'));

    expect(screen.getByRole('heading', { name: 'Guides' })).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索当前目录下的文档')).toBeTruthy();
    expect(editorPane.getByRole('button', { name: /入门指南/ })).toBeTruthy();
    expect(editorPane.getByRole('button', { name: /Advanced/ })).toBeTruthy();

    await user.click(editorPane.getByRole('button', { name: '列表视图' }));

    expect(
      editorPane
        .getByRole('button', { name: '列表视图' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    await user.type(screen.getByPlaceholderText('搜索当前目录下的文档'), '部署');

    expect(editorPane.getByRole('button', { name: /部署说明/ })).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('搜索当前目录下的文档'));
    await user.click(editorPane.getByRole('button', { name: /入门指南/ }));

    expect(readPlateDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/Guides/intro.plate.json',
    );
  });

  it('switches from directory panel to Git panel and loads diff', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.plate.json',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });
    gitDiffMock.mockResolvedValue({
      binary: false,
      content: '@@ -1 +1 @@\n-old\n+new',
      path: 'README.plate.json',
      staged: false,
      truncated: false,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));
    await user.click(
      await screen.findByRole('button', { name: /README.plate.json/ }),
    );

    expect(screen.getByText('-old')).toBeTruthy();
    expect(screen.getByText('+new')).toBeTruthy();
  });

  it('reverts a changed file from the Git context menu', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.plate.json',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });
    gitRevertFileMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [],
      rootPath: '/repo',
      upstream: null,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));

    const changeRow = await screen.findByRole('button', {
      name: /README.plate.json/,
    });

    await user.pointer({
      keys: '[MouseRight]',
      target: changeRow,
    });
    await user.click(await screen.findByRole('menuitem', { name: '回滚' }));
    await user.click(await screen.findByRole('button', { name: '确认回滚' }));

    expect(gitRevertFileMock).toHaveBeenCalledWith('/repo', 'README.plate.json');
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /README.plate.json/ }),
      ).toBeNull();
    });
  });

  it('stages a changed file from the Git context menu', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.plate.json',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });
    gitStageMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: 'M',
          oldPath: null,
          path: 'README.plate.json',
          staged: true,
          workingTreeStatus: '',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));

    const changeRow = await screen.findByRole('button', {
      name: /README.plate.json/,
    });

    await user.pointer({
      keys: '[MouseRight]',
      target: changeRow,
    });
    await user.click(await screen.findByRole('menuitem', { name: '暂存' }));

    expect(gitStageMock).toHaveBeenCalledWith('/repo', ['README.plate.json']);
  });

  it('commits and pushes selected Git files', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.plate.json',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: 'origin/main',
    });
    gitCommitMock.mockResolvedValue({
      ahead: 1,
      behind: 0,
      branch: 'main',
      changes: [],
      rootPath: '/repo',
      upstream: 'origin/main',
    });
    gitPushMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [],
      rootPath: '/repo',
      upstream: 'origin/main',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));
    await user.type(await screen.findByLabelText('提交信息'), 'docs: update readme');
    await user.click(screen.getByRole('button', { name: '提交并推送' }));

    expect(gitCommitMock).toHaveBeenCalledWith('/repo', 'docs: update readme', [
      'README.plate.json',
    ]);
    expect(gitPushMock).toHaveBeenCalledWith('/repo');
  });

  it('opens the bottom Git log drawer from the left rail', async () => {
    const user = userEvent.setup();
    gitBranchesMock.mockResolvedValue([
      {
        commit: 'abc123',
        current: true,
        fullName: 'refs/heads/main',
        kind: 'local',
        name: 'main',
        upstream: 'origin/main',
      },
    ]);
    gitLogMock.mockResolvedValue([
      {
        authorEmail: 'refinex@example.com',
        authorName: 'refinex',
        authoredAt: '2026-06-02T19:00:00Z',
        body: '提交详情',
        hash: 'abc123abc123',
        refs: ['HEAD -> main'],
        shortHash: 'abc123',
        subject: 'feat: git log drawer',
      },
    ]);
    gitCommitFilesMock.mockResolvedValue([
      {
        changeType: 'modified',
        oldPath: null,
        path: 'components/workspace/git-log-drawer.tsx',
        status: 'M',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 日志' }));

    expect(await screen.findByTestId('git-log-drawer')).toBeTruthy();
    expect(screen.getAllByText('feat: git log drawer').length).toBeGreaterThan(1);
    expect(screen.getByText('git-log-drawer.tsx')).toBeTruthy();
    expect(gitBranchesMock).toHaveBeenCalledWith('/repo');
    expect(gitLogMock).toHaveBeenCalledWith('/repo');
    expect(gitCommitFilesMock).toHaveBeenCalledWith('/repo', 'abc123abc123');

    const heightHandle = screen.getByRole('separator', {
      name: '调整 Git 日志高度',
    });
    expect(
      within(screen.getByTestId('git-log-drawer')).queryByRole('separator', {
        name: '调整 Git 日志高度',
      }),
    ).toBeNull();
    fireEvent.pointerDown(heightHandle, { clientY: 700, pointerId: 1 });
    await waitFor(() =>
      expect(heightHandle.getAttribute('data-dragging')).toBe('true'),
    );
    fireEvent.pointerMove(document, { clientY: 580, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    const storedHeight = window.localStorage.getItem(
      'refinex-wiki:workspace:git-log-height',
    );

    expect(storedHeight).not.toBeNull();
    expect(screen.getByTestId('git-log-drawer').style.height).toBe(
      `${storedHeight}px`,
    );
  });

  it('opens commit file diff from the Git log drawer in the editor block', async () => {
    const user = userEvent.setup();
    gitBranchesMock.mockResolvedValue([
      {
        commit: 'abc123',
        current: true,
        fullName: 'refs/heads/main',
        kind: 'local',
        name: 'main',
        upstream: 'origin/main',
      },
    ]);
    gitLogMock.mockResolvedValue([
      {
        authorEmail: 'refinex@example.com',
        authorName: 'refinex',
        authoredAt: '2026-06-02T19:00:00Z',
        body: '',
        hash: 'abc123abc123',
        refs: ['HEAD -> main'],
        shortHash: 'abc123',
        subject: 'feat: git log drawer',
      },
    ]);
    gitCommitFilesMock.mockResolvedValue([
      {
        changeType: 'modified',
        oldPath: null,
        path: 'components/workspace/git-log-drawer.tsx',
        status: 'M',
      },
    ]);
    gitCommitFileDiffMock.mockResolvedValue({
      binary: false,
      content: 'diff --git a/components/workspace/git-log-drawer.tsx b/components/workspace/git-log-drawer.tsx',
      path: 'components/workspace/git-log-drawer.tsx',
      staged: false,
      truncated: false,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 日志' }));
    await user.click(
      await screen.findByRole('button', { name: /git-log-drawer.tsx/ }),
    );

    expect(gitCommitFileDiffMock).toHaveBeenCalledWith(
      '/repo',
      'abc123abc123',
      'components/workspace/git-log-drawer.tsx',
    );
    expect(await screen.findByText('提交差异')).toBeTruthy();
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

  it('opens appearance settings from the settings menu by default', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '跟随系统' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '亮色' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '暗色' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '标准' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '全宽' })).toBeTruthy();
  });

  it('opens storage settings from the settings menu', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));
    await user.click(await screen.findByRole('button', { name: '存储' }));

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
    expect(screen.getByText('本地存储配置')).toBeTruthy();
    expect(screen.getByDisplayValue('/repo/.refinex/assets')).toBeTruthy();
    expect(
      screen.getByDisplayValue('refinex-asset://{assetId}'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAppSettingsMock).toHaveBeenCalledWith({
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'standard' },
    });
  });

  it('filters appearance settings with the settings search input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));

    const searchInput = await screen.findByRole('searchbox', {
      name: '搜索设置',
    });

    await user.type(searchInput, '主题');

    expect(screen.getByText('主题')).toBeTruthy();
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
    expect(screen.queryByText('本地存储配置')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, '全宽');

    expect(screen.getByText('页面宽度')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '全宽' })).toBeTruthy();
  });

  it('switches app theme from appearance settings', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));
    await user.click(await screen.findByRole('radio', { name: '暗色' }));

    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('passes persisted page width mode to the workspace editor', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce({
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'wide' },
    });
    readPlateDocumentMock.mockResolvedValueOnce({
      envelope: {
        schemaVersion: 1,
        title: '项目说明',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [{ children: [{ text: '正文' }], type: 'p' }],
      },
      modifiedAt: 1,
      path: '/repo/README.plate.json',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));

    expect(
      (await screen.findByTestId('plate-editor')).getAttribute(
        'data-page-width-mode',
      ),
    ).toBe('wide');
  });

  it('updates workspace editor page width after settings are applied', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readPlateDocumentMock.mockResolvedValueOnce({
      envelope: {
        schemaVersion: 1,
        title: '项目说明',
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        content: [{ children: [{ text: '正文' }], type: 'p' }],
      },
      modifiedAt: 1,
      path: '/repo/README.plate.json',
    });
    saveAppSettingsMock.mockResolvedValueOnce({
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'wide' },
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    expect(
      (await screen.findByTestId('plate-editor')).getAttribute(
        'data-page-width-mode',
      ),
    ).toBe('standard');

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));
    await user.click(await screen.findByRole('radio', { name: '全宽' }));
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(
      (await screen.findByTestId('plate-editor')).getAttribute(
        'data-page-width-mode',
      ),
    ).toBe('wide');
  });

  it('shows saved feedback when applying appearance settings', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));
    await user.click(await screen.findByRole('radio', { name: '全宽' }));
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(screen.getByText('设置已保存。')).toBeTruthy();
  });

  it('filters storage settings with the settings search input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
    await user.click(screen.getByText('设置...'));

    const searchInput = await screen.findByRole('searchbox', {
      name: '搜索设置',
    });

    await user.type(searchInput, '引用');

    expect(screen.getByDisplayValue('refinex-asset://{assetId}')).toBeTruthy();
    expect(screen.queryByText('资源目录')).toBeNull();
    expect(screen.queryByText('清理策略')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, '上传');

    expect(screen.getByText('本地存储配置')).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, '不存在的设置');

    expect(screen.getByText('未找到设置')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '存储' })).toBeNull();
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
              { text: '加粗', bold: true },
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
    expect(
      screen
        .getByTestId('workspace-sidebar')
        .querySelector('[data-workspace-tree-scroll-container="true"]')
        ?.className,
    ).toContain('workspace-tree-scrollarea');
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

  it('resizes the left sidebar by dragging within configured bounds', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 520, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('420px');
    expect(
      window.localStorage.getItem(
        'refinex-wiki:workspace:left-sidebar-width',
      ),
    ).toBe('420');
  });

  it('resizes the right panel by dragging within configured bounds', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    const handle = screen.getByRole('separator', {
      name: '调整右侧面板宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 600, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(screen.getByTestId('ai-panel-island').style.width).toBe('520px');
    expect(
      window.localStorage.getItem('refinex-wiki:workspace:right-panel-width'),
    ).toBe('520');
  });

  it('supports keyboard resizing from the separator handles', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    handle.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Home}{End}');

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('420px');
  });

  it('only shows resize handles when the related panel is visible', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(
      screen.getByRole('separator', { name: '调整左侧目录宽度' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('separator', { name: '调整右侧面板宽度' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: '折叠目录' }));

    expect(
      screen.queryByRole('separator', { name: '调整左侧目录宽度' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    expect(
      screen.getByRole('separator', { name: '调整右侧面板宽度' }),
    ).toBeTruthy();
  });

  it('keeps resize handles inside the existing block gap', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const leftHandle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    expect(leftHandle.className).toContain('w-2');
    expect(leftHandle.className).toContain('-mx-2');

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    const rightHandle = screen.getByRole('separator', {
      name: '调整右侧面板宽度',
    });

    expect(rightHandle.className).toContain('w-2');
    expect(rightHandle.className).toContain('-mx-2');
  });

  it('keeps the resized left sidebar width after collapse and expand', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 360, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    await user.click(screen.getByRole('button', { name: '折叠目录' }));
    await user.click(screen.getByRole('button', { name: '展开目录' }));

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('360px');
  });

  it('uses default widths for the resizable workspace panels', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const sidebar = screen.getByTestId('workspace-sidebar');

    expect(sidebar.style.width).toBe('280px');

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));

    expect(screen.getByTestId('ai-panel-island').style.width).toBe('340px');
  });

  it('loads persisted panel widths and clamps invalid stored values', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'refinex-wiki:workspace:left-sidebar-width',
      '999',
    );
    window.localStorage.setItem(
      'refinex-wiki:workspace:right-panel-width',
      '120',
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('420px');

    await user.click(screen.getByRole('button', { name: '展开目录面板' }));

    expect(screen.getByTestId('document-toc-panel').style.width).toBe('340px');
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

  it('opens the terminal bottom panel from the left rail', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开终端' }));

    const terminalPanel = await screen.findByTestId('terminal-panel');

    expect(terminalPanel).toBeTruthy();
    expect(within(terminalPanel).getByText('终端')).toBeTruthy();
    expect(within(terminalPanel).queryByText('repo')).toBeNull();
    expect(await screen.findByRole('tab', { name: /本地/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /本地 2/ })).toBeNull();
    expect(terminalSpawnMock).toHaveBeenCalledTimes(1);
    expect(terminalSpawnMock).toHaveBeenCalledWith('/repo', 120, 32);
  });

  it('places terminal above Git history in the bottom tool area', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const terminalButton = screen.getByRole('button', { name: '打开终端' });
    const gitLogButton = screen.getByRole('button', { name: '打开 Git 日志' });

    expect(
      terminalButton.compareDocumentPosition(gitLogButton) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps terminal tab instances mounted when switching tabs', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    terminalSpawnMock
      .mockResolvedValueOnce({
        cwd: '/repo',
        id: 'term-1',
        shell: '/bin/zsh',
      })
      .mockResolvedValueOnce({
        cwd: '/repo',
        id: 'term-2',
        shell: '/bin/zsh',
      });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开终端' }));
    await screen.findByRole('tab', { name: /^本地$/ });
    await user.click(screen.getByRole('button', { name: '新建终端标签页' }));
    await screen.findByRole('tab', { name: /本地 2/ });
    await user.click(screen.getByRole('tab', { name: /^本地$/ }));

    expect(screen.getByTestId('mock-xterm-term-1')).toBeTruthy();
    expect(screen.getByTestId('mock-xterm-term-2')).toBeTruthy();
  });

  it('keeps terminal instance mounted when closing and reopening the terminal panel', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    terminalSpawnMock.mockResolvedValueOnce({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开终端' }));
    await screen.findByRole('tab', { name: /^本地$/ });

    const terminalInstance = screen.getByTestId('mock-xterm-term-1');

    await user.click(screen.getByRole('button', { name: '关闭终端' }));

    expect(screen.getByRole('button', { name: '打开终端' })).toBeTruthy();
    expect(screen.getByTestId('mock-xterm-term-1')).toBe(terminalInstance);

    await user.click(screen.getByRole('button', { name: '打开终端' }));

    expect(screen.getByTestId('mock-xterm-term-1')).toBe(terminalInstance);
    expect(terminalSpawnMock).toHaveBeenCalledTimes(1);
  });
});

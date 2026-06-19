import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMarkdownDocument,
  createWorkspaceDirectory,
  createWorkspaceRoot,
  detectAiAccounts,
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
  listAiAgentProfiles,
  listenAiEvents,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  loadWorkspaceTree,
  readAppSettings,
  readMarkdownDocument,
  readWorkspaceAssetData,
  resolveWorkspaceAsset,
  saveAppSettings,
  selectWorkspaceAssetDownloadPath,
  selectWorkspaceParentDirectory,
  closeAppWindow,
  cancelAiTurn,
  minimizeAppWindow,
  sendAiPrompt,
  startAiSession,
  stopAiSession,
  toggleMaximizeAppWindow,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
  writeExportFile,
} from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_APP_SETTINGS,
} from '../workspace-settings';
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

vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: ({
    documentKey,
    markdown,
    onTocSnapshotChange,
    pageWidthMode,
  }: {
    documentKey?: string;
    markdown?: string;
    onTocSnapshotChange?: (snapshot: unknown) => void;
    pageWidthMode?: string;
  }) => (
    <button
      data-document-key={documentKey}
      data-page-width-mode={pageWidthMode}
      data-markdown={markdown}
      data-testid="markdown-editor"
      type="button"
      onClick={() =>
        onTocSnapshotChange?.({
          activeContentId: markdown?.includes('文档 B') ? 'h2-b' : 'h2-a',
          items: [
            {
              depth: 1,
              id: markdown?.includes('文档 B') ? 'h2-b' : 'h2-a',
              originalDepth: 2,
              title: markdown?.includes('文档 B')
                ? '文档 B 目录'
                : markdown?.includes('文档 A')
                  ? '文档 A 目录'
                  : '背景',
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
    createMarkdownDocument: vi.fn(),
    createWorkspaceDirectory: vi.fn(),
    createWorkspaceRoot: vi.fn(),
    detectAiAccounts: vi.fn(),
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
    listAiAgentProfiles: vi.fn(),
    listenAiEvents: vi.fn(),
    listenTerminalData: vi.fn(),
    listenTerminalError: vi.fn(),
    listenTerminalExit: vi.fn(),
    loadWorkspaceTree: vi.fn(),
    readMarkdownDocument: vi.fn(),
    readWorkspaceAssetData: vi.fn(),
    resolveWorkspaceAsset: vi.fn(),
    readAppSettings: vi.fn(),
    saveAppSettings: vi.fn(),
    selectWorkspaceAssetDownloadPath: vi.fn(),
    selectWorkspaceParentDirectory: vi.fn(),
    setAppWindowTitle: vi.fn(),
    closeAppWindow: vi.fn(),
    cancelAiTurn: vi.fn(),
    minimizeAppWindow: vi.fn(),
    sendAiPrompt: vi.fn(),
    startAiSession: vi.fn(),
    stopAiSession: vi.fn(),
    toggleMaximizeAppWindow: vi.fn(),
    terminalKill: vi.fn(),
    terminalResize: vi.fn(),
    terminalSpawn: vi.fn(),
    terminalWrite: vi.fn(),
    writeExportFile: vi.fn(),
  };
});

const createMarkdownDocumentMock = vi.mocked(createMarkdownDocument);
const createWorkspaceDirectoryMock = vi.mocked(createWorkspaceDirectory);
const createWorkspaceRootMock = vi.mocked(createWorkspaceRoot);
const detectAiAccountsMock = vi.mocked(detectAiAccounts);
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
const listAiAgentProfilesMock = vi.mocked(listAiAgentProfiles);
const listenAiEventsMock = vi.mocked(listenAiEvents);
const listenTerminalDataMock = vi.mocked(listenTerminalData);
const listenTerminalErrorMock = vi.mocked(listenTerminalError);
const listenTerminalExitMock = vi.mocked(listenTerminalExit);
const loadWorkspaceTreeMock = vi.mocked(loadWorkspaceTree);
const readAppSettingsMock = vi.mocked(readAppSettings);
const readMarkdownDocumentMock = vi.mocked(readMarkdownDocument);
const readWorkspaceAssetDataMock = vi.mocked(readWorkspaceAssetData);
const resolveWorkspaceAssetMock = vi.mocked(resolveWorkspaceAsset);
const saveAppSettingsMock = vi.mocked(saveAppSettings);
const selectWorkspaceAssetDownloadPathMock = vi.mocked(
  selectWorkspaceAssetDownloadPath,
);
const selectWorkspaceParentDirectoryMock = vi.mocked(
  selectWorkspaceParentDirectory,
);
const closeAppWindowMock = vi.mocked(closeAppWindow);
const cancelAiTurnMock = vi.mocked(cancelAiTurn);
const minimizeAppWindowMock = vi.mocked(minimizeAppWindow);
const sendAiPromptMock = vi.mocked(sendAiPrompt);
const startAiSessionMock = vi.mocked(startAiSession);
const stopAiSessionMock = vi.mocked(stopAiSession);
const toggleMaximizeAppWindowMock = vi.mocked(toggleMaximizeAppWindow);
const terminalKillMock = vi.mocked(terminalKill);
const terminalResizeMock = vi.mocked(terminalResize);
const terminalSpawnMock = vi.mocked(terminalSpawn);
const terminalWriteMock = vi.mocked(terminalWrite);
const writeExportFileMock = vi.mocked(writeExportFile);

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

const multiDocumentSnapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'a',
      name: 'a.md',
      kind: 'document',
      relativePath: 'a.md',
      absolutePath: '/repo/a.md',
      title: '文档 A',
    },
    {
      id: 'b',
      name: 'b.md',
      kind: 'document',
      relativePath: 'b.md',
      absolutePath: '/repo/b.md',
      title: '文档 B',
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
          name: 'intro.md',
          kind: 'document',
          relativePath: 'Guides/intro.md',
          absolutePath: '/repo/Guides/intro.md',
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
              name: 'deploy.md',
              kind: 'document',
              relativePath: 'Guides/Advanced/deploy.md',
              absolutePath: '/repo/Guides/Advanced/deploy.md',
              title: '部署说明',
            },
          ],
        },
      ],
    },
  ],
};

const fakeEchoProfile = {
  capabilities: {
    diff: false,
    models: false,
    readWorkspace: true,
    shell: false,
    slashCommands: false,
    writeWorkspace: false,
  },
  detection: { status: 'available' },
  id: 'fake-echo',
  isTestRuntime: true,
  kind: 'fake',
  label: 'Fake Echo',
  modelId: 'fake-echo',
  modelLabel: 'fake-echo',
  providerId: 'local',
  providerLabel: 'Local',
};

const codexDetectedProfile = {
  capabilities: {
    diff: true,
    models: true,
    readWorkspace: true,
    shell: false,
    slashCommands: true,
    writeWorkspace: true,
  },
  detection: {
    message: 'Codex adapter is pending runtime connection.',
    status: 'misconfigured',
  },
  id: 'codex:gpt-5.4',
  isTestRuntime: false,
  kind: 'codex_app_server',
  label: 'Codex / GPT-5.4',
  modelId: 'gpt-5.4',
  modelLabel: 'GPT-5.4',
  providerId: 'openai',
  providerLabel: 'OpenAI',
};

const detectedAiAccounts = [
  {
    commandPath: '/usr/local/bin/codex',
    id: 'codex',
    label: 'Codex',
    message: 'Local Codex app-server detected.',
    models: [
      {
        available: false,
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        profileId: 'codex:gpt-5.4',
        providerId: 'openai',
        providerLabel: 'OpenAI',
      },
    ],
    providerId: 'openai',
    providerLabel: 'OpenAI',
    status: 'connected',
    transport: 'app-server',
    version: 'codex-cli 0.130.0',
  },
  {
    commandPath: '/usr/local/bin/claude',
    id: 'claude',
    label: 'Claude',
    message: 'Claude CLI detected; runtime adapter is not connected yet.',
    models: [],
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    status: 'detected',
    transport: 'cli',
    version: '2.1.161 (Claude Code)',
  },
];

const defaultAiSettings = DEFAULT_AI_SETTINGS;

const defaultAppSettings = DEFAULT_APP_SETTINGS;

function markdownDocument({
  body = '正文',
  modifiedAt = 1,
  path = '/repo/README.md',
  title = '项目说明',
}: {
  body?: string;
  modifiedAt?: number;
  path?: string;
  title?: string;
}) {
  return {
    content: `---\ntitle: ${title}\ncreatedAt: 2026-06-01T00:00:00.000Z\nupdatedAt: 2026-06-02T11:30:00.000Z\nrefinexDialect: 1\n---\n\n# ${title}\n\n${body}\n`,
    modifiedAt,
    path,
  };
}

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    createMarkdownDocumentMock.mockReset();
    createWorkspaceDirectoryMock.mockReset();
    createWorkspaceRootMock.mockReset();
    detectAiAccountsMock.mockReset();
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
    listAiAgentProfilesMock.mockReset();
    listenAiEventsMock.mockReset();
    listenTerminalDataMock.mockReset();
    listenTerminalErrorMock.mockReset();
    listenTerminalExitMock.mockReset();
    loadWorkspaceTreeMock.mockReset();
    readAppSettingsMock.mockReset();
    readMarkdownDocumentMock.mockReset();
    readWorkspaceAssetDataMock.mockReset();
    resolveWorkspaceAssetMock.mockReset();
    saveAppSettingsMock.mockReset();
    selectWorkspaceAssetDownloadPathMock.mockReset();
    selectWorkspaceParentDirectoryMock.mockReset();
    closeAppWindowMock.mockReset();
    cancelAiTurnMock.mockReset();
    minimizeAppWindowMock.mockReset();
    sendAiPromptMock.mockReset();
    startAiSessionMock.mockReset();
    stopAiSessionMock.mockReset();
    toggleMaximizeAppWindowMock.mockReset();
    terminalKillMock.mockReset();
    terminalResizeMock.mockReset();
    terminalSpawnMock.mockReset();
    terminalWriteMock.mockReset();
    writeExportFileMock.mockReset();
    setThemeMock.mockReset();
    closeAppWindowMock.mockResolvedValue(undefined);
    cancelAiTurnMock.mockResolvedValue(undefined);
    sendAiPromptMock.mockResolvedValue(undefined);
    startAiSessionMock.mockResolvedValue({
      profileId: 'fake-echo',
      rootPath: '/repo',
      sessionId: 'ai-1',
      status: 'running',
    });
    stopAiSessionMock.mockResolvedValue(undefined);
    minimizeAppWindowMock.mockResolvedValue(undefined);
    toggleMaximizeAppWindowMock.mockResolvedValue(undefined);
    listenTerminalDataMock.mockResolvedValue(vi.fn());
    listenTerminalErrorMock.mockResolvedValue(vi.fn());
    listenTerminalExitMock.mockResolvedValue(vi.fn());
    listenAiEventsMock.mockResolvedValue(vi.fn());
    listAiAgentProfilesMock.mockResolvedValue([fakeEchoProfile]);
    detectAiAccountsMock.mockResolvedValue([]);
    terminalKillMock.mockResolvedValue(undefined);
    terminalResizeMock.mockResolvedValue(undefined);
    terminalSpawnMock.mockResolvedValue({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });
    terminalWriteMock.mockResolvedValue(undefined);
    readAppSettingsMock.mockResolvedValue(defaultAppSettings);
    saveAppSettingsMock.mockResolvedValue(defaultAppSettings);
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

    await user.type(screen.getByPlaceholderText('搜索'), '项目');

    expect(screen.getByText('项目说明')).toBeTruthy();
  });

  it('opens documents in tabs and switches from the tab bar', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/b.md',
        title: '文档 B',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));

    expect(await screen.findByRole('tab', { name: /文档 A/ })).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /文档 B/ }).getAttribute('aria-selected'),
    ).toBe('true');

    await user.click(screen.getByRole('tab', { name: /文档 A/ }));

    expect(readMarkdownDocumentMock).toHaveBeenLastCalledWith(
      '/repo',
      '/repo/a.md',
    );
  });

  it('splits a tab into a second editor group', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/b.md',
        title: '文档 B',
      }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));

    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('tab', { name: /文档 A/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '向右拆分' }));

    expect(screen.getAllByTestId(/document-editor-group-/u)).toHaveLength(2);
  });

  it('does not show split focus ring in a single editor group', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/a.md',
      title: '文档 A',
    }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));

    expect(screen.getByTestId('document-editor-group-group-1').className).not
      .toContain('ring-1');
  });

  it('closes a split pane when its last tab is closed', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/a.md',
      title: '文档 A',
    }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('tab', { name: /文档 A/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '向右拆分' }));

    const [, splitGroup] = screen.getAllByTestId(/document-editor-group-/u);
    await user.click(
      within(splitGroup).getByRole('button', { name: /关闭标签页 文档 A/ }),
    );

    expect(screen.getAllByTestId(/document-editor-group-/u)).toHaveLength(1);
    expect(screen.queryByText('没有打开的标签页')).toBeNull();
    expect(screen.getByTestId('document-editor-group-group-1').className).not
      .toContain('ring-1');
  });

  it('keeps editor content visible in each split group', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        body: 'A body',
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        body: 'B body',
        path: '/repo/b.md',
        title: '文档 B',
      }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('tab', { name: /文档 B/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '向右拆分' }));

    expect(screen.getAllByTestId('markdown-editor')).toHaveLength(2);
    expect(
      screen
        .getAllByTestId('markdown-editor')
        .map((editor) => editor.getAttribute('data-markdown')),
    ).toEqual([
      expect.stringContaining('文档 B'),
      expect.stringContaining('文档 B'),
    ]);
  });

  it('keeps cached editor visible while reactivating an already opened tab', async () => {
    const user = userEvent.setup();
    let resolveReloadA:
      | ((value: ReturnType<typeof markdownDocument>) => void)
      | null = null;
    const reloadA = new Promise<ReturnType<typeof markdownDocument>>((resolve) => {
      resolveReloadA = resolve;
    });
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        body: 'A body',
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        body: 'B body',
        path: '/repo/b.md',
        title: '文档 B',
      }))
      .mockReturnValueOnce(reloadA);

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    await user.click(screen.getByRole('tab', { name: /文档 A/ }));

    expect(screen.queryByText('正在打开文档...')).toBeNull();
    expect(screen.getByTestId('markdown-editor').getAttribute('data-markdown'))
      .toEqual(expect.stringContaining('文档 A'));

    resolveReloadA?.(markdownDocument({
      body: 'A body',
      path: '/repo/a.md',
      title: '文档 A',
    }));
  });

  it('uses unique editor keys for split panes showing the same document', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: 'A body',
      path: '/repo/a.md',
      title: '文档 A',
    }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('tab', { name: /文档 A/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '向右拆分' }));

    const editorKeys = screen
      .getAllByTestId('markdown-editor')
      .map((editor) => editor.getAttribute('data-document-key'));

    expect(new Set(editorKeys).size).toBe(editorKeys.length);
  });

  it('shows the active split document toc after focusing that editor group', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/b.md',
        title: '文档 B',
      }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('tab', { name: /文档 B/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '向右拆分' }));

    const groups = screen.getAllByTestId(/document-editor-group-/u);
    await user.click(within(groups[0]).getByTestId('markdown-editor'));
    await user.click(screen.getByRole('button', { name: '展开目录面板' }));

    expect(screen.getByText('文档 B 目录')).toBeTruthy();
  });

  it('shows a polished directory page and opens document cards', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '正文',
      path: '/repo/Guides/intro.md',
      title: '入门指南',
    }));

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

    expect(readMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/Guides/intro.md',
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
          path: 'README.md',
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
      path: 'README.md',
      staged: false,
      truncated: false,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));
    await user.click(
      await screen.findByRole('button', { name: /README.md/ }),
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
          path: 'README.md',
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
      name: /README.md/,
    });

    await user.pointer({
      keys: '[MouseRight]',
      target: changeRow,
    });
    await user.click(await screen.findByRole('menuitem', { name: '回滚' }));
    await user.click(await screen.findByRole('button', { name: '确认回滚' }));

    expect(gitRevertFileMock).toHaveBeenCalledWith('/repo', 'README.md');
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /README.md/ }),
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
          path: 'README.md',
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
          path: 'README.md',
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
      name: /README.md/,
    });

    await user.pointer({
      keys: '[MouseRight]',
      target: changeRow,
    });
    await user.click(await screen.findByRole('menuitem', { name: '暂存' }));

    expect(gitStageMock).toHaveBeenCalledWith('/repo', ['README.md']);
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
          path: 'README.md',
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
      'README.md',
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

  it('opens the functional AI panel with the current document context', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByTestId('ai-panel-icon-button'));

    expect(await screen.findByText('AI 助手')).toBeTruthy();
    expect(await screen.findByText('Fake Echo')).toBeTruthy();
    expect(screen.getByPlaceholderText('向 AI 询问当前工作区...')).toBeTruthy();
  });

  it('opens AI settings directly from the AI panel header', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));
    await user.click(await screen.findByRole('button', { name: '打开 AI 设置' }));

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeTruthy();
    expect(screen.getByText('AI 模型')).toBeTruthy();
    expect(screen.getByText('启用模型')).toBeTruthy();
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

  it('shows document metadata, resources, and downloads a resource from the right rail', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '你好 世界\n\n![cover](refinex-asset://asset-img)',
    }));
    resolveWorkspaceAssetMock.mockResolvedValue({
      absolutePath: '/repo/.refinex/assets/files/as/asset-img.png',
      id: 'asset-img',
      mediaType: 'image/png',
      name: 'cover.png',
      size: 2048,
    });
    readWorkspaceAssetDataMock.mockResolvedValue({
      base64Data: 'cG5n',
      id: 'asset-img',
      mediaType: 'image/png',
      name: 'cover.png',
    });
    selectWorkspaceAssetDownloadPathMock.mockResolvedValue('/Downloads/cover.png');
    writeExportFileMock.mockResolvedValue('/Downloads/cover.png');

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    const metaPanel = await screen.findByTestId('document-meta-panel');

    expect(metaPanel).toBeTruthy();
    expect(within(metaPanel).getByText('文档信息')).toBeTruthy();
    expect(within(metaPanel).getByText('项目说明')).toBeTruthy();
    expect(within(metaPanel).getByText(/\d+ 字/)).toBeTruthy();
    expect(within(metaPanel).getByText('1 个')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '资源 1' }));

    expect(await screen.findByText('cover.png')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '下载资源 cover.png' }));

    await waitFor(() => {
      expect(selectWorkspaceAssetDownloadPathMock).toHaveBeenCalledWith(
        'cover.png',
        'image/png',
      );
      expect(writeExportFileMock).toHaveBeenCalledWith(
        '/Downloads/cover.png',
        'cG5n',
      );
    });
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

  it('keeps settings out of the top-right tools and opens settings from the sidebar', async () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const rail = screen.getByTestId('right-tool-rail');

    expect(rail.className).toContain('h-11');
    expect(
      screen.queryByRole('button', { name: '打开设置菜单' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: '打开设置' })).toBeTruthy();
  });

  it('opens appearance settings from the settings menu by default', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

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

    await user.click(screen.getByRole('button', { name: '打开设置' }));
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
      ai: defaultAiSettings,
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: { pageWidthMode: 'wide' },
    });
  });

  it('opens AI settings and saves the enabled model profile', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'AI' }));

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeTruthy();
    expect(screen.getByText('AI 模型')).toBeTruthy();
    expect(screen.getByText('启用模型')).toBeTruthy();
    expect(screen.getByText('Fake Echo')).toBeTruthy();
    expect(screen.getByDisplayValue('Local')).toBeTruthy();
    expect(screen.getByDisplayValue('fake-echo')).toBeTruthy();
    expect(screen.getByText('测试运行时')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAppSettingsMock).toHaveBeenCalledWith(defaultAppSettings);
  });

  it('detects local assistant accounts and shows grouped models in AI settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiAgentProfilesMock.mockResolvedValue([
      fakeEchoProfile,
      codexDetectedProfile,
    ]);
    detectAiAccountsMock.mockResolvedValue(detectedAiAccounts);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'AI' }));

    expect(await screen.findByText('Accounts')).toBeTruthy();
    expect(screen.getByText('Use assistant accounts without adding API keys.')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Detected')).toBeTruthy();
    expect(screen.getByText('codex-cli 0.130.0')).toBeTruthy();
    expect(screen.getByText('Codex Models')).toBeTruthy();
    expect(screen.getByText('GPT-5.4')).toBeTruthy();
    expect(detectAiAccountsMock).toHaveBeenCalled();
  });

  it('filters appearance settings with the settings search input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

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

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('radio', { name: '暗色' }));

    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('passes default wide page width mode to the workspace editor', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce(defaultAppSettings);
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({}));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));

    expect(
      (await screen.findByTestId('markdown-editor')).getAttribute(
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
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({}));
    saveAppSettingsMock.mockResolvedValueOnce(defaultAppSettings);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    expect(
      (await screen.findByTestId('markdown-editor')).getAttribute(
        'data-page-width-mode',
      ),
    ).toBe('wide');

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('radio', { name: '全宽' }));
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(
      (await screen.findByTestId('markdown-editor')).getAttribute(
        'data-page-width-mode',
      ),
    ).toBe('wide');
  });

  it('shows saved feedback when applying appearance settings', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('radio', { name: '全宽' }));
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(screen.getByText('设置已保存。')).toBeTruthy();
  });

  it('filters storage settings with the settings search input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

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
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '# 项目说明',
    }));
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await user.click(await screen.findByTestId('markdown-editor'));
    await user.click(screen.getByRole('button', { name: '展开目录面板' }));

    expect(screen.getByRole('button', { name: '背景' })).toBeTruthy();
  });

  it('renders save state in the workspace bottom background area', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '# 项目说明\n\n正文 加粗',
    }));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await screen.findByTestId('markdown-editor');

    const blocks = screen.getByTestId('workspace-main-blocks');
    const editorBlock = screen.getByTestId('workspace-editor-block');
    const statusBar = screen.getByTestId('workspace-status-bar');

    expect(blocks.className).toContain('flex-1');
    expect(editorBlock.dataset.chrome).toBe('codex-main-surface');
    expect(statusBar.textContent).toMatch(/^已保存词数 \d+行数 \d+字符 \d+UTF-8 · Markdown$/);
    expect(statusBar.className).toContain('shrink-0');
    expect(statusBar.className).toContain('justify-end');
    expect(statusBar.className).not.toContain('border-t');
    expect(statusBar.className).not.toContain('absolute');
    expect(
      editorBlock.compareDocumentPosition(statusBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId('editor-status-bar')).toBeNull();
  });

  it('uses the Codex-inspired workspace chrome around the sidebar and editor', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const shell = screen.getByTestId('workspace-shell');
    const sidebar = screen.getByTestId('workspace-sidebar');
    const editorBlock = screen.getByTestId('workspace-editor-block');

    expect(shell.dataset.chrome).toBe('codex-workspace');
    expect(sidebar.dataset.chrome).toBe('codex-sidebar');
    expect(sidebar.className).not.toContain('shadow-sm');
    expect(sidebar.className).not.toContain('rounded-lg');
    expect(
      Array.from(sidebar.querySelectorAll('span')).some((element) =>
        ['bg-[#ff5f57]', 'bg-[#febc2e]', 'bg-[#28c840]'].some((className) =>
          element.className.includes(className),
        ),
      ),
    ).toBe(false);
    expect(screen.queryByText('项目')).toBeNull();
    expect(editorBlock.className).toContain('rounded-xl');
    expect(editorBlock.className).toContain('shadow-[');
    expect(editorBlock.className).not.toContain('my-2');
    expect(editorBlock.className).not.toContain('mr-2');
  });

  it('keeps the top header free of the placeholder document tab', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(screen.queryByText('Refinex Wiki')).toBeNull();
    expect(screen.getByRole('button', { name: '搜索文档' })).toBeTruthy();
    expect(screen.getByTestId('right-header-tools')).toBeTruthy();
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
      name: '未命名文档.md',
      kind: 'document' as const,
      relativePath: '未命名文档.md',
      absolutePath: '/repo/未命名文档.md',
      title: '未命名文档',
    };
    createMarkdownDocumentMock.mockResolvedValueOnce({
      content: markdownDocument({
        body: '',
        path: createdNode.absolutePath,
        title: '未命名文档',
      }),
      node: createdNode,
    });
    loadWorkspaceTreeMock.mockResolvedValueOnce({
      ...snapshot,
      nodes: [createdNode],
    });
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '',
      path: createdNode.absolutePath,
      title: '未命名文档',
    }));
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    await user.click(screen.getAllByRole('button', { name: '新建文档' })[0]);

    expect(createMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名文档',
    );
    expect(await screen.findByTestId('markdown-editor')).toBeTruthy();
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
    createMarkdownDocumentMock.mockResolvedValueOnce({
      content: markdownDocument({
        body: '',
        path: '/repo/未命名文档.md',
        title: '未命名文档',
      }),
      node: {
        id: 'untitled',
        name: '未命名文档.md',
        kind: 'document',
        relativePath: '未命名文档.md',
        absolutePath: '/repo/未命名文档.md',
        title: '未命名文档',
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
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '',
      path: '/repo/未命名文档.md',
      title: '未命名文档',
    }));
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建文档' }));
    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建目录' }));

    expect(createMarkdownDocumentMock).toHaveBeenCalledWith(
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
    expect(screen.getByPlaceholderText('搜索')).toBeTruthy();
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
    expect(screen.queryByTestId('windows-titlebar-controls')).toBeNull();
    expect(screen.queryByText('未选择文档')).toBeNull();
    expect(screen.getByPlaceholderText('搜索')).toBeTruthy();
  });

  it('renders compact Windows titlebar controls in the Tauri Windows runtime', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('workspace-titlebar-drag-region')).toBeTruthy();
    expect(
      screen.getByTestId('workspace-titlebar-drag-region').className,
    ).not.toContain('border-b');
    expect(screen.getByTestId('windows-titlebar-controls')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '最小化窗口' }));
    await user.click(screen.getByRole('button', { name: '最大化或还原窗口' }));
    await user.click(screen.getByRole('button', { name: '关闭窗口' }));

    expect(minimizeAppWindowMock).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeAppWindowMock).toHaveBeenCalledTimes(1);
    expect(closeAppWindowMock).toHaveBeenCalledTimes(1);
  });

  it('opens global search from the titlebar and opens a full-text result', async () => {
    const user = userEvent.setup();
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    readMarkdownDocumentMock.mockImplementation(async (_rootPath, documentPath) =>
      markdownDocument({
        body:
          documentPath === '/repo/a.md'
            ? '这里包含审计追踪和运维治理的正文内容。'
            : '这里讨论普通的日常笔记。',
        path: documentPath,
        title: documentPath === '/repo/a.md' ? '文档 A' : '文档 B',
      }),
    );

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByRole('button', { name: '搜索文档' }));
    await user.type(await screen.findByRole('searchbox', { name: '搜索文档' }), '审计追踪');

    const result = await screen.findByRole('button', {
      name: /打开文档 文档 A/u,
    });
    expect(result.textContent).toContain('审计追踪');

    await user.click(result);

    await waitFor(() => {
      expect(readMarkdownDocumentMock).toHaveBeenLastCalledWith(
        '/repo',
        '/repo/a.md',
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens global search from keyboard shortcuts', async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    readMarkdownDocumentMock.mockResolvedValue(markdownDocument({}));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: 'Shift' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('keeps the active document title out of the editor body chrome', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({}));
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('editor-document-path')).toBeNull();

    await user.click(screen.getByText('项目说明'));

    expect(await screen.findByTestId('markdown-editor')).toBeTruthy();
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

  it('only shows the right resize handle when the related panel is visible', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(
      screen.getByRole('separator', { name: '调整左侧目录宽度' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('separator', { name: '调整右侧面板宽度' }),
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

  it('keeps the resized left sidebar width', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 360, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

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

  it('removes the left directory toggle and keeps global search centered in the header', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const headerSearch = screen.getByRole('button', { name: '搜索文档' });

    expect(screen.queryByTestId('left-tool-rail')).toBeNull();
    expect(screen.queryByRole('button', { name: '折叠目录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '展开目录' })).toBeNull();
    expect(headerSearch.dataset.chrome).toBe('codex-centered-search');
    expect(headerSearch.className).toContain('left-1/2');
    expect(screen.queryByTestId('workspace-titlebar')).toBeNull();
  });

  it('opens the terminal bottom panel from the right header tools', async () => {
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

  it('places Git and terminal tools in the right header tool group', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const rightHeaderTools = screen.getByTestId('right-header-tools');
    const terminalButton = screen.getByRole('button', { name: '打开终端' });
    const gitLogButton = screen.getByRole('button', { name: '打开 Git 日志' });
    const gitButton = screen.getByRole('button', { name: '打开 Git 面板' });

    expect(rightHeaderTools.contains(gitButton)).toBe(true);
    expect(rightHeaderTools.contains(terminalButton)).toBe(true);
    expect(rightHeaderTools.contains(gitLogButton)).toBe(true);
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

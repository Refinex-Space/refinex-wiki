import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

const globalsCssPath = join(process.cwd(), 'app/globals.css');

const {
  addScrollListenerMock,
  dispatchMock,
  focusMock,
  markoraMock,
  removeScrollListenerMock,
  scrollToMock,
} = vi.hoisted(() => ({
  addScrollListenerMock: vi.fn(),
  dispatchMock: vi.fn(),
  focusMock: vi.fn(),
  markoraMock: vi.fn(() => []),
  removeScrollListenerMock: vi.fn(),
  scrollToMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@uiw/react-codemirror', async () => {
  const React = await import('react');

  return {
    default: React.forwardRef<
      unknown,
      {
        className?: string;
        value: string;
        onChange?: (value: string) => void;
      }
    >(function MockCodeMirror({ className, value, onChange }, ref) {
      React.useImperativeHandle(ref, () => ({
        view: {
          dispatch: dispatchMock,
          focus: focusMock,
          scrollDOM: {
            addEventListener: addScrollListenerMock,
            removeEventListener: removeScrollListenerMock,
            scrollTo: scrollToMock,
            scrollTop: 0,
          },
        },
      }));

      return (
        <textarea
          aria-label="Markdown 正文"
          className={`cm-editor ${className ?? ''}`}
          value={value}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        />
      );
    }),
  };
});

vi.mock('@refinex/markora/editor', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@refinex/markora/editor')>();

  return {
    ...actual,
    markora: markoraMock,
  };
});

describe('MarkdownEditor', () => {
  beforeEach(() => {
    addScrollListenerMock.mockClear();
    dispatchMock.mockClear();
    focusMock.mockClear();
    markoraMock.mockClear();
    removeScrollListenerMock.mockClear();
    scrollToMock.mockClear();
  });

  it('渲染编辑器容器', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 标题"
        onMarkdownChange={() => {}}
      />,
    );
    expect(screen.getByTestId('markdown-editor-root')).toBeTruthy();
    expect(document.querySelector('.cm-editor')).toBeTruthy();
  });

  it('CodeMirror 使用剩余高度而不是挤占元数据区域高度', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 标题"
        onMarkdownChange={() => {}}
      />,
    );

    const editor = screen.getByLabelText('Markdown 正文');

    expect(editor.className).toContain('min-h-0');
    expect(editor.className).toContain('flex-1');
    expect(editor.className).not.toContain('h-full');
  });

  it('Cmd+S 触发 onSaveRequested', () => {
    const onSave = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onSaveRequested={onSave}
        onMarkdownChange={() => {}}
      />,
    );
    const root = screen.getByTestId('markdown-editor-root');
    fireEvent.keyDown(root, { key: 's', metaKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it('Ctrl+S 触发 onSaveRequested', () => {
    const onSave = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onSaveRequested={onSave}
        onMarkdownChange={() => {}}
      />,
    );
    const root = screen.getByTestId('markdown-editor-root');
    fireEvent.keyDown(root, { key: 's', ctrlKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it('documentKey 变化不抛错', () => {
    const { rerender } = render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# a"
        onMarkdownChange={() => {}}
      />,
    );
    expect(() =>
      rerender(
        <MarkdownEditor
          documentKey="doc-2"
          markdown="# b"
          onMarkdownChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });

  it('默认使用 wide 页宽模式', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onMarkdownChange={() => {}}
      />,
    );

    expect(
      screen
        .getByTestId('markdown-editor-root')
        .getAttribute('data-page-width-mode'),
    ).toBe('wide');
  });

  it('渲染 wide 页宽模式不再添加外层限宽容器', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );
    // 重构后限宽下沉到 markora 内容层，外层不再有 max-w-* wrapper。
    expect(document.querySelector('.max-w-\\[88rem\\]')).toBeNull();
    expect(
      screen.getByTestId('markdown-editor-root').className,
    ).toContain('workspace-editor-page-wide');
  });

  it('编辑器外壳不再使用外层滚动容器与限宽内层', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    // 重构后 CodeMirror 自身负责滚动，外层 scrollarea + mx-auto 限宽层已移除。
    expect(
      document.querySelector('.workspace-editor-scrollarea'),
    ).toBeNull();
  });

  it('渲染 wide 页宽模式标记 markora 内容层可全宽', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    expect(screen.getByTestId('markdown-editor-root').className).toContain(
      'workspace-editor-shell',
    );
    expect(screen.getByTestId('markdown-editor-root').className).toContain(
      'workspace-editor-page-wide',
    );
  });

  it('wide 页宽模式使用 Markora TOC 数据并关闭内置面板', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = markoraMock.mock.calls.at(-1)?.[0];
    expect(config.toc.enabled).toBe(false);
    expect(config.toc.onTocChange).toEqual(expect.any(Function));
    // wide 模式不下沉限宽，extensions 为空数组。
    expect(config.extensions).toEqual([]);
  });

  it('渲染 Notion 风格目录横条和 hover 面板', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = markoraMock.mock.calls.at(-1)?.[0];
    act(() => {
      config.toc.onTocChange([
        {
          active: false,
          from: 4,
          id: 'intro',
          level: 2,
          text: '一句话结论',
          to: 12,
        },
        {
          active: true,
          from: 24,
          id: 'dry-run',
          level: 3,
          text: '构建并做 dry-run',
          to: 42,
        },
      ]);
    });

    expect(screen.getByTestId('markora-toc-overlay')).toBeTruthy();
    expect(screen.getByTestId('markora-toc-rail')).toBeTruthy();
    expect(screen.getByTestId('markora-toc-hover-bridge')).toBeTruthy();
    expect(screen.getByTestId('markora-toc-panel')).toBeTruthy();
    expect(screen.getByTestId('markora-toc-panel').className).toContain(
      'markora-toc-panel-scrollarea',
    );
    expect(screen.getByTestId('markora-toc-bar-intro').className).toContain(
      'w-6',
    );
    expect(screen.getByTestId('markora-toc-bar-dry-run').className).toContain(
      'bg-foreground',
    );
    expect(screen.getByRole('button', { name: '跳转到 构建并做 dry-run' }))
      .toBeTruthy();
  });

  it('点击自定义目录项跳转到对应标题', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = markoraMock.mock.calls.at(-1)?.[0];
    act(() => {
      config.toc.onTocChange([
        {
          active: true,
          from: 24,
          id: 'dry-run',
          level: 2,
          text: '构建并做 dry-run',
          to: 42,
        },
      ]);
    });

    fireEvent.click(
      screen.getByRole('button', { name: '跳转到 构建并做 dry-run' }),
    );

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.anything(),
        selection: expect.anything(),
      }),
    );
    expect(focusMock).toHaveBeenCalled();
  });

  it('目录弹层和文档滚动条使用轻量滚动样式', () => {
    const globalsCssSource = readFileSync(globalsCssPath, 'utf8');

    expect(globalsCssSource).toContain(
      '.markora-toc-panel-scrollarea::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain('scrollbar-width: none;');
    expect(globalsCssSource).toContain(
      '.workspace-editor-shell .cm-scroller::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-scrollarea::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-scrollarea::-webkit-scrollbar-track-piece',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-shell .cm-markora .cm-content',
    );
    expect(globalsCssSource).toContain('padding-bottom: 8rem;');
    expect(globalsCssSource).toContain('width: 4px;');
    expect(globalsCssSource).toContain('background: transparent;');
  });

  it('standard 页宽模式通过 markora extension 下沉限宽', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="standard"
        onMarkdownChange={() => {}}
      />,
    );

    // 重构后限宽下沉到 .cm-content，外层不再有 max-w-[64rem] 容器。
    expect(
      document.querySelector('.max-w-\\[64rem\\]'),
    ).toBeNull();
    const config = markoraMock.mock.calls.at(-1)?.[0];
    expect(config.extensions.length).toBeGreaterThan(0);
  });

  it('standard 页宽模式通过 markora extension 避免内层滚动条', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="standard"
        onMarkdownChange={() => {}}
      />,
    );

    expect(markoraMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extensions: expect.arrayContaining([expect.anything()]),
      }),
    );
  });

  it('把文档顶部 frontmatter 按原始 key/value 展示为元数据区域', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={[
          '---',
          'createdAt: 2026-06-18T11:35:15.383Z',
          'refinexDialect: 1',
          'title: Octarine',
          'customKey: 自定义值',
          '---',
          '',
          '# Octarine',
        ].join('\n')}
        onMarkdownChange={() => {}}
      />,
    );

    expect(screen.getByTestId('markdown-frontmatter-panel')).toBeTruthy();
    expect(screen.getByText('文档元数据')).toBeTruthy();
    expect(screen.getByText('createdAt')).toBeTruthy();
    expect(screen.getByText('2026-06-18T11:35:15.383Z')).toBeTruthy();
    expect(screen.getByText('refinexDialect')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('Octarine')).toBeTruthy();
    expect(screen.getByText('customKey')).toBeTruthy();
    expect(screen.getByText('自定义值')).toBeTruthy();
    expect(screen.queryByText('创建时间')).toBeNull();
    expect(screen.queryByText('方言版本')).toBeNull();
    expect(screen.queryByText('标题')).toBeNull();
  });

  it('编辑区只显示正文，不显示原始 frontmatter 文本', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={'---\ntitle: Octarine\n---\n\n# Octarine'}
        onMarkdownChange={() => {}}
      />,
    );

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe('# Octarine');
    expect(screen.queryByDisplayValue(/title: Octarine/u)).toBeNull();
  });

  it('编辑带 frontmatter 的正文时保留原始 metadata 字段', () => {
    const onMarkdownChange = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={'---\ntitle: Octarine\ncustomKey: keep\n---\n\n# Octarine'}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文' },
    });

    expect(onMarkdownChange).toHaveBeenCalledWith(
      '---\ntitle: Octarine\ncustomKey: keep\n---\n\n# 新正文\n',
    );
  });

  it('没有 frontmatter 时编辑回调保持普通 Markdown', () => {
    const onMarkdownChange = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 原正文"
        onMarkdownChange={onMarkdownChange}
      />,
    );

    expect(screen.queryByTestId('markdown-frontmatter-panel')).toBeNull();

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文' },
    });

    expect(onMarkdownChange).toHaveBeenCalledWith('# 新正文');
  });
});

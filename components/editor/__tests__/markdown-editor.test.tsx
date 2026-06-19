import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

const { markoraMock } = vi.hoisted(() => ({
  markoraMock: vi.fn(() => []),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@uiw/react-codemirror', async () => {
  const React = await import('react');

  return {
    default: React.forwardRef<
      HTMLTextAreaElement,
      {
        value: string;
        onChange?: (value: string) => void;
      }
    >(function MockCodeMirror({ value, onChange }, ref) {
      return (
        <textarea
          aria-label="Markdown 正文"
          className="cm-editor"
          ref={ref}
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
    markoraMock.mockClear();
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
      'workspace-editor-page-wide',
    );
  });

  it('wide 页宽模式启用内置目录且不限宽', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = markoraMock.mock.calls.at(-1)?.[0];
    expect(config.toc).toEqual({
      enabled: true,
      storageKey: 'refinex-wiki:toc',
    });
    // wide 模式不下沉限宽，extensions 为空数组。
    expect(config.extensions).toEqual([]);
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

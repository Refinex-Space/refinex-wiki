import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

describe('MarkdownEditor', () => {
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

  it('渲染 wide 页宽模式添加 max-w-none', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );
    const wideWrapper = document.querySelector('.max-w-none');
    expect(wideWrapper).toBeTruthy();
  });
});

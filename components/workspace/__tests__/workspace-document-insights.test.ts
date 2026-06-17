import { describe, expect, it } from 'vitest';

import {
  countMarkdownCharacters,
  extractResourceReferencesFromMarkdown,
} from '@/components/workspace/workspace-document-insights';

describe('countMarkdownCharacters', () => {
  it('统计去空白后的字符数（含 markdown 语法字符）', () => {
    expect(countMarkdownCharacters('# 标题\n\n正文 空格')).toBe(
      '#标题正文空格'.length,
    );
  });

  it('空字符串返回 0', () => {
    expect(countMarkdownCharacters('')).toBe(0);
  });

  it('undefined 返回 0', () => {
    expect(countMarkdownCharacters(undefined)).toBe(0);
  });

  it('全是空白返回 0', () => {
    expect(countMarkdownCharacters('   \n\t  ')).toBe(0);
  });
});

describe('extractResourceReferencesFromMarkdown', () => {
  it('提取 refinex-asset:// 图片引用', () => {
    const markdown =
      '![图](refinex-asset://abc123)\n![图2](refinex-asset://def456)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      id: 'abc123',
      nodeType: 'image',
      url: 'refinex-asset://abc123',
    });
    expect(refs[1]).toEqual({
      id: 'def456',
      nodeType: 'image',
      url: 'refinex-asset://def456',
    });
  });

  it('去重相同 id', () => {
    const markdown = '![图](refinex-asset://abc)\n[](refinex-asset://abc)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs).toHaveLength(1);
  });

  it('无引用返回空数组', () => {
    expect(extractResourceReferencesFromMarkdown('# 标题\n正文')).toEqual([]);
  });

  it('undefined 返回空数组', () => {
    expect(extractResourceReferencesFromMarkdown(undefined)).toEqual([]);
  });

  it('识别图片 vs 文件链接的 nodeType', () => {
    const markdown =
      '![图](refinex-asset://img1)\n[文件](refinex-asset://file1)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs.find((r) => r.id === 'img1')?.nodeType).toBe('image');
    expect(refs.find((r) => r.id === 'file1')?.nodeType).toBe('file');
  });

  it('保留引用出现顺序', () => {
    const markdown =
      '[b](refinex-asset://second)\n![a](refinex-asset://first)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs.map((r) => r.id)).toEqual(['second', 'first']);
  });
});

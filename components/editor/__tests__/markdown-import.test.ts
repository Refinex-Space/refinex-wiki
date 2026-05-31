import { describe, expect, it } from 'vitest';

import {
  deserializeMarkdownCodeBlock,
  serializeCodeDrawing,
} from '../plugins/markdown-kit';

const editor = {
  getType: (key: string) => key,
};

describe('MarkdownKit code drawing rules', () => {
  it('converts mermaid fences to code drawing nodes', () => {
    const node = deserializeMarkdownCodeBlock(
      {
        lang: 'mermaid',
        value: 'graph TD\n  A --> B',
      },
      {},
      { editor },
    );

    expect(node).toMatchObject({
      type: 'code_drawing',
      data: {
        code: 'graph TD\n  A --> B',
        drawingMode: 'Both',
        drawingType: 'Mermaid',
      },
      children: [{ text: '' }],
    });
  });

  it('keeps non-mermaid fences as code blocks', () => {
    const node = deserializeMarkdownCodeBlock(
      {
        lang: 'ts',
        value: 'const value = 1;',
      },
      {},
      { editor },
    );

    expect(node).toMatchObject({
      type: 'code_block',
      lang: 'ts',
    });
  });

  it('serializes mermaid code drawings back to mermaid fences', () => {
    expect(
      serializeCodeDrawing({
        type: 'code_drawing',
        data: {
          code: 'graph TD\n  A --> B',
          drawingType: 'Mermaid',
        },
      }),
    ).toEqual({
      type: 'code',
      lang: 'mermaid',
      value: 'graph TD\n  A --> B',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  CODE_DRAWING_PREVIEW_MAX_HEIGHT,
  getCodeDrawingPreviewImageStyle,
  isCodeDrawingErrorImage,
} from '../code-drawing-rendering';

describe('isCodeDrawingErrorImage', () => {
  it('identifies Mermaid syntax error SVG previews', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<text class="error-text">Syntax error in text</text>',
      '<text>mermaid version 11.15.0</text>',
      '</svg>',
    ].join('');

    expect(
      isCodeDrawingErrorImage(`data:image/svg+xml,${encodeURIComponent(svg)}`)
    ).toBe(true);
  });

  it('identifies base64 encoded Mermaid syntax error SVG previews', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<text class="error-text">Syntax error in text</text>',
      '<text>mermaid version 11.15.0</text>',
      '</svg>',
    ].join('');

    expect(
      isCodeDrawingErrorImage(`data:image/svg+xml;base64,${btoa(svg)}`)
    ).toBe(true);
  });

  it('does not flag normal SVG previews', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<rect width="120" height="80" />',
      '<text>正常图表</text>',
      '</svg>',
    ].join('');

    expect(
      isCodeDrawingErrorImage(`data:image/svg+xml,${encodeURIComponent(svg)}`)
    ).toBe(false);
  });

  it('keeps rendered diagrams within a bounded preview viewport', () => {
    expect(CODE_DRAWING_PREVIEW_MAX_HEIGHT).toBe('min(60vh, 520px)');
    expect(getCodeDrawingPreviewImageStyle()).toEqual({
      maxHeight: 'calc(min(60vh, 520px) - 2rem)',
    });
  });
});

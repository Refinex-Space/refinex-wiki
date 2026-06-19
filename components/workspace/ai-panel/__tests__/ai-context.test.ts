import { describe, expect, it } from 'vitest';

import { buildAiContextPack, createStableContentHash } from '../ai-context';

describe('createStableContentHash', () => {
  it('returns stable hashes for identical markdown', () => {
    expect(createStableContentHash('# 标题')).toBe(
      createStableContentHash('# 标题'),
    );
  });

  it('returns different hashes for different markdown', () => {
    expect(createStableContentHash('# A')).not.toBe(
      createStableContentHash('# B'),
    );
  });
});

describe('buildAiContextPack', () => {
  it('builds document context from current Markdown panel data', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/guide.md',
        id: '/repo/guide.md',
        kind: 'document',
        name: 'guide.md',
        relativePath: 'guide.md',
        title: '指南',
      },
      documentPanelData: {
        markdown: '# 指南\n\n正文',
        metadata: {
          createdAt: '2026-06-19T00:00:00Z',
          title: '指南',
          updatedAt: '2026-06-19T01:00:00Z',
        },
      },
      intent: 'summarize-document',
      workspaceRootPath: '/repo',
    });

    expect(context.workspaceRootPath).toBe('/repo');
    expect(context.intent).toBe('summarize-document');
    expect(context.document).toEqual(
      expect.objectContaining({
        dirty: false,
        markdown: '# 指南\n\n正文',
        modifiedAt: null,
        path: '/repo/guide.md',
        title: '指南',
      }),
    );
    expect(context.document?.contentHash).toMatch(/^fnv1a-/);
  });

  it('falls back to the document name when metadata title is empty', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/readme.md',
        id: '/repo/readme.md',
        kind: 'document',
        name: 'readme.md',
        relativePath: 'readme.md',
      },
      documentPanelData: {
        markdown: '# Readme',
        metadata: { createdAt: '', title: '', updatedAt: '' },
      },
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.document?.title).toBe('readme.md');
  });

  it('omits document context when no document is open', () => {
    const context = buildAiContextPack({
      currentDocument: null,
      documentPanelData: null,
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.document).toBeUndefined();
  });
});

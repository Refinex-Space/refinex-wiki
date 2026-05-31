import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const mediaNodeFiles = [
  'components/ui/media-image-node.tsx',
  'components/ui/media-video-node.tsx',
  'components/ui/media-audio-node.tsx',
  'components/ui/media-file-node.tsx',
];

describe('Media local asset source wiring', () => {
  it('resolves local workspace asset URLs before rendering media sources', () => {
    const resolverSource = readFileSync(
      join(process.cwd(), 'components/editor/use-resolved-asset-url.ts'),
      'utf8',
    );

    expect(resolverSource).toContain(
      "export const LOCAL_ASSET_URL_PREFIX = 'refinex-asset://';",
    );
    expect(resolverSource).toContain("import { convertFileSrc } from '@tauri-apps/api/core';");
    expect(resolverSource).toContain('resolveWorkspaceAsset(rootPath, assetId)');

    for (const file of mediaNodeFiles) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      expect(source).toContain('useResolvedAssetUrl(');
      expect(source).toMatch(/props\.element\.url as string \| undefined/);
    }
  });
});

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { createExportArchiveBlob } from '../workspace-export-archive';

describe('workspace-document-transfer', () => {
  it('creates export archives with safe relative entries', async () => {
    const archive = await createExportArchiveBlob([
      {
        path: 'Guides/intro.md',
        base64Data: '5q2j5paH',
      },
    ]);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());

    await expect(zip.file('Guides/intro.md')?.async('string')).resolves.toBe(
      '正文',
    );
  });

  it('rejects archive entries that escape the zip root', async () => {
    await expect(
      createExportArchiveBlob([
        {
          path: '../bad.md',
          base64Data: 'YQ==',
        },
      ]),
    ).rejects.toThrow('压缩包条目路径无效');
  });
});

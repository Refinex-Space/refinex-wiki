import JSZip from 'jszip';

import type { ExportArchiveEntry } from './workspace-types';

export async function createExportArchiveBlob(entries: ExportArchiveEntry[]) {
  const zip = new JSZip();

  for (const entry of entries) {
    zip.file(normalizeArchiveEntryPath(entry.path), entry.base64Data, {
      base64: true,
    });
  }

  return zip.generateAsync({
    compression: 'DEFLATE',
    type: 'blob',
  });
}

function normalizeArchiveEntryPath(path: string) {
  const normalized = path.replace(/\\/gu, '/');

  if (normalized.startsWith('/')) {
    throw new Error('压缩包条目不能是绝对路径');
  }

  const parts = normalized.split('/');

  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('压缩包条目路径无效');
  }

  return parts.join('/');
}

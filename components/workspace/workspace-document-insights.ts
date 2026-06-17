import { LOCAL_ASSET_URL_PREFIX } from './workspace-local-assets';

export interface DocumentResourceReference {
  id: string;
  nodeType: string;
  url: string;
}

const ASSET_URL_PATTERN = buildAssetUrlPattern();

export function countMarkdownCharacters(
  markdown: string | undefined,
): number {
  if (!markdown) {
    return 0;
  }

  return Array.from(markdown.replace(/\s+/g, '')).length;
}

export function extractResourceReferencesFromMarkdown(
  markdown: string | undefined,
): DocumentResourceReference[] {
  if (!markdown) {
    return [];
  }

  const references = new Map<string, DocumentResourceReference>();

  for (const match of markdown.matchAll(ASSET_URL_PATTERN)) {
    const isImage = match[1] !== undefined;
    const url = match[1] ?? match[2];

    if (!url) {
      continue;
    }

    const id = url.slice(LOCAL_ASSET_URL_PREFIX.length).trim();

    if (!id || references.has(id)) {
      continue;
    }

    references.set(id, {
      id,
      nodeType: isImage ? 'image' : 'file',
      url,
    });
  }

  return Array.from(references.values());
}

function buildAssetUrlPattern(): RegExp {
  const prefix = escapeRegExp(LOCAL_ASSET_URL_PREFIX);

  return new RegExp(
    `!\\[[^\\]]*\\]\\((${prefix}[^)\\s]+)\\)|` +
      `\\[[^\\]]*\\]\\((${prefix}[^)\\s]+)\\)`,
    'g',
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

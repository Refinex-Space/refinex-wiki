import type { Value } from 'platejs';

import { readWorkspaceAssetData } from './workspace-api';

export const LOCAL_ASSET_URL_PREFIX = 'refinex-asset://';

export async function inlineLocalImageAssets(
  value: Value,
  rootPath?: string | null,
): Promise<Value> {
  if (!rootPath) {
    return value;
  }

  const cache = new Map<string, Promise<string | null>>();

  return inlineLocalImageAssetsInNode(value, rootPath, cache) as Promise<Value>;
}

export async function localAssetUrlToImageDataUrl(
  url: string,
  rootPath: string,
) {
  const assetId = getLocalAssetId(url);

  if (!assetId) {
    return null;
  }

  const asset = await readWorkspaceAssetData(rootPath, assetId);

  if (!asset.mediaType.startsWith('image/')) {
    return null;
  }

  return `data:${asset.mediaType};base64,${asset.base64Data}`;
}

export function isLocalAssetUrl(url: string | undefined | null) {
  return Boolean(url?.startsWith(LOCAL_ASSET_URL_PREFIX));
}

async function inlineLocalImageAssetsInNode(
  node: unknown,
  rootPath: string,
  cache: Map<string, Promise<string | null>>,
): Promise<unknown> {
  if (Array.isArray(node)) {
    return Promise.all(
      node.map((child) => inlineLocalImageAssetsInNode(child, rootPath, cache)),
    );
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const source = node as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(source)) {
    if (key === 'url' && typeof child === 'string' && isLocalAssetUrl(child)) {
      next[key] = (await resolveCachedImageDataUrl(child, rootPath, cache)) ?? child;
      continue;
    }

    next[key] = await inlineLocalImageAssetsInNode(child, rootPath, cache);
  }

  return next;
}

function resolveCachedImageDataUrl(
  url: string,
  rootPath: string,
  cache: Map<string, Promise<string | null>>,
) {
  const assetId = getLocalAssetId(url);

  if (!assetId) {
    return Promise.resolve(null);
  }

  const cached = cache.get(assetId);

  if (cached) {
    return cached;
  }

  const resolved = localAssetUrlToImageDataUrl(url, rootPath);
  cache.set(assetId, resolved);

  return resolved;
}

function getLocalAssetId(url: string) {
  const assetId = url.slice(LOCAL_ASSET_URL_PREFIX.length).trim();

  return assetId || null;
}

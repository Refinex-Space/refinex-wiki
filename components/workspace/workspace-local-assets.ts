import { readWorkspaceAssetData } from './workspace-api';

export const LOCAL_ASSET_URL_PREFIX = 'refinex-asset://';

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

function getLocalAssetId(url: string) {
  const assetId = url.slice(LOCAL_ASSET_URL_PREFIX.length).trim();

  return assetId || null;
}

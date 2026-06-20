'use client';

import * as React from 'react';

import { convertFileSrc } from '@tauri-apps/api/core';

import { useWorkspaceAssetContext } from '@/components/editor/workspace-asset-context';
import { resolveWorkspaceAsset } from '@/components/workspace/workspace-api';
import { LOCAL_ASSET_URL_PREFIX } from '@/components/workspace/workspace-local-assets';

function getInitialUrl(url: string | undefined): string | null {
  if (!url || url.startsWith(LOCAL_ASSET_URL_PREFIX)) {
    return null;
  }

  return url;
}

export function useResolvedAssetUrl(url: string | undefined): string | null {
  const { mode, rootPath } = useWorkspaceAssetContext();
  const [resolvedUrl, setResolvedUrl] = React.useState<string | null>(() =>
    getInitialUrl(url),
  );

  React.useEffect(() => {
    let cancelled = false;

    async function resolveAssetUrl() {
      if (!url || !url.startsWith(LOCAL_ASSET_URL_PREFIX)) {
        setResolvedUrl(url ?? null);
        return;
      }

      if (mode !== 'workspace' || !rootPath) {
        setResolvedUrl(null);
        return;
      }

      setResolvedUrl(null);

      try {
        const assetId = url.slice(LOCAL_ASSET_URL_PREFIX.length);
        const asset = await resolveWorkspaceAsset(rootPath, assetId);

        if (!cancelled) {
          setResolvedUrl(convertFileSrc(asset.absolutePath));
        }
      } catch (error) {
        console.warn('Failed to resolve local workspace asset.', error);

        if (!cancelled) {
          setResolvedUrl(null);
        }
      }
    }

    void resolveAssetUrl();

    return () => {
      cancelled = true;
    };
  }, [mode, rootPath, url]);

  return resolvedUrl;
}

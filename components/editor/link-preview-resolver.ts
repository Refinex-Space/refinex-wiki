'use client';

import { isTauriRuntime } from '@/components/workspace/workspace-api';

interface LinkPreviewResolveInput {
  title: string;
  url: string;
}

interface LinkPreviewMetadata {
  kind?: 'link';
  url?: string;
  title?: string;
  domain?: string;
  image?: string;
  description?: string;
  error?: 'blocked_url' | 'invalid_url';
}

export async function resolveLinkPreview({
  title,
  url,
}: LinkPreviewResolveInput) {
  const metadata = isTauriRuntime()
    ? await resolveLinkPreviewViaTauri(title, url)
    : await resolveLinkPreviewViaApi(title, url);

  if (metadata.error) {
    throw new Error('Failed to resolve link preview');
  }

  return normalizeResolvedMetadata(metadata, title, url);
}

async function resolveLinkPreviewViaTauri(title: string, url: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<LinkPreviewMetadata>('resolve_link_preview', {
    title: title || null,
    url,
  });
}

async function resolveLinkPreviewViaApi(title: string, url: string) {
  const response = await fetch(
    `/api/link-preview?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  );

  if (!response.ok) {
    throw new Error('Failed to resolve link preview');
  }

  return response.json() as Promise<LinkPreviewMetadata>;
}

function normalizeResolvedMetadata(
  metadata: LinkPreviewMetadata,
  fallbackTitle: string,
  fallbackUrl: string,
) {
  return {
    kind: 'link' as const,
    url: metadata.url || fallbackUrl,
    title: metadata.title || fallbackTitle || fallbackUrl,
    ...(metadata.domain ? { domain: metadata.domain } : {}),
    ...(metadata.image ? { image: metadata.image } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
  };
}

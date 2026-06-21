import { describe, expect, it, vi } from 'vitest';

import {
  normalizeLinkPreviewSourceUrl,
  resolveLinkPreviewMetadata,
} from '@/lib/link-preview-metadata';

const htmlResponse = (html: string) =>
  new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    status: 200,
    statusText: 'OK',
  }) as Response & { url: string };

describe('link-preview-metadata', () => {
  it('normalizes www URLs to https URLs', () => {
    expect(normalizeLinkPreviewSourceUrl('www.example.com/post')?.href).toBe(
      'https://www.example.com/post',
    );
  });

  it('rejects non-http protocols and credentialed URLs', () => {
    expect(normalizeLinkPreviewSourceUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeLinkPreviewSourceUrl('https://user@example.com')).toBeNull();
  });

  it('rejects private and loopback resolved addresses before fetching', async () => {
    const fetchImpl = vi.fn();

    const result = await resolveLinkPreviewMetadata({
      fetchImpl,
      lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
      url: 'https://example.com/internal',
    });

    expect(result.error).toBe('blocked_url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('extracts Open Graph, Twitter Card, title, description, image and domain metadata', async () => {
    const response = htmlResponse(
      [
        '<!doctype html><html><head>',
        '<meta property="og:title" content="OG &amp; Title">',
        '<meta name="twitter:description" content="Twitter description">',
        '<meta property="og:image" content="/cover.png">',
        '</head><body></body></html>',
      ].join(''),
    );
    Object.defineProperty(response, 'url', {
      value: 'https://example.com/article',
    });

    const metadata = await resolveLinkPreviewMetadata({
      fetchImpl: vi.fn(async () => response),
      lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      title: 'Fallback title',
      url: 'https://example.com/article',
    });

    expect(metadata).toEqual({
      kind: 'link',
      url: 'https://example.com/article',
      title: 'OG & Title',
      domain: 'example.com',
      description: 'Twitter description',
      image: 'https://example.com/cover.png',
    });
  });

  it('falls back to stable metadata when the response is not HTML', async () => {
    const response = new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }) as Response & { url: string };
    Object.defineProperty(response, 'url', {
      value: 'https://example.com/api',
    });

    await expect(
      resolveLinkPreviewMetadata({
        fetchImpl: vi.fn(async () => response),
        lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
        title: 'API',
        url: 'https://example.com/api',
      }),
    ).resolves.toEqual({
      kind: 'link',
      url: 'https://example.com/api',
      title: 'API',
      domain: 'example.com',
    });
  });
});

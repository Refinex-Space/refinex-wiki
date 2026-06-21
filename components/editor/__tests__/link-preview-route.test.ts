import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/link-preview/route';
import { resolveLinkPreviewMetadata } from '@/lib/link-preview-metadata';

vi.mock('@/lib/link-preview-metadata', () => ({
  resolveLinkPreviewMetadata: vi.fn(),
}));

const resolveLinkPreviewMetadataMock = vi.mocked(resolveLinkPreviewMetadata);

describe('link-preview route', () => {
  beforeEach(() => {
    resolveLinkPreviewMetadataMock.mockReset();
  });

  it('returns resolved link preview metadata', async () => {
    resolveLinkPreviewMetadataMock.mockResolvedValueOnce({
      kind: 'link',
      url: 'https://example.com/',
      title: 'Example',
      domain: 'example.com',
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/link-preview?url=https%3A%2F%2Fexample.com&title=Example',
      ),
    );

    await expect(response.json()).resolves.toEqual({
      kind: 'link',
      url: 'https://example.com/',
      title: 'Example',
      domain: 'example.com',
    });
    expect(response.status).toBe(200);
    expect(resolveLinkPreviewMetadataMock).toHaveBeenCalledWith({
      title: 'Example',
      url: 'https://example.com',
    });
  });

  it('returns bad request for blocked preview URLs', async () => {
    resolveLinkPreviewMetadataMock.mockResolvedValueOnce({
      kind: 'link',
      url: 'https://localhost/',
      title: 'https://localhost/',
      error: 'blocked_url',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/link-preview?url=https%3A%2F%2Flocalhost'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      kind: 'link',
      url: 'https://localhost/',
      title: 'https://localhost/',
      error: 'blocked_url',
    });
  });
});

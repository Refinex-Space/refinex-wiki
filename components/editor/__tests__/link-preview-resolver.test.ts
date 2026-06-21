import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLinkPreview } from '@/components/editor/link-preview-resolver';
import { isTauriRuntime } from '@/components/workspace/workspace-api';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  isTauriRuntime: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const isTauriRuntimeMock = vi.mocked(isTauriRuntime);

describe('resolveLinkPreview', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isTauriRuntimeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('uses the Web API resolver outside Tauri', async () => {
    isTauriRuntimeMock.mockReturnValue(false);
    const fetchMock = vi.fn(async () =>
      Response.json({
        kind: 'link',
        url: 'https://example.com/',
        title: 'Example',
        domain: 'example.com',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resolveLinkPreview({ title: 'Fallback', url: 'https://example.com' }),
    ).resolves.toEqual({
      kind: 'link',
      url: 'https://example.com/',
      title: 'Example',
      domain: 'example.com',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/link-preview?url=https%3A%2F%2Fexample.com&title=Fallback',
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('uses the Tauri command inside the desktop runtime', async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValueOnce({
      kind: 'link',
      url: 'https://example.com/',
      title: 'Example',
      domain: 'example.com',
    });

    await expect(
      resolveLinkPreview({ title: 'Fallback', url: 'https://example.com' }),
    ).resolves.toEqual({
      kind: 'link',
      url: 'https://example.com/',
      title: 'Example',
      domain: 'example.com',
    });
    expect(invokeMock).toHaveBeenCalledWith('resolve_link_preview', {
      title: 'Fallback',
      url: 'https://example.com',
    });
  });

  it('rejects blocked resolver results', async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValueOnce({
      kind: 'link',
      url: 'https://localhost/',
      title: 'https://localhost/',
      error: 'blocked_url',
    });

    await expect(
      resolveLinkPreview({ title: '', url: 'https://localhost' }),
    ).rejects.toThrow('Failed to resolve link preview');
  });
});

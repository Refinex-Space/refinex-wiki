import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/workspace/workspace-api', () => ({
  uploadWorkspaceAsset: vi.fn(),
}));

import { uploadWorkspaceAsset } from '@/components/workspace/workspace-api';
import { LOCAL_ASSET_URL_PREFIX } from '@/components/workspace/workspace-local-assets';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';

import type { MarkoraAttachmentUploadContext } from '@refinex/markora/editor';

const stubContext: MarkoraAttachmentUploadContext = {
  kind: 'image',
  source: 'paste',
  documentText: '',
  selection: { from: 0, to: 0 },
};

describe('useWorkspaceAssetUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把 File 转 base64 调用 uploadWorkspaceAsset，返回 refinex-asset URL', async () => {
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      id: 'asset-id-1',
      url: '',
      name: 'pic.png',
      mediaType: 'image/png',
      size: 100,
      absolutePath: '/ws/assets/pic.png',
    });

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root'),
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', {
      type: 'image/png',
    });

    let out: Awaited<ReturnType<typeof result.current>> | undefined;

    await act(async () => {
      out = await result.current(file, stubContext);
    });

    expect(uploadWorkspaceAsset).toHaveBeenCalledWith('/ws/root', {
      fileName: 'pic.png',
      mediaType: 'image/png',
      base64Data: expect.any(String),
    });
    expect(out).toEqual({
      url: `${LOCAL_ASSET_URL_PREFIX}asset-id-1`,
      name: 'pic.png',
      mimeType: 'image/png',
    });
  });

  it('rootPath 为 null 时抛错', async () => {
    const { result } = renderHook(() => useWorkspaceAssetUploader(null));

    await act(async () => {
      await expect(
        result.current(new File([], 'x.png'), stubContext),
      ).rejects.toThrow();
    });
  });

  it('uploadWorkspaceAsset 抛错时透传', async () => {
    vi.mocked(uploadWorkspaceAsset).mockRejectedValue(new Error('磁盘满'));

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root'),
    );

    await act(async () => {
      await expect(
        result.current(
          new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }),
          stubContext,
        ),
      ).rejects.toThrow('磁盘满');
    });
  });
});

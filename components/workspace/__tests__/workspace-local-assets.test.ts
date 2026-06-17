import { describe, expect, it, vi } from 'vitest';

import { readWorkspaceAssetData } from '../workspace-api';
import {
  LOCAL_ASSET_URL_PREFIX,
  isLocalAssetUrl,
  localAssetUrlToImageDataUrl,
} from '../workspace-local-assets';

vi.mock('../workspace-api', () => ({
  readWorkspaceAssetData: vi.fn(),
}));

const readWorkspaceAssetDataMock = vi.mocked(readWorkspaceAssetData);

describe('workspace-local-assets', () => {
  describe('isLocalAssetUrl', () => {
    it('识别 refinex-asset:// 前缀', () => {
      expect(isLocalAssetUrl('refinex-asset://abc')).toBe(true);
      expect(isLocalAssetUrl('https://example.com/a.png')).toBe(false);
      expect(isLocalAssetUrl(null)).toBe(false);
      expect(isLocalAssetUrl(undefined)).toBe(false);
    });

    it('使用 LOCAL_ASSET_URL_PREFIX 常量', () => {
      expect(LOCAL_ASSET_URL_PREFIX).toBe('refinex-asset://');
    });
  });

  describe('localAssetUrlToImageDataUrl', () => {
    it('把图片资源转成 data URL', async () => {
      readWorkspaceAssetDataMock.mockResolvedValueOnce({
        id: 'asset-a',
        name: 'cover.png',
        mediaType: 'image/png',
        base64Data: 'cG5n',
      });

      await expect(
        localAssetUrlToImageDataUrl('refinex-asset://asset-a', '/repo'),
      ).resolves.toBe('data:image/png;base64,cG5n');
      expect(readWorkspaceAssetDataMock).toHaveBeenCalledWith('/repo', 'asset-a');
    });

    it('非图片资源返回 null', async () => {
      readWorkspaceAssetDataMock.mockResolvedValueOnce({
        id: 'asset-a',
        name: 'voice.mp3',
        mediaType: 'audio/mpeg',
        base64Data: 'YXVkaW8=',
      });

      await expect(
        localAssetUrlToImageDataUrl('refinex-asset://asset-a', '/repo'),
      ).resolves.toBeNull();
    });

    it('无效 asset id 返回 null', async () => {
      await expect(
        localAssetUrlToImageDataUrl('refinex-asset://', '/repo'),
      ).resolves.toBeNull();
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    readWorkspaceAssetDataMock.mockReset();
  });

  describe('isLocalAssetUrl', () => {
    it('只识别 madora-asset:// 前缀', () => {
      expect(isLocalAssetUrl('madora-asset://abc')).toBe(true);
      expect(isLocalAssetUrl('refinex-asset://abc')).toBe(false);
      expect(isLocalAssetUrl('https://example.com/a.png')).toBe(false);
      expect(isLocalAssetUrl(null)).toBe(false);
      expect(isLocalAssetUrl(undefined)).toBe(false);
    });

    it('使用 LOCAL_ASSET_URL_PREFIX 常量', () => {
      expect(LOCAL_ASSET_URL_PREFIX).toBe('madora-asset://');
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
        localAssetUrlToImageDataUrl('madora-asset://asset-a', '/repo'),
      ).resolves.toBe('data:image/png;base64,cG5n');
      expect(readWorkspaceAssetDataMock).toHaveBeenCalledWith('/repo', 'asset-a');
    });

    it('旧 refinex-asset:// 图片资源返回 null', async () => {
      await expect(
        localAssetUrlToImageDataUrl('refinex-asset://asset-a', '/repo'),
      ).resolves.toBeNull();
      expect(readWorkspaceAssetDataMock).not.toHaveBeenCalled();
    });

    it('非图片资源返回 null', async () => {
      readWorkspaceAssetDataMock.mockResolvedValueOnce({
        id: 'asset-a',
        name: 'voice.mp3',
        mediaType: 'audio/mpeg',
        base64Data: 'YXVkaW8=',
      });

      await expect(
        localAssetUrlToImageDataUrl('madora-asset://asset-a', '/repo'),
      ).resolves.toBeNull();
    });

    it('无效 asset id 返回 null', async () => {
      await expect(
        localAssetUrlToImageDataUrl('madora-asset://', '/repo'),
      ).resolves.toBeNull();
    });
  });
});

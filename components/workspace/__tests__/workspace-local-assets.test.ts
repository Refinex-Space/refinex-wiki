import { describe, expect, it, vi } from 'vitest';

import { readWorkspaceAssetData } from '../workspace-api';
import { inlineLocalImageAssets } from '../workspace-local-assets';

vi.mock('../workspace-api', () => ({
  readWorkspaceAssetData: vi.fn(),
}));

const readWorkspaceAssetDataMock = vi.mocked(readWorkspaceAssetData);

describe('workspace-local-assets', () => {
  it('inlines local workspace image assets as data URLs', async () => {
    readWorkspaceAssetDataMock.mockResolvedValueOnce({
      id: 'asset-a',
      name: 'cover.png',
      mediaType: 'image/png',
      base64Data: 'cG5n',
    });

    const value = [
      {
        type: 'img',
        url: 'refinex-asset://asset-a',
        children: [{ text: '' }],
      },
    ];

    await expect(inlineLocalImageAssets(value, '/repo')).resolves.toEqual([
      {
        type: 'img',
        url: 'data:image/png;base64,cG5n',
        children: [{ text: '' }],
      },
    ]);
    expect(value[0].url).toBe('refinex-asset://asset-a');
    expect(readWorkspaceAssetDataMock).toHaveBeenCalledWith('/repo', 'asset-a');
  });

  it('keeps non-image local assets unchanged', async () => {
    readWorkspaceAssetDataMock.mockResolvedValueOnce({
      id: 'asset-a',
      name: 'voice.mp3',
      mediaType: 'audio/mpeg',
      base64Data: 'YXVkaW8=',
    });

    await expect(
      inlineLocalImageAssets(
        [
          {
            type: 'audio',
            url: 'refinex-asset://asset-a',
            children: [{ text: '' }],
          },
        ],
        '/repo',
      ),
    ).resolves.toEqual([
      {
        type: 'audio',
        url: 'refinex-asset://asset-a',
        children: [{ text: '' }],
      },
    ]);
  });
});

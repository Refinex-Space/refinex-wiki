'use client';

import * as React from 'react';
import type { MardoraAttachmentUploader } from 'mardora/editor';

import { uploadWorkspaceAsset } from '@/components/workspace/workspace-api';
import { LOCAL_ASSET_URL_PREFIX } from '@/components/workspace/workspace-local-assets';

/**
 * 把 mardora 的附件 uploader 适配到 Tauri workspace 资产存储。
 * 上传成功后返回 madora-asset:// URL，写入 workspace 的 assets 目录。
 */
export function useWorkspaceAssetUploader(
  rootPath: string | null,
): MardoraAttachmentUploader {
  return React.useCallback(
    async (file, _context) => {
      if (!rootPath) {
        throw new Error('未打开工作区，无法上传附件。');
      }

      const base64Data = await fileToBase64(file);
      const uploaded = await uploadWorkspaceAsset(rootPath, {
        fileName: file.name,
        mediaType: file.type || 'application/octet-stream',
        base64Data,
      });

      return {
        url: `${LOCAL_ASSET_URL_PREFIX}${uploaded.id}`,
        name: uploaded.name,
        mimeType: uploaded.mediaType,
      };
    },
    [rootPath],
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('无法读取文件内容。'));
        return;
      }

      const commaIndex = result.indexOf(',');

      if (commaIndex === -1) {
        reject(new Error('文件 base64 编码失败。'));
        return;
      }

      resolve(result.slice(commaIndex + 1));
    };

    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.readAsDataURL(file);
  });
}

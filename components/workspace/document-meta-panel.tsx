'use client';

import * as React from 'react';
import {
  Archive,
  Clock,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  Hash,
  Image as ImageIcon,
  Type,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import {
  readWorkspaceAssetData,
  resolveWorkspaceAsset,
  selectWorkspaceAssetDownloadPath,
  writeExportFile,
} from './workspace-api';
import {
  countMarkdownCharacters,
  extractResourceReferencesFromMarkdown,
  type DocumentResourceReference,
} from './workspace-document-insights';
import type {
  ResolvedWorkspaceAsset,
  WorkspaceNode,
} from './workspace-types';
import type { DocumentPanelData } from './ai-side-panel';

type MetaTab = 'meta' | 'resources';

interface DocumentMetaPanelProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  workspaceRootPath: string | null;
}

export function DocumentMetaPanel({
  currentDocument,
  documentPanelData,
  workspaceRootPath,
}: DocumentMetaPanelProps) {
  const [activeTab, setActiveTab] = React.useState<MetaTab>('meta');
  const resources = React.useMemo(
    () => extractResourceReferencesFromMarkdown(documentPanelData?.markdown),
    [documentPanelData?.markdown],
  );
  const characterCount = React.useMemo(
    () => countMarkdownCharacters(documentPanelData?.markdown),
    [documentPanelData?.markdown],
  );

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => setActiveTab('meta'), 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentDocument?.absolutePath]);

  return (
    <>
      <header className="flex h-10 items-center border-b px-3">
        <span className="truncate text-sm font-medium">文档信息</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-3 py-2">
          <div
            className="grid rounded-full bg-muted p-0.5 text-xs"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <MetaTabButton
              active={activeTab === 'meta'}
              label="元信息"
              onClick={() => setActiveTab('meta')}
            />
            <MetaTabButton
              active={activeTab === 'resources'}
              label={`资源 ${resources.length}`}
              onClick={() => setActiveTab('resources')}
            />
          </div>
        </div>

        <div className="git-panel-scroll min-h-0 flex-1 overflow-auto p-3">
          {!currentDocument ? (
            <DocumentMetaEmptyState text="选择文档后查看元信息和资源。" />
          ) : activeTab === 'meta' ? (
            <DocumentMetaDetails
              characterCount={characterCount}
              currentDocument={currentDocument}
              documentPanelData={documentPanelData}
              resourceCount={resources.length}
            />
          ) : (
            <DocumentResourceList
              references={resources}
              workspaceRootPath={workspaceRootPath}
            />
          )}
        </div>
      </div>
    </>
  );
}

function MetaTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'h-7 rounded-full px-3 text-muted-foreground transition-colors',
        active && 'bg-background text-foreground shadow-sm',
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function DocumentMetaDetails({
  characterCount,
  currentDocument,
  documentPanelData,
  resourceCount,
}: {
  characterCount: number;
  currentDocument: WorkspaceNode;
  documentPanelData: DocumentPanelData | null;
  resourceCount: number;
}) {
  const title =
    documentPanelData?.metadata.title ||
    currentDocument.title ||
    '未命名文档';

  return (
    <div className="rounded-xl bg-muted/25 px-4 py-3">
      <div className="pb-3">
        <p className="text-[11px] text-muted-foreground">标题</p>
        <p className="mt-1 break-words text-base font-medium leading-6">
          {title}
        </p>
      </div>

      <div className="divide-y divide-border/60">
        <MetaRow
          icon={<Clock size={14} />}
          label="创建时间"
          value={formatDocumentDate(documentPanelData?.metadata.createdAt)}
        />
        <MetaRow
          icon={<Clock size={14} />}
          label="修改时间"
          value={formatDocumentDate(documentPanelData?.metadata.updatedAt)}
        />
        <MetaRow
          icon={<Type size={14} />}
          label="字数"
          value={`${characterCount.toLocaleString('zh-CN')} 字`}
        />
        <MetaRow
          icon={<Hash size={14} />}
          label="资源数"
          value={`${resourceCount.toLocaleString('zh-CN')} 个`}
        />
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/80">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[58%] truncate text-right text-xs font-medium">
        {value}
      </span>
    </div>
  );
}

function DocumentResourceList({
  references,
  workspaceRootPath,
}: {
  references: DocumentResourceReference[];
  workspaceRootPath: string | null;
}) {
  const [assets, setAssets] = React.useState<
    Record<string, ResolvedWorkspaceAsset>
  >({});
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!workspaceRootPath || references.length === 0) {
      const timeoutId = window.setTimeout(() => {
        setAssets({});
        setPreviews({});
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let cancelled = false;
    const rootPath = workspaceRootPath;

    async function loadAssets() {
      const nextAssets: Record<string, ResolvedWorkspaceAsset> = {};
      const nextPreviews: Record<string, string> = {};

      for (const reference of references) {
        try {
          const asset = await resolveWorkspaceAsset(rootPath, reference.id);
          nextAssets[reference.id] = asset;

          if (asset.mediaType.startsWith('image/')) {
            const data = await readWorkspaceAssetData(
              rootPath,
              reference.id,
            );
            nextPreviews[reference.id] =
              `data:${data.mediaType};base64,${data.base64Data}`;
          }
        } catch {
          // 资源索引缺失时仍保留引用 ID，避免列表消失。
        }
      }

      if (!cancelled) {
        setAssets(nextAssets);
        setPreviews(nextPreviews);
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [references, workspaceRootPath]);

  const handleDownload = React.useCallback(
    async (reference: DocumentResourceReference) => {
      if (!workspaceRootPath) {
        setError('打开工作区后才能下载资源。');
        return;
      }

      setError(null);
      setDownloadingId(reference.id);

      try {
        const data = await readWorkspaceAssetData(workspaceRootPath, reference.id);
        const targetPath = await selectWorkspaceAssetDownloadPath(
          data.name,
          data.mediaType,
        );

        if (targetPath) {
          await writeExportFile(targetPath, data.base64Data);
        }
      } catch (downloadError) {
        setError(formatUnknownError(downloadError));
      } finally {
        setDownloadingId(null);
      }
    },
    [workspaceRootPath],
  );

  if (references.length === 0) {
    return <DocumentMetaEmptyState text="当前文档没有引用资源。" />;
  }

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {references.map((reference) => (
        <DocumentResourceItem
          asset={assets[reference.id]}
          downloading={downloadingId === reference.id}
          key={reference.id}
          previewUrl={previews[reference.id]}
          reference={reference}
          onDownload={() => void handleDownload(reference)}
        />
      ))}
    </div>
  );
}

function DocumentResourceItem({
  asset,
  downloading,
  previewUrl,
  reference,
  onDownload,
}: {
  asset?: ResolvedWorkspaceAsset;
  downloading: boolean;
  previewUrl?: string;
  reference: DocumentResourceReference;
  onDownload: () => void;
}) {
  const name = asset?.name ?? reference.id;
  const mediaType = asset?.mediaType ?? getResourceTypeFromNode(reference.nodeType);

  return (
    <div className="group flex gap-3 rounded-lg border bg-background p-2 transition-colors hover:border-[#3574f0]/40 hover:bg-muted/30">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={name} className="h-full w-full object-cover" src={previewUrl} />
        ) : (
          getResourceIcon(mediaType)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {getResourceLabel(mediaType)}
              {asset ? ` · ${formatBytes(asset.size)}` : ''}
            </p>
          </div>
          <button
            aria-label={`下载资源 ${name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={downloading}
            title="下载"
            type="button"
            onClick={onDownload}
          >
            <Download size={15} />
          </button>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground/80">
          {reference.url}
        </p>
      </div>
    </div>
  );
}

function DocumentMetaEmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function getResourceIcon(mediaType: string) {
  if (mediaType.startsWith('image/')) {
    return <FileImage size={20} />;
  }

  if (mediaType.startsWith('audio/')) {
    return <FileAudio size={20} />;
  }

  if (
    mediaType === 'application/zip' ||
    mediaType === 'application/x-zip-compressed'
  ) {
    return <Archive size={20} />;
  }

  if (mediaType.startsWith('text/') || mediaType.includes('document')) {
    return <FileText size={20} />;
  }

  if (mediaType.startsWith('image')) {
    return <ImageIcon size={20} />;
  }

  return <File size={20} />;
}

function getResourceLabel(mediaType: string) {
  if (mediaType.startsWith('image/')) {
    return '图片';
  }

  if (mediaType.startsWith('audio/')) {
    return '录音';
  }

  if (mediaType.startsWith('video/')) {
    return '视频';
  }

  if (
    mediaType === 'application/zip' ||
    mediaType === 'application/x-zip-compressed'
  ) {
    return '压缩包';
  }

  return '附件';
}

function getResourceTypeFromNode(nodeType: string) {
  switch (nodeType) {
    case 'img':
    case 'image':
      return 'image/*';
    case 'audio':
      return 'audio/*';
    case 'video':
      return 'video/*';
    case 'file':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDocumentDate(value: string | undefined) {
  if (!value) {
    return '未读取';
  }

  const date = parseDocumentDate(value);

  if (Number.isNaN(date.getTime())) {
    return '未读取';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function parseDocumentDate(value: string) {
  const normalized = value.trim();
  const legacyEpochMillis = normalized.match(/^(\d+)Z?$/u);

  if (legacyEpochMillis) {
    return new Date(Number(legacyEpochMillis[1]));
  }

  return new Date(normalized);
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '资源下载失败。';
}

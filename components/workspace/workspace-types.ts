import type { Value } from 'platejs';

export type WorkspaceNodeKind = 'directory' | 'document';

export interface WorkspaceNode {
  id: string;
  name: string;
  kind: WorkspaceNodeKind;
  relativePath: string;
  absolutePath: string;
  title?: string;
  children?: WorkspaceNode[];
}

export interface WorkspaceSnapshot {
  rootPath: string;
  rootName: string;
  nodes: WorkspaceNode[];
}

export interface WorkspaceHistoryItem {
  rootPath: string;
  rootName: string;
  lastOpenedAt: number;
}

export interface WorkspaceSearchResult {
  id: string;
  name: string;
  title: string;
  relativePath: string;
  absolutePath: string;
}

export interface WorkspaceLoadError {
  message: string;
  recoverable: boolean;
}

export interface WorkspaceMetadata {
  schemaVersion: 1;
  recentDocumentPath: string | null;
  expandedPaths: string[];
  sortOrder: Record<string, unknown>;
}

export type PageWidthMode = 'standard' | 'wide';

export interface AppearanceSettings {
  pageWidthMode: PageWidthMode;
}

export interface AppSettings {
  schemaVersion: 1;
  storage: {
    defaultProvider: 'local';
  };
  appearance: AppearanceSettings;
}

export interface UploadWorkspaceAssetInput {
  fileName: string;
  mediaType: string;
  base64Data: string;
}

export interface UploadedWorkspaceAsset {
  id: string;
  url: string;
  name: string;
  mediaType: string;
  size: number;
  absolutePath: string;
}

export interface ResolvedWorkspaceAsset {
  id: string;
  absolutePath: string;
  mediaType: string;
  name: string;
  size: number;
}

export interface WorkspaceAssetData {
  id: string;
  mediaType: string;
  name: string;
  base64Data: string;
}

export interface PlateDocumentEnvelope {
  schemaVersion: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  content: Value;
}

export interface PlateDocumentContent {
  path: string;
  envelope: PlateDocumentEnvelope;
  modifiedAt: number;
}

export interface DocumentContentMeta {
  path: string;
  modifiedAt: number;
}

export interface DeletedWorkspaceNode {
  path: string;
}

export type WorkspaceMovePosition = 'before' | 'after' | 'inside';

export interface WorkspaceMoveRequest {
  nodePath: string;
  targetPath: string;
  position: WorkspaceMovePosition;
}

export interface CreatedPlateDocument {
  node: WorkspaceNode;
  envelope: PlateDocumentEnvelope;
}

export interface MarkdownSourceFile {
  path: string;
  fileName: string;
  content: string;
}

export type WorkspaceImportFormat = 'html' | 'markdown' | 'word';

export type WorkspaceExportFormat =
  | 'html'
  | 'pdf'
  | 'image'
  | 'markdown'
  | 'word';

export interface ImportSourceFile {
  path: string;
  fileName: string;
  content?: string | null;
  base64Data?: string | null;
}

export interface ExportArchiveEntry {
  path: string;
  base64Data: string;
}

export interface ImportedPlateDocumentInput {
  title: string;
  sourceFileName: string;
  content: Value;
}

export interface ImportedPlateDocumentResult {
  created: CreatedPlateDocument[];
  failed: Array<{
    sourceFileName: string;
    message: string;
  }>;
}

export type DocumentLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type DocumentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

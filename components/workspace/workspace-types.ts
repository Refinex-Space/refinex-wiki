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

export interface CreatedPlateDocument {
  node: WorkspaceNode;
  envelope: PlateDocumentEnvelope;
}

export interface MarkdownSourceFile {
  path: string;
  fileName: string;
  content: string;
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

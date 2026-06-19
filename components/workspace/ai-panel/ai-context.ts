import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import type { WorkspaceNode } from '@/components/workspace/workspace-types';

import type { AiContextPack, AiIntent } from './ai-types';

interface BuildAiContextPackInput {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  intent: AiIntent;
  workspaceRootPath: string;
}

export function buildAiContextPack({
  currentDocument,
  documentPanelData,
  intent,
  workspaceRootPath,
}: BuildAiContextPackInput): AiContextPack {
  const context: AiContextPack = {
    intent,
    workspaceRootPath,
  };

  if (!currentDocument || !documentPanelData) {
    return context;
  }

  const title =
    documentPanelData.metadata.title ||
    currentDocument.title ||
    currentDocument.name;

  return {
    ...context,
    document: {
      contentHash: createStableContentHash(documentPanelData.markdown),
      dirty: false,
      markdown: documentPanelData.markdown,
      modifiedAt: null,
      path: currentDocument.absolutePath,
      title,
    },
  };
}

export function createStableContentHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

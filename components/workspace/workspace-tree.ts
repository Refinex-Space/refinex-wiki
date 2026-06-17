import type { WorkspaceNode, WorkspaceSearchResult } from './workspace-types';

export function flattenDocuments(nodes: WorkspaceNode[]): WorkspaceSearchResult[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'document') {
      return [
        {
          id: node.id,
          name: node.name,
          title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
          relativePath: node.relativePath,
          absolutePath: node.absolutePath,
        },
      ];
    }

    return flattenDocuments(node.children ?? []);
  });
}

export function searchWorkspace(nodes: WorkspaceNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return flattenDocuments(nodes).filter((node) => {
    const haystack =
      `${node.name}\n${node.relativePath}\n${node.title}`.toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function filterWorkspaceNodes(
  nodes: WorkspaceNode[],
  query: string,
): WorkspaceNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes
    .map((node) => {
      if (node.kind === 'document') {
        const haystack =
          `${node.name}\n${node.relativePath}\n${node.title ?? ''}`.toLowerCase();

        return haystack.includes(normalizedQuery) ? node : null;
      }

      const children = filterWorkspaceNodes(
        node.children ?? [],
        normalizedQuery,
      );

      return children.length > 0 ? { ...node, children } : null;
    })
    .filter((node): node is WorkspaceNode => node !== null);
}

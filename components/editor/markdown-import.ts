import { MarkdownPlugin } from '@platejs/markdown';
import type { Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from './editor-kit';

export function markdownToPlateValue(markdown: string): Value {
  const editor = createPlateEditor({
    plugins: EditorKit,
  });
  const value = editor.getApi(MarkdownPlugin).markdown.deserialize(markdown);

  return value.length > 0 ? value : [{ children: [{ text: '' }], type: 'p' }];
}

export function extractMarkdownImportTitle(markdown: string, fileName: string) {
  const heading = markdown
    .split(/\r?\n/, 80)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# ') && line.length > 2);

  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }

  return fileName.replace(/\.(md|mdx)$/i, '');
}

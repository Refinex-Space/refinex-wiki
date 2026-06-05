'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { importDocx } from '@platejs/docx-io';
import { MarkdownPlugin } from '@platejs/markdown';
import { ArrowUpToLineIcon } from 'lucide-react';
import { getEditorDOMFromHtmlString } from 'platejs/static';
import { useEditorRef } from 'platejs/react';
import { useFilePicker } from 'use-file-picker';
import type { SelectedFilesOrErrors } from 'use-file-picker/types';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ToolbarButton } from './toolbar';

type ImportType = 'html' | 'markdown';
type FilePickerSelection = SelectedFilesOrErrors<undefined>;

export function ImportToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const getFileNodes = (text: string, type: ImportType) => {
    if (type === 'html') {
      const editorNode = getEditorDOMFromHtmlString(text);
      const nodes = editor.api.html.deserialize({
        element: editorNode,
      });

      return nodes;
    }

    if (type === 'markdown') {
      return editor.getApi(MarkdownPlugin).markdown.deserialize(text);
    }

    return [];
  };

  const { openFilePicker: openMdFilePicker } = useFilePicker({
    accept: ['.md', '.mdx'],
    multiple: false,
    readFilesContent: false,
    onFilesSelected: async (selection: FilePickerSelection) => {
      const plainFiles = selection.plainFiles;

      if (!plainFiles?.length) {
        return;
      }

      const text = await plainFiles[0].text();

      const nodes = getFileNodes(text, 'markdown');

      editor.tf.insertNodes(nodes);
    },
  });

  const { openFilePicker: openHtmlFilePicker } = useFilePicker({
    accept: ['text/html'],
    multiple: false,
    readFilesContent: false,
    onFilesSelected: async (selection: FilePickerSelection) => {
      const plainFiles = selection.plainFiles;

      if (!plainFiles?.length) {
        return;
      }

      const text = await plainFiles[0].text();

      const nodes = getFileNodes(text, 'html');

      editor.tf.insertNodes(nodes);
    },
  });

  const { openFilePicker: openDocxFilePicker } = useFilePicker({
    accept: ['.docx'],
    multiple: false,
    readFilesContent: false,
    onFilesSelected: async (selection: FilePickerSelection) => {
      const plainFiles = selection.plainFiles;

      if (!plainFiles?.length) {
        return;
      }

      const arrayBuffer = await plainFiles[0].arrayBuffer();
      const result = await importDocx(editor, arrayBuffer);

      editor.tf.insertNodes(result.nodes as typeof editor.children);
    },
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Import" isDropdown>
          <ArrowUpToLineIcon className="size-4" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              openHtmlFilePicker();
            }}
          >
            Import from HTML
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              openMdFilePicker();
            }}
          >
            Import from Markdown
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              openDocxFilePicker();
            }}
          >
            Import from Word
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

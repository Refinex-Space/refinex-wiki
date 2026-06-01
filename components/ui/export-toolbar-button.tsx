'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { ArrowDownToLineIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { useWorkspaceAssetContext } from '@/components/editor/workspace-asset-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  blobToBase64,
  exportEditorElementAsBlob,
  getExportExtension,
} from '@/components/workspace/workspace-document-transfer';
import {
  isTauriRuntime,
  selectExportFilePath,
  writeExportFile,
} from '@/components/workspace/workspace-api';
import type { WorkspaceExportFormat } from '@/components/workspace/workspace-types';

import { ToolbarButton } from './toolbar';

const EXPORT_MENU_ITEMS: Array<{
  format: WorkspaceExportFormat;
  label: string;
}> = [
  { format: 'html', label: 'Export as HTML' },
  { format: 'pdf', label: 'Export as PDF' },
  { format: 'image', label: 'Export as Image' },
  { format: 'markdown', label: 'Export as Markdown' },
  { format: 'word', label: 'Export as Word' },
];

export function ExportToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const { rootPath } = useWorkspaceAssetContext();
  const [open, setOpen] = React.useState(false);

  const exportDocument = React.useCallback(
    async (format: WorkspaceExportFormat) => {
      const editorElement = editor.api.toDOMNode(editor);

      if (!editorElement) {
        return;
      }

      const blob = await exportEditorElementAsBlob(
        editorElement,
        editor.children,
        format,
        { workspaceRootPath: rootPath },
      );
      const defaultPath = `plate.${getExportExtension(format)}`;

      if (!isTauriRuntime()) {
        downloadBlob(blob, defaultPath);
        return;
      }

      const targetPath = await selectExportFilePath(format, defaultPath);

      if (!targetPath) {
        return;
      }

      await writeExportFile(targetPath, await blobToBase64(blob));
    },
    [editor, rootPath],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Export" isDropdown>
          <ArrowDownToLineIcon className="size-4" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          {EXPORT_MENU_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.format}
              onSelect={() => {
                void exportDocument(item.format);
              }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

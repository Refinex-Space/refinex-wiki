'use client';

import { MarkdownPlugin } from '@platejs/markdown';
import type { SlatePlugin, Value } from 'platejs';
import { createSlateEditor } from 'platejs';
import { getEditorDOMFromHtmlString, serializeHtml } from 'platejs/static';

import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { DocxExportKit } from '@/components/editor/plugins/docx-export-kit';
import { extractMarkdownImportTitle } from '@/components/editor/markdown-import';
import { EditorStatic } from '@/components/ui/editor-static';

import {
  inlineLocalImageAssets,
  isLocalAssetUrl,
  localAssetUrlToImageDataUrl,
} from './workspace-local-assets';
import type {
  ExportArchiveEntry,
  ImportedPlateDocumentInput,
  ImportSourceFile,
  PlateDocumentEnvelope,
  WorkspaceExportFormat,
  WorkspaceImportFormat,
  WorkspaceNode,
} from './workspace-types';

const HTML_EXPORT_SITE_URL = 'https://platejs.org';

const EXPORT_EXTENSIONS: Record<WorkspaceExportFormat, string> = {
  html: 'html',
  image: 'png',
  markdown: 'md',
  pdf: 'pdf',
  word: 'docx',
};

const EXPORT_MIME_TYPES: Record<WorkspaceExportFormat, string> = {
  html: 'text/html;charset=utf-8',
  image: 'image/png',
  markdown: 'text/markdown;charset=utf-8',
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

interface ExportOptions {
  workspaceRootPath?: string | null;
}

export async function exportPlateValueAsBlob(
  value: Value,
  format: WorkspaceExportFormat,
  options: ExportOptions = {},
): Promise<Blob> {
  const exportValue = await inlineLocalImageAssets(
    value,
    options.workspaceRootPath,
  );

  if (format === 'html') {
    return new Blob([await serializePlateValueToHtmlDocument(exportValue)], {
      type: EXPORT_MIME_TYPES.html,
    });
  }

  if (format === 'markdown') {
    return new Blob([serializePlateValueToMarkdown(exportValue)], {
      type: EXPORT_MIME_TYPES.markdown,
    });
  }

  if (format === 'word') {
    const { exportToDocx } = await import('@platejs/docx-io');

    return exportToDocx(exportValue, {
      editorPlugins: [...BaseEditorKit, ...DocxExportKit] as SlatePlugin[],
    });
  }

  const canvas = await renderPlateValueToCanvas(exportValue);

  if (format === 'image') {
    return canvasToBlob(canvas, 'image/png');
  }

  const PDFLib = await import('pdf-lib');
  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([canvas.width, canvas.height]);
  const imageEmbed = await pdfDoc.embedPng(canvas.toDataURL('image/png'));
  const { height, width } = imageEmbed.scale(1);
  page.drawImage(imageEmbed, { height, width, x: 0, y: 0 });

  return pdfDoc.save().then(
    (bytes) =>
      new Blob([bytesToArrayBuffer(bytes)], {
        type: EXPORT_MIME_TYPES.pdf,
      }),
  );
}

export async function exportEditorElementAsBlob(
  editorElement: HTMLElement,
  value: Value,
  format: WorkspaceExportFormat,
  options: ExportOptions = {},
) {
  if (format !== 'image' && format !== 'pdf') {
    return exportPlateValueAsBlob(value, format, options);
  }

  const canvas = await elementToCanvasWithLocalImages(
    editorElement,
    options.workspaceRootPath,
  );

  if (format === 'image') {
    return canvasToBlob(canvas, 'image/png');
  }

  const PDFLib = await import('pdf-lib');
  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([canvas.width, canvas.height]);
  const imageEmbed = await pdfDoc.embedPng(canvas.toDataURL('image/png'));
  const { height, width } = imageEmbed.scale(1);
  page.drawImage(imageEmbed, { height, width, x: 0, y: 0 });
  const bytes = await pdfDoc.save();

  return new Blob([bytesToArrayBuffer(bytes)], { type: EXPORT_MIME_TYPES.pdf });
}

export async function buildExportArchiveEntries({
  format,
  node,
  readDocument,
  workspaceRootPath,
}: {
  format: WorkspaceExportFormat;
  node: WorkspaceNode;
  readDocument: (node: WorkspaceNode) => Promise<PlateDocumentEnvelope>;
  workspaceRootPath?: string | null;
}) {
  const documents = collectDocumentNodes(node);
  const usedPaths = new Set<string>();
  const entries: ExportArchiveEntry[] = [];

  for (const item of documents) {
    const envelope = await readDocument(item.node);
    const blob = await exportPlateValueAsBlob(envelope.content, format, {
      workspaceRootPath,
    });
    const path = createUniqueArchiveEntryPath(
      item.pathSegments,
      getDocumentBaseName(item.node, envelope),
      getExportExtension(format),
      usedPaths,
    );

    entries.push({
      path,
      base64Data: await blobToBase64(blob),
    });
  }

  return entries;
}

export async function convertImportSourcesToPlateDocuments(
  sources: ImportSourceFile[],
  format: WorkspaceImportFormat,
): Promise<ImportedPlateDocumentInput[]> {
  const editor = createSlateEditor({ plugins: BaseEditorKit });
  const documents: ImportedPlateDocumentInput[] = [];

  for (const source of sources) {
    const title = getImportTitle(source);
    let content: Value = [];

    if (format === 'html') {
      const html = source.content ?? '';
      const editorNode = getEditorDOMFromHtmlString(html);
      content = editor.api.html.deserialize({ element: editorNode }) as Value;
    }

    if (format === 'markdown') {
      const markdown = source.content ?? '';
      content = editor.getApi(MarkdownPlugin).markdown.deserialize(markdown) as Value;
    }

    if (format === 'word') {
      const { importDocx } = await import('@platejs/docx-io');
      const base64Data = source.base64Data ?? '';
      const result = await importDocx(editor, base64ToArrayBuffer(base64Data));
      content = result.nodes as Value;
    }

    documents.push({
      title:
        format === 'markdown' && source.content
          ? extractMarkdownImportTitle(source.content, source.fileName)
          : title,
      sourceFileName: source.fileName,
      content,
    });
  }

  return documents;
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

export function getExportExtension(format: WorkspaceExportFormat) {
  return EXPORT_EXTENSIONS[format];
}

export function getNodeExportBaseName(
  node: WorkspaceNode,
  envelope?: PlateDocumentEnvelope,
) {
  if (node.kind === 'directory') {
    return sanitizeFileName(node.name);
  }

  return sanitizeFileName(getDocumentBaseName(node, envelope));
}

export function createExportFileName(
  node: WorkspaceNode,
  format: WorkspaceExportFormat,
  envelope?: PlateDocumentEnvelope,
) {
  return `${getNodeExportBaseName(node, envelope)}.${getExportExtension(format)}`;
}

export function createArchiveFileName(node: WorkspaceNode) {
  return `${getNodeExportBaseName(node)}.zip`;
}

function collectDocumentNodes(node: WorkspaceNode) {
  const rootSegments = node.kind === 'directory' ? [sanitizeFileName(node.name)] : [];
  const documents: Array<{ node: WorkspaceNode; pathSegments: string[] }> = [];

  function visit(current: WorkspaceNode, pathSegments: string[]) {
    if (current.kind === 'document') {
      documents.push({ node: current, pathSegments });
      return;
    }

    for (const child of current.children ?? []) {
      visit(
        child,
        child.kind === 'directory'
          ? [...pathSegments, sanitizeFileName(child.name)]
          : pathSegments,
      );
    }
  }

  visit(node, rootSegments);

  return documents;
}

function createUniqueArchiveEntryPath(
  pathSegments: string[],
  baseName: string,
  extension: string,
  usedPaths: Set<string>,
) {
  const safeBaseName = sanitizeFileName(baseName);
  let index = 0;

  while (true) {
    const suffix = index === 0 ? '' : `-${index}`;
    const path = [...pathSegments, `${safeBaseName}${suffix}.${extension}`].join('/');

    if (!usedPaths.has(path)) {
      usedPaths.add(path);
      return path;
    }

    index += 1;
  }
}

function getDocumentBaseName(
  node: WorkspaceNode,
  envelope?: PlateDocumentEnvelope,
) {
  return (
    envelope?.title ||
    node.title ||
    node.name.replace(/\.plate\.json$/i, '') ||
    '未命名文档'
  );
}

function getImportTitle(source: ImportSourceFile) {
  return sanitizeFileName(source.fileName.replace(/\.[^.]+$/u, '')) || '未命名文档';
}

function serializePlateValueToMarkdown(value: Value) {
  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    value,
  });

  return editor.getApi(MarkdownPlugin).markdown.serialize();
}

async function serializePlateValueToHtmlDocument(value: Value) {
  const editorHtml = await serializePlateValueToHtmlFragment(value);
  const tailwindCss = `<link rel="stylesheet" href="${HTML_EXPORT_SITE_URL}/tailwind.css">`;
  const katexCss =
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.18/dist/katex.css" integrity="sha384-9PvLvaiSKCPkFKB1ZsEoTjgnJn+O3KvEwtsz37/XrkYft3DTk2gHdYvd9oWgW3tV" crossorigin="anonymous">';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=swap"
      rel="stylesheet"
    />
    ${tailwindCss}
    ${katexCss}
    <style>
      :root {
        --font-sans: 'Inter', 'Inter Fallback';
        --font-mono: 'JetBrains Mono', 'JetBrains Mono Fallback';
      }
    </style>
  </head>
  <body>
    ${editorHtml}
  </body>
</html>`;
}

async function serializePlateValueToHtmlFragment(value: Value) {
  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    value,
  });

  return serializeHtml(editor, {
    editorComponent: EditorStatic,
    props: { style: { padding: '0 calc(50% - 350px)', paddingBottom: '' } },
  });
}

async function renderPlateValueToCanvas(value: Value) {
  const html = await serializePlateValueToHtmlFragment(value);
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '900px';
  host.style.background = '#ffffff';
  host.innerHTML = html;
  document.body.append(host);

  try {
    await waitForElementImages(host);
    return await elementToCanvas(host);
  } finally {
    host.remove();
  }
}

async function elementToCanvasWithLocalImages(
  element: HTMLElement,
  workspaceRootPath?: string | null,
) {
  const restore = workspaceRootPath
    ? await inlineElementLocalImages(element, workspaceRootPath)
    : () => {};

  try {
    await waitForElementImages(element);
    return await elementToCanvas(element);
  } finally {
    restore();
  }
}

async function elementToCanvas(element: HTMLElement) {
  const { default: html2canvas } = await import('html2canvas-pro');

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    onclone: (clonedDocument: Document) => {
      const editorElement = clonedDocument.querySelector('[contenteditable="true"]');

      if (editorElement) {
        Array.from(editorElement.querySelectorAll('*')).forEach((child) => {
          const existingStyle = child.getAttribute('style') || '';
          child.setAttribute(
            'style',
            `${existingStyle}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important`,
          );
        });
      }
    },
  });

  return canvas;
}

async function inlineElementLocalImages(
  element: HTMLElement,
  workspaceRootPath: string,
) {
  const updates: Array<{ image: HTMLImageElement; src: string | null }> = [];
  const images = Array.from(element.querySelectorAll('img'));

  for (const image of images) {
    const src = image.getAttribute('src');

    if (!src || !isLocalAssetUrl(src)) {
      continue;
    }

    const dataUrl = await localAssetUrlToImageDataUrl(src, workspaceRootPath);

    if (!dataUrl) {
      continue;
    }

    updates.push({ image, src });
    image.setAttribute('src', dataUrl);
  }

  if (updates.length > 0) {
    await waitForElementImages(element);
  }

  return () => {
    for (const update of updates) {
      if (update.src === null) {
        update.image.removeAttribute('src');
      } else {
        update.image.setAttribute('src', update.src);
      }
    }
  };
}

async function waitForElementImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll('img')).filter(
    (image) => image.currentSrc || image.src,
  );

  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return undefined;
      }

      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }),
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('无法生成导出图片'));
    }, type);
  });
}

function base64ToArrayBuffer(base64Data: string) {
  const binary = window.atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer as ArrayBuffer;
}

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:"*?<>|]/gu, '-')
      .replace(/^\.+|\.+$/gu, '')
      .trim() || '未命名文档'
  );
}

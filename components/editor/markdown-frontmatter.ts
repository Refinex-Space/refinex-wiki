/**
 * 纯字符串 Markdown 文档工具：frontmatter 解析/序列化、H1 提取、title 规范化。
 * 不依赖 React、编辑器或 Plate，可被 workspace 层与编辑器层共享复用。
 */

export interface MarkdownDocumentMetadata {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  refinexDialect: number;
}

export interface ParsedMarkdownDocument {
  body: string;
  metadata: MarkdownDocumentMetadata;
}

export interface ParsedFrontmatter {
  metadata: Record<string, string>;
  body: string;
}

export interface SerializeFrontmatterInput {
  body: string;
  metadata: Record<string, string | number | null | undefined>;
}

const FRONTMATTER_DELIMITER = '---';

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    return { metadata: {}, body: raw.trimStart() };
  }

  const endIndex = raw.indexOf('\n---', FRONTMATTER_DELIMITER.length);

  if (endIndex === -1) {
    return { metadata: {}, body: raw.trimStart() };
  }

  const rawFrontmatter = raw.slice(
    FRONTMATTER_DELIMITER.length + 1,
    endIndex,
  );
  const body = raw
    .slice(endIndex + FRONTMATTER_DELIMITER.length + 1)
    .replace(/^\r?\n/, '');
  const frontmatter = parseFrontmatterBlock(rawFrontmatter);

  return { metadata: frontmatter, body: body.trimStart() };
}

export function serializeFrontmatter(
  input: SerializeFrontmatterInput,
): string {
  const entries = Object.entries(input.metadata).filter(
    ([, value]) => value !== '' && value !== null && value !== undefined,
  );

  if (entries.length === 0) {
    return `${input.body.trimEnd()}\n`;
  }

  const lines = [
    FRONTMATTER_DELIMITER,
    ...entries.map(([key, value]) => `${key}: ${value}`),
    FRONTMATTER_DELIMITER,
  ];
  const body = input.body.trimEnd();

  return `${lines.join('\n')}\n\n${body}\n`;
}

export function parseMarkdownMetadata(
  markdown: string,
  fileName: string,
): ParsedMarkdownDocument {
  const { body, metadata: frontmatter } = parseFrontmatter(markdown);
  const title =
    readString(frontmatter.title) ??
    extractH1FromMarkdown(body) ??
    fileStem(fileName);

  return {
    body,
    metadata: {
      createdAt: readString(frontmatter.createdAt),
      refinexDialect: readNumber(frontmatter.refinexDialect) ?? 1,
      title,
      updatedAt: readString(frontmatter.updatedAt),
    },
  };
}

/**
 * 从 Markdown 正文提取第一个 ATX 风格 H1 文本，跳过代码块。
 * Setext（下划线）风格标题不识别。
 */
export function extractH1FromMarkdown(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = /^#\s+(.+?)\s*$/u.exec(line);

    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

export function sanitizeTitleForFileName(title: string): string {
  const sanitized = title
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .trim();

  return sanitized || '未命名文档';
}

function parseFrontmatterBlock(block: string): Record<string, string> {
  return Object.fromEntries(
    block
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], unquote(match[2].trim())]),
  );
}

function fileStem(fileName: string) {
  return fileName.replace(/\.(md|mdx)$/i, '') || '未命名文档';
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function unquote(value: string) {
  return value.replace(/^["']|["']$/g, '');
}

# Markora 编辑器替换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 refinex-wiki 的编辑器从 Plate.js 全面、一次性替换为 markora（CodeMirror 6 原生 Markdown 编辑器），磁盘 `.md`、内存模型、编辑器三层统一为 Markdown 字符串，彻底删除 Plate 全部代码与依赖。

**Architecture:** 新建 `MarkoraEditor`（`@uiw/react-codemirror` + `markora()` extensions）作为 `PlateEditor` 的等价替换。`use-workspace` 的草稿瘦身为纯 markdown 字符串（删除 Plate JSON `value` 与双向转换层）。右侧 TOC 面板数据源从 Plate `useTocElementState` 改为 markora `onTocChange`，滚动定位用 `EditorView.scrollIntoView`。附件上传复用 `workspace-local-assets`。推进顺序：先建新组件 + 新数据模型 → 切换 workspace-layout 引用 → 逐批删除 Plate 文件 → 删除依赖，每步 `pnpm build` 验证。

**Tech Stack:** Next.js App Router、React、TypeScript、`@refinex/markora@1.0.1`、`@uiw/react-codemirror`、CodeMirror 6、Tauri、vitest + @testing-library/react。

**设计文档：** `docs/superpowers/specs/2026-06-17-markora-editor-replacement-design.md`

**包管理器：** pnpm（项目同时存在 `package-lock.json` 和 `pnpm-lock.yaml`，但脚本以 pnpm 为准；本计划统一用 pnpm，并在最后删除 `package-lock.json`）。

---

## 文件结构

**新增文件：**

- `components/editor/markora-frontmatter.ts` — 纯字符串 frontmatter 解析/序列化 + H1 正则提取。无 React、无编辑器依赖。
- `components/editor/markora-editor.tsx` — markora 编辑器组件（client component），封装 CodeMirror + markora extensions、TOC 桥、附件 uploader、Cmd+S。
- `components/editor/use-markora-toc.ts` — 从 CodeMirror view 提取 TOC items、计算 active 标题、提供 scrollToHeading。
- `components/editor/use-workspace-asset-uploader.ts` — 把 markora `uploader(file)` 适配到 `uploadWorkspaceAsset` Tauri 命令。
- `components/editor/__tests__/markora-frontmatter.test.ts`
- `components/editor/__tests__/markora-editor.test.tsx`
- `components/editor/__tests__/use-markora-toc.test.ts`
- `components/editor/__tests__/use-workspace-asset-uploader.test.ts`
- `components/workspace/__tests__/workspace-document-insights.test.ts`（重写后）

**修改文件：**

- `components/workspace/workspace-types.ts` — `MarkdownDocumentDraft` 瘦身；删除 `PlateDocumentEnvelope` 等 Plate 类型（保留 `WorkspaceNode` 等）。
- `components/workspace/use-workspace.ts` — 草稿模型改为纯 markdown；`updateDocumentValue` → `updateMarkdown`。
- `components/workspace/workspace-document-insights.ts` — 删 `countPlateDocumentCharacters`；`extractDocumentResourceReferences` 改为基于 markdown 正则的 `extractResourceReferencesFromMarkdown`。
- `components/workspace/document-meta-panel.tsx` — props 从 `PlateDocumentEnvelope` 改为 `markdown` + `metadata`。
- `components/workspace/ai-side-panel.tsx` — `RightSidePanel` 的 `documentEnvelope` prop 改为 `markdown` + `metadata`。
- `components/workspace/workspace-layout.tsx` — `PlateEditor` → `MarkoraEditor`；`documentEnvelopeForPanel` 重算；字数统计改 markdown。
- `package.json` — 删 Plate 依赖，加 markora + CodeMirror 依赖。

**删除文件（实施中分批删除，每批后 build 验证）：**

- `components/editor/plate-editor.tsx`、`editor-kit.tsx`、`editor-base-kit.tsx`、`plate-types.ts`、`markdown-document.ts`、`markdown-import.ts`、`transforms.ts`、`settings-dialog.tsx`、`document-toc-bridge.tsx`、`workspace-asset-context.tsx`（如不再被引用）、`use-resolved-asset-url.ts`（如不再被引用）、`use-chat.ts`（保留——AI 占位，不依赖 Plate；实施时确认）、`math-kit.tsx`
- `components/editor/plugins/`（整个目录）
- `components/editor/__tests__/plate-editor.test.tsx`、`markdown-document.test.ts`、`markdown-import.test.ts`、`document-toc-bridge.test.tsx`、`excalidraw-kit.test.ts`、`title-sync-utils.test.ts`
- `components/ui/*` 下 Plate 节点组件（逐个甄别保留通用 UI）
- `components/workspace/workspace-document-transfer.ts`、`workspace-export-archive.ts`

---

## Task 1: 新增 markdown-frontmatter 纯字符串工具（TDD）

**Files:**
- Create: `components/editor/markora-frontmatter.ts`
- Test: `components/editor/__tests__/markora-frontmatter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `components/editor/__tests__/markora-frontmatter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  extractH1FromMarkdown,
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markora-frontmatter';

describe('parseFrontmatter', () => {
  it('解析带 frontmatter 的文档', () => {
    const raw = '---\ntitle: 标题\ncreatedAt: 2026-01-01\n---\n\n# 正文';
    const { metadata, body } = parseFrontmatter(raw);
    expect(metadata.title).toBe('标题');
    expect(body).toBe('\n\n# 正文');
  });

  it('无 frontmatter 时 metadata 为空对象，body 为原文', () => {
    const raw = '# 正文';
    const { metadata, body } = parseFrontmatter(raw);
    expect(metadata).toEqual({});
    expect(body).toBe('# 正文');
  });

  it('不完整的 frontmatter 分隔符不当作 frontmatter', () => {
    const raw = '---\ntitle: 标题';
    const { metadata, body } = parseFrontmatter(raw);
    expect(metadata).toEqual({});
    expect(body).toBe(raw);
  });
});

describe('serializeFrontmatter', () => {
  it('序列化带 metadata 的文档', () => {
    const out = serializeFrontmatter({
      body: '\n\n# 正文',
      metadata: { title: '标题', createdAt: '2026-01-01' },
    });
    expect(out).toBe('---\ntitle: 标题\ncreatedAt: 2026-01-01\n---\n\n# 正文');
  });

  it('空 metadata 时不输出 frontmatter', () => {
    const out = serializeFrontmatter({ body: '# 正文', metadata: {} });
    expect(out).toBe('# 正文');
  });

  it('保持 metadata key 插入顺序', () => {
    const out = serializeFrontmatter({
      body: 'x',
      metadata: { z: '1', a: '2' },
    });
    expect(out.startsWith('---\nz: 1\na: 2\n---\nx')).toBe(true);
  });
});

describe('extractH1FromMarkdown', () => {
  it('提取第一个 H1 文本并 trim', () => {
    expect(extractH1FromMarkdown('#  标题  \n## 子标题')).toBe('标题');
  });

  it('无 H1 返回 null', () => {
    expect(extractH1FromMarkdown('## 子标题\n正文')).toBeNull();
  });

  it('不误匹配行内 # 或代码块内的 H1', () => {
    expect(extractH1FromMarkdown('正文 `# 不是标题`\n```\n# 代码里的标题\n```\n')).toBeNull();
  });

  it('只提取 ATX 风格 H1，不提取 Setext 下划线标题', () => {
    expect(extractH1FromMarkdown('标题\n====\n')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/editor/__tests__/markora-frontmatter.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现最小实现**

Create `components/editor/markora-frontmatter.ts`:

```ts
const FRONTMATTER_DELIMITER = '---';

export interface ParsedFrontmatter {
  metadata: Record<string, string>;
  body: string;
}

export interface SerializeFrontmatterInput {
  body: string;
  metadata: Record<string, string>;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    return { metadata: {}, body: raw };
  }

  const closingIndex = raw.indexOf(
    `\n${FRONTMATTER_DELIMITER}\n`,
    FRONTMATTER_DELIMITER.length + 1,
  );

  if (closingIndex === -1) {
    return { metadata: {}, body: raw };
  }

  const frontmatterBlock = raw.slice(
    FRONTMATTER_DELIMITER.length + 1,
    closingIndex,
  );
  const body = raw.slice(closingIndex + FRONTMATTER_DELIMITER.length + 2);
  const metadata = parseFrontmatterBlock(frontmatterBlock);

  return { metadata, body };
}

export function serializeFrontmatter(
  input: SerializeFrontmatterInput,
): string {
  const keys = Object.keys(input.metadata);

  if (keys.length === 0) {
    return input.body;
  }

  const lines = keys.map((key) => `${key}: ${input.metadata[key]}`);
  return `${FRONTMATTER_DELIMITER}\n${lines.join('\n')}\n${FRONTMATTER_DELIMITER}${input.body}`;
}

export function extractH1FromMarkdown(
  markdown: string,
): string | null {
  const lines = markdown.split('\n');
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

function parseFrontmatterBlock(block: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const line of block.split('\n')) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/u.exec(line);

    if (match) {
      metadata[match[1]] = match[2].trim();
    }
  }

  return metadata;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run components/editor/__tests__/markora-frontmatter.test.ts`
Expected: PASS — 全部用例绿。

- [ ] **Step 5: 提交**

```bash
git add components/editor/markora-frontmatter.ts components/editor/__tests__/markora-frontmatter.test.ts
git commit -m "feat: 新增纯字符串 frontmatter 解析与 H1 提取工具"
```

---

## Task 2: 瘦身 workspace-types 草稿类型

**Files:**
- Modify: `components/workspace/workspace-types.ts`

- [ ] **Step 1: 修改 MarkdownDocumentDraft 为纯 markdown**

在 `components/workspace/workspace-types.ts` 中，把现有的 `MarkdownDocumentDraft` 接口（约 113-125 行）替换为：

```ts
export interface MarkdownDraft {
  markdown: string;
  metadata: {
    title: string;
    createdAt: string | null;
    updatedAt: string | null;
    refinexDialect: number;
  };
  modifiedAt: number;
  path: string;
}
```

删除文件顶部的 `import type { Value } from 'platejs';`（第 1 行）。删除 `PlateDocumentEnvelope`、`PlateDocumentContent`、`ImportedPlateDocumentInput`、`ImportedPlateDocumentResult`、`CreatedPlateDocument` 接口（这些依赖 Plate Value 或被导出层使用，导出层将在后续 task 删除）。

保留 `MarkdownDocumentContent`、`MarkdownDocumentDraft`（如果其它代码还引用旧名，保留为 `MarkdownDraft` 的别名直到全量替换完成；否则直接改名）。

注意：`MarkdownDraft.metadata` 的字段必须与现有 `parseMarkdownDocument` 返回的 metadata 形状一致（title/createdAt/updatedAt/refinexDialect）。`createdAt`/`updatedAt` 保持 `string | null`。

- [ ] **Step 2: 确认类型检查**

Run: `pnpm tsc --noEmit`
Expected: 会报错（因为 `use-workspace.ts` 还在引用旧的 `value`/`body` 字段和 `markdownToPlateValue`）。这是预期的，记录报错点，后续 task 修复。**此步不要求全绿，仅确认类型文件本身无语法错误。**

- [ ] **Step 3: 暂不提交（与 Task 3 一起提交，避免中间态破坏构建）**

---

## Task 3: use-workspace 改为纯 markdown 草稿流转（TDD）

**Files:**
- Modify: `components/workspace/use-workspace.ts`
- Test: `components/workspace/__tests__/use-workspace.test.ts`（更新现有测试；若无则参考现有 `workspace-document-flow.test.tsx`）

- [ ] **Step 1: 写失败测试（H1 同步基于 markdown）**

在 `components/workspace/__tests__/` 下新建或更新 `use-workspace-markdown.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { extractH1FromMarkdown } from '@/components/editor/markora-frontmatter';

describe('updateMarkdown H1 同步（基于 markdown 正则）', () => {
  it('extractH1FromMarkdown 能从草稿 markdown 提取 H1 用于 title 同步', () => {
    const markdown = '---\ntitle: 旧标题\n---\n\n# 新标题\n\n正文';
    const h1 = extractH1FromMarkdown(markdown);
    expect(h1).toBe('新标题');
  });

  it('无 H1 时返回 null，不触发 title 同步', () => {
    const markdown = '---\ntitle: 标题\n---\n\n## 子标题';
    expect(extractH1FromMarkdown(markdown)).toBeNull();
  });
});
```

（注：`use-workspace` 的完整 hook 测试需要 mock Tauri invoke，复杂度高。这里用单元测试锁定 H1 提取契约；hook 级别的集成行为由现有 `workspace-document-flow.test.tsx` 覆盖，Task 3 Step 6 会把它适配为纯 markdown。）

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/workspace/__tests__/use-workspace-markdown.test.ts`
Expected: PASS（因为 Task 1 已实现 `extractH1FromMarkdown`）。如果 PASS，说明契约已就位，继续 Step 3 改 hook 实现。

- [ ] **Step 3: 修改 createMarkdownDraft 去掉 Plate 转换**

在 `components/workspace/use-workspace.ts` 中，把 `createMarkdownDraft`（约 907-921 行）改为：

```ts
function createMarkdownDraft(
  content: MarkdownDocumentContent,
  fileName: string,
): MarkdownDraft {
  const parsed = parseMarkdownDocument(content.content, fileName);

  return {
    markdown: content.content,
    metadata: parsed.metadata,
    modifiedAt: content.modifiedAt,
    path: content.path,
  };
}
```

更新文件顶部 import：删除 `markdownToPlateValue`、`plateValueToMarkdown`、`extractH1Text` 的导入；改为从 `@/components/editor/markdown-frontmatter` 导入 `extractH1FromMarkdown`、`parseFrontmatter`、`serializeFrontmatter`。

注意：`parseMarkdownDocument` 当前在 `markdown-document.ts`（待删除）。本 task 需要先把 `parseMarkdownDocument` 的逻辑迁到 `markora-frontmatter.ts` 或内联进 `use-workspace.ts`。**决策：** 在 `markora-frontmatter.ts` 追加一个 `parseMarkdownMetadata(raw, fileName)` 函数，返回 `{ metadata, body }`，`use-workspace` 调用它。具体实现：

在 `components/editor/markora-frontmatter.ts` 追加：

```ts
export interface ParsedMarkdownDocument {
  metadata: {
    title: string;
    createdAt: string | null;
    updatedAt: string | null;
    refinexDialect: number;
  };
  body: string;
}

export function parseMarkdownMetadata(
  raw: string,
  fileName: string,
): ParsedMarkdownDocument {
  const { metadata, body } = parseFrontmatter(raw);
  const fileStem = fileName.replace(/\.md$/i, '');
  const h1 = extractH1FromMarkdown(body);
  const title = metadata.title ?? h1 ?? fileStem;

  return {
    body,
    metadata: {
      title,
      createdAt: metadata.createdAt ?? null,
      updatedAt: metadata.updatedAt ?? null,
      refinexDialect: Number(metadata.refinexDialect ?? 0),
    },
  };
}
```

为 `parseMarkdownMetadata` 补单元测试到 `markora-frontmatter.test.ts`（title 优先级：frontmatter > H1 > 文件名）。

- [ ] **Step 4: 把 updateDocumentValue 改为 updateMarkdown**

在 `use-workspace.ts` 中，把 `updateDocumentValue`（约 413-464 行）整体替换为 `updateMarkdown`：

```ts
const updateMarkdown = React.useCallback(
  (nextMarkdown: string) => {
    if (!draftDocument) {
      return;
    }

    const nextDraft = withUpdatedMarkdown(draftDocument, nextMarkdown);
    const titleChanged =
      nextDraft.metadata.title !== draftDocument.metadata.title;

    setDraftDocument(nextDraft);

    if (nextDraft.markdown === lastSavedMarkdownRef.current) {
      clearPendingSave();
      setSaveState('saved');
      setSaveError(null);
      return;
    }

    setSaveState('dirty');
    setSaveError(null);
    clearPendingSave();
    pendingSaveTimerRef.current = setTimeout(() => {
      void saveCurrentDocumentNow(nextDraft);
    }, 800);

    if (titleChanged && !isRenamingRef.current && currentDocument) {
      const newFileName = sanitizeTitleForFileName(nextDraft.metadata.title);
      const currentFileName = currentDocument.name.replace(/\.md$/i, '');

      if (newFileName !== currentFileName) {
        clearPendingRename();
        const targetNode = currentDocument;

        pendingRenameTimerRef.current = setTimeout(() => {
          isRenamingRef.current = true;
          void renameNode(targetNode, newFileName).finally(() => {
            isRenamingRef.current = false;
          });
        }, 300);
      }
    }
  },
  [
    clearPendingSave,
    clearPendingRename,
    currentDocument,
    draftDocument,
    renameNode,
    saveCurrentDocumentNow,
  ],
);
```

把 `withUpdatedMarkdownValue`（约 923-942 行）替换为 `withUpdatedMarkdown`：

```ts
function withUpdatedMarkdown(
  draft: MarkdownDraft,
  markdown: string,
): MarkdownDraft {
  const parsed = parseMarkdownMetadata(markdown, '');
  const h1Text = extractH1FromMarkdown(parsed.body);
  const metadata = {
    ...draft.metadata,
    updatedAt: new Date().toISOString(),
    ...(h1Text !== null && h1Text !== '' ? { title: h1Text } : {}),
  };

  const nextMarkdown = serializeFrontmatter({ body: parsed.body, metadata });

  return {
    ...draft,
    markdown: nextMarkdown,
    metadata,
  };
}
```

注意 `sanitizeTitleForFileName` 当前从 `markdown-document.ts` 导入（待删）。**决策：** 把 `sanitizeTitleForFileName` 迁到 `markora-frontmatter.ts`（纯字符串工具），补单元测试。实现：

```ts
export function sanitizeTitleForFileName(title: string): string {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    || 'untitled';
}
```

（实现需与现有 `sanitizeTitleForFileName` 行为一致；执行时先读 `markdown-document.ts` 中的现有实现，照抄过来。）

- [ ] **Step 5: 更新 use-workspace 导出，删除 Plate 相关引用**

把 return 对象里的 `updateDocumentValue: updateMarkdown` 改为 `updateMarkdown`。删除 import 里的 `extractH1Text`、`markdownToPlateValue`、`plateValueToMarkdown`、`parseMarkdownDocument`（旧）、`serializeMarkdownDocument`（旧）、`sanitizeTitleForFileName`（旧）。

`compensateMarkdownDocument`（约 944-987 行）保留，但把对 `parseMarkdownDocument`/`serializeMarkdownDocument` 的调用改为 `parseMarkdownMetadata`/`serializeFrontmatter`。`createTransferEnvelope`（约 989-1002 行）删除（导出层已移除）。

- [ ] **Step 6: 运行 use-workspace 相关测试**

Run: `pnpm vitest run components/workspace/__tests__/use-workspace-markdown.test.ts components/workspace/__tests__/workspace-document-flow.test.tsx`
Expected: `use-workspace-markdown.test.ts` PASS。`workspace-document-flow.test.tsx` 可能因引用 `value`/Plate 报错——**本步把它适配为纯 markdown**：把测试中构造 `draftDocument.value` 的地方改为 `draftDocument.markdown`，把断言 Plate value 的地方改为断言 markdown 字符串。如果该测试文件大量依赖 Plate，执行时按"删掉 Plate 断言、保留 markdown 流转断言"原则精简。

- [ ] **Step 7: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: `use-workspace.ts` 和 `workspace-types.ts` 自身无错。其它文件（plate-editor、workspace-layout、document-meta-panel 等）会因还在用旧 API 报错——记录报错点，后续 task 修复。

- [ ] **Step 8: 提交**

```bash
git add components/workspace/workspace-types.ts components/workspace/use-workspace.ts components/editor/markora-frontmatter.ts components/editor/__tests__/markora-frontmatter.test.ts components/workspace/__tests__/use-workspace-markdown.test.ts components/workspace/__tests__/workspace-document-flow.test.tsx
git commit -m "refactor: use-workspace 草稿改为纯 markdown，移除 Plate 转换层"
```

---

## Task 4: 重写 workspace-document-insights 为基于 markdown

**Files:**
- Modify: `components/workspace/workspace-document-insights.ts`
- Test: `components/workspace/__tests__/workspace-document-insights.test.ts`

- [ ] **Step 1: 写失败测试**

Create `components/workspace/__tests__/workspace-document-insights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  countMarkdownCharacters,
  extractResourceReferencesFromMarkdown,
} from '@/components/workspace/workspace-document-insights';

describe('countMarkdownCharacters', () => {
  it('统计去空白后的字符数', () => {
    expect(countMarkdownCharacters('# 标题\n\n正文 空格')).toBe('标题正文空格'.length);
  });

  it('空字符串返回 0', () => {
    expect(countMarkdownCharacters('')).toBe(0);
  });

  it('全是空白返回 0', () => {
    expect(countMarkdownCharacters('   \n\t  ')).toBe(0);
  });
});

describe('extractResourceReferencesFromMarkdown', () => {
  it('提取 refinex-asset:// 引用', () => {
    const markdown = '![图](refinex-asset://abc123)\n![图2](refinex-asset://def456)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      id: 'abc123',
      nodeType: 'image',
      url: 'refinex-asset://abc123',
    });
  });

  it('去重相同 id', () => {
    const markdown = '![图](refinex-asset://abc)\n[](refinex-asset://abc)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs).toHaveLength(1);
  });

  it('无引用返回空数组', () => {
    expect(extractResourceReferencesFromMarkdown('# 标题\n正文')).toEqual([]);
  });

  it('识别图片 vs 文件链接的 nodeType', () => {
    const markdown = '![图](refinex-asset://img1)\n[文件](refinex-asset://file1)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs.find((r) => r.id === 'img1')?.nodeType).toBe('image');
    expect(refs.find((r) => r.id === 'file1')?.nodeType).toBe('file');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/workspace/__tests__/workspace-document-insights.test.ts`
Expected: FAIL — 函数未导出/不存在。

- [ ] **Step 3: 重写实现**

把 `components/workspace/workspace-document-insights.ts` 整体替换为：

```ts
import { LOCAL_ASSET_URL_PREFIX } from './workspace-local-assets';

export interface DocumentResourceReference {
  id: string;
  nodeType: string;
  url: string;
}

const ASSET_URL_PATTERN = new RegExp(
  `!\\[[^\\]]*\\]\\((${escapeRegExp(LOCAL_ASSET_URL_PREFIX)}[^)\\s]+)\\)|` +
    `\\[[^\\]]*\\]\\((${escapeRegExp(LOCAL_ASSET_URL_PREFIX)}[^)\\s]+)\\)`,
  'g',
);

export function countMarkdownCharacters(markdown: string | undefined): number {
  if (!markdown) {
    return 0;
  }

  return Array.from(markdown.replace(/\s+/g, '')).length;
}

export function extractResourceReferencesFromMarkdown(
  markdown: string | undefined,
): DocumentResourceReference[] {
  if (!markdown) {
    return [];
  }

  const references = new Map<string, DocumentResourceReference>();

  for (const match of markdown.matchAll(ASSET_URL_PATTERN)) {
    const url = match[1] ?? match[2];

    if (!url) {
      continue;
    }

    const id = url.slice(LOCAL_ASSET_URL_PREFIX.length).trim();

    if (!id || references.has(id)) {
      continue;
    }

    const isImage = match[0].startsWith('!');

    references.set(id, {
      id,
      nodeType: isImage ? 'image' : 'file',
      url,
    });
  }

  return Array.from(references.values());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run components/workspace/__tests__/workspace-document-insights.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/workspace-document-insights.ts components/workspace/__tests__/workspace-document-insights.test.ts
git commit -m "refactor: workspace-document-insights 改为基于 markdown 字符串"
```

---

## Task 5: 新增 use-workspace-asset-uploader（适配 markora uploader 到 Tauri）

**Files:**
- Create: `components/editor/use-workspace-asset-uploader.ts`
- Test: `components/editor/__tests__/use-workspace-asset-uploader.test.ts`

- [ ] **Step 1: 写失败测试**

Create `components/editor/__tests__/use-workspace-asset-uploader.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import { LOCAL_ASSET_URL_PREFIX } from '@/components/workspace/workspace-local-assets';

vi.mock('@/components/workspace/workspace-api', () => ({
  uploadWorkspaceAsset: vi.fn(),
}));

import { uploadWorkspaceAsset } from '@/components/workspace/workspace-api';

describe('useWorkspaceAssetUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把 File 转 base64 调用 uploadWorkspaceAsset，返回 refinex-asset URL', async () => {
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      id: 'asset-id-1',
      url: '',
      name: 'pic.png',
      mediaType: 'image/png',
      size: 100,
      absolutePath: '/ws/assets/pic.png',
    });

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root'),
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', {
      type: 'image/png',
    });

    const out = await result.current(file, {
      kind: 'image',
      source: 'paste',
      documentText: '',
      selection: { from: 0, to: 0 },
    });

    expect(uploadWorkspaceAsset).toHaveBeenCalledWith('/ws/root', {
      fileName: 'pic.png',
      mediaType: 'image/png',
      base64Data: expect.any(String),
    });
    expect(out).toEqual({
      url: `${LOCAL_ASSET_URL_PREFIX}asset-id-1`,
      name: 'pic.png',
      mimeType: 'image/png',
    });
  });

  it('rootPath 为 null 时抛错', async () => {
    const { result } = renderHook(() => useWorkspaceAssetUploader(null));

    await expect(
      result.current(new File([], 'x.png'), {
        kind: 'image',
        source: 'slash',
        documentText: '',
        selection: { from: 0, to: 0 },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/editor/__tests__/use-workspace-asset-uploader.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现最小实现**

Create `components/editor/use-workspace-asset-uploader.ts`:

```ts
'use client';

import * as React from 'react';
import type { MarkoraAttachmentUploader } from '@refinex/markora/editor';

import { uploadWorkspaceAsset } from '@/components/workspace/workspace-api';
import { LOCAL_ASSET_URL_PREFIX } from '@/components/workspace/workspace-local-assets';

export function useWorkspaceAssetUploader(
  rootPath: string | null,
): MarkoraAttachmentUploader {
  return React.useCallback(
    async (file, _context) => {
      if (!rootPath) {
        throw new Error('未打开工作区，无法上传附件。');
      }

      const base64Data = await fileToBase64(file);
      const uploaded = await uploadWorkspaceAsset(rootPath, {
        fileName: file.name,
        mediaType: file.type || 'application/octet-stream',
        base64Data,
      });

      return {
        url: `${LOCAL_ASSET_URL_PREFIX}${uploaded.id}`,
        name: uploaded.name,
        mimeType: uploaded.mediaType,
      };
    },
    [rootPath],
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('无法读取文件内容。'));
        return;
      }

      const commaIndex = result.indexOf(',');

      if (commaIndex === -1) {
        reject(new Error('文件 base64 编码失败。'));
        return;
      }

      resolve(result.slice(commaIndex + 1));
    };

    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run components/editor/__tests__/use-workspace-asset-uploader.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add components/editor/use-workspace-asset-uploader.ts components/editor/__tests__/use-workspace-asset-uploader.test.ts
git commit -m "feat: 新增 workspace asset uploader 适配 markora 附件上传"
```

---

## Task 6: 新增 use-markora-toc hook（TDD）

**Files:**
- Create: `components/editor/use-markora-toc.ts`
- Test: `components/editor/__tests__/use-markora-toc.test.ts`

这个 hook 从 CodeMirror view + markora `onTocChange` 维护 TOC items、计算 active 标题、提供 `scrollToHeading`。

- [ ] **Step 1: 写失败测试**

Create `components/editor/__tests__/use-markora-toc.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildTocSnapshot, type TocBridgeState } from '@/components/editor/use-markora-toc';
import type { MarkoraTocItem } from '@refinex/markora/editor';

function makeItem(
  level: 2 | 3,
  text: string,
  from: number,
): MarkoraTocItem {
  return { id: text, level, text, from, to: from + 10, active: false };
}

describe('buildTocSnapshot', () => {
  it('过滤 H1，映射 depth = level - 1，clamp 到 [1,3]', () => {
    const items: MarkoraTocItem[] = [
      makeItem(2, '章节 A', 10),
      makeItem(3, '小节', 50),
    ];

    const snapshot = buildTocSnapshot(items, null);

    expect(snapshot.items).toEqual([
      { depth: 1, id: '章节 A', originalDepth: 2, title: '章节 A', type: 'h2' },
      { depth: 2, id: '小节', originalDepth: 3, title: '小节', type: 'h3' },
    ]);
  });

  it('activeContentId 为 null 时 snapshot.activeContentId 为 null', () => {
    const snapshot = buildTocSnapshot([makeItem(2, 'A', 10)], null);
    expect(snapshot.activeContentId).toBeNull();
  });

  it('activeContentId 指向不存在的 item 时返回 null', () => {
    const snapshot = buildTocSnapshot([makeItem(2, 'A', 10)], 'nope');
    expect(snapshot.activeContentId).toBeNull();
  });

  it('activeContentId 指向存在的 item 时原样返回', () => {
    const snapshot = buildTocSnapshot([makeItem(2, 'A', 10)], 'A');
    expect(snapshot.activeContentId).toBe('A');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/editor/__tests__/use-markora-toc.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现纯函数 buildTocSnapshot + hook**

Create `components/editor/use-markora-toc.ts`:

```ts
'use client';

import * as React from 'react';
import { EditorView } from '@codemirror/view';
import type { MarkoraTocItem } from '@refinex/markora/editor';

export interface DocumentTocItem {
  depth: number;
  id: string;
  originalDepth: number;
  title: string;
  type: string;
}

export interface DocumentTocSnapshot {
  activeContentId: string | null;
  items: DocumentTocItem[];
  scrollToHeading: (id: string) => void;
}

const LEVEL_TO_TYPE: Record<number, string> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

export function buildTocSnapshot(
  items: MarkoraTocItem[],
  activeId: string | null,
): Pick<DocumentTocSnapshot, 'items' | 'activeContentId'> {
  const tocItems = items
    .filter((item) => item.level > 1)
    .map((item) => ({
      depth: Math.min(Math.max(item.level - 1, 1), 3),
      id: item.id,
      originalDepth: item.level,
      title: item.text,
      type: LEVEL_TO_TYPE[item.level] ?? `h${item.level}`,
    }));

  const activeContentId =
    activeId && tocItems.some((item) => item.id === activeId)
      ? activeId
      : null;

  return { items: tocItems, activeContentId };
}

export function useMarkoraToc(options: {
  viewRef: React.RefObject<EditorView | null>;
  itemsRef: React.RefObject<MarkoraTocItem[]>;
  onSnapshotChange: ((snapshot: DocumentTocSnapshot) => void) | undefined;
}): void {
  const { viewRef, itemsRef, onSnapshotChange } = options;
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const onSnapshotChangeRef = React.useRef(onSnapshotChange);

  React.useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  }, [onSnapshotChange]);

  const scrollToHeading = React.useCallback((id: string) => {
    const view = viewRef.current;
    const item = itemsRef.current.find((entry) => entry.id === id);

    if (!view || !item) {
      return;
    }

    view.dispatch({
      effects: EditorView.scrollIntoView(item.from, { y: 'start' }),
    });
  }, [itemsRef, viewRef]);

  React.useEffect(() => {
    const snapshot = buildTocSnapshot(itemsRef.current, activeId);
    onSnapshotChangeRef.current?.({
      ...snapshot,
      scrollToHeading,
    });
  }, [activeId, itemsRef, scrollToHeading]);

  // 暴露 setActiveId 给编辑器组件的 updateListener 调用。
  // 通过 ref 回调注入，避免 hook 返回值污染。
  useExposeActiveSetter(scrollToHeading, setActiveId);
}

// 占位：实际实现里 setActiveId 由 markora-editor 通过 updateListener 计算后调用。
// 这里用一个内部机制把 setter 暴露出去；markora-editor 会持有这个 ref。
function useExposeActiveSetter(
  _scrollToHeading: (id: string) => void,
  _setActiveId: (id: string | null) => void,
) {
  // no-op；setActiveId 通过返回值或 context 暴露，见 markora-editor 实现。
}
```

**注意：** `useMarkoraToc` 的 active 计算依赖编辑器滚动事件，复杂度高。**简化决策：** 本 task 只实现并测试纯函数 `buildTocSnapshot`（数据映射 + active 解析），这是核心可测逻辑。`scrollToHeading` 和 active 实时计算放到 Task 7 的 `markora-editor.tsx` 内联实现（用 `EditorView.updateListener` + `coordsAtPos`）。`use-markora-toc.ts` 导出 `buildTocSnapshot` 纯函数 + `DocumentTocItem`/`DocumentTocSnapshot` 类型；hook 部分精简为只导出纯函数。

修订 `use-markora-toc.ts`（去掉上面的 hook，只留纯函数 + 类型）：

```ts
'use client';

import { EditorView } from '@codemirror/view';
import type { MarkoraTocItem } from '@refinex/markora/editor';

export interface DocumentTocItem {
  depth: number;
  id: string;
  originalDepth: number;
  title: string;
  type: string;
}

export interface DocumentTocSnapshot {
  activeContentId: string | null;
  items: DocumentTocItem[];
  scrollToHeading: (id: string) => void;
}

const LEVEL_TO_TYPE: Record<number, string> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

export function buildTocSnapshot(
  items: MarkoraTocItem[],
  activeId: string | null,
): Pick<DocumentTocSnapshot, 'items' | 'activeContentId'> {
  const tocItems = items
    .filter((item) => item.level > 1)
    .map((item) => ({
      depth: Math.min(Math.max(item.level - 1, 1), 3),
      id: item.id,
      originalDepth: item.level,
      title: item.text,
      type: LEVEL_TO_TYPE[item.level] ?? `h${item.level}`,
    }));

  const activeContentId =
    activeId && tocItems.some((item) => item.id === activeId)
      ? activeId
      : null;

  return { items: tocItems, activeContentId };
}

export function scrollToHeadingIn(
  view: EditorView | null,
  items: MarkoraTocItem[],
  id: string,
): void {
  const item = items.find((entry) => entry.id === id);

  if (!view || !item) {
    return;
  }

  view.dispatch({
    effects: EditorView.scrollIntoView(item.from, { y: 'start' }),
  });
}
```

更新测试为只测纯函数（删掉 hook 相关引用，`scrollToHeadingIn` 用 mock view 测 dispatch）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run components/editor/__tests__/use-markora-toc.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add components/editor/use-markora-toc.ts components/editor/__tests__/use-markora-toc.test.ts
git commit -m "feat: 新增 markora TOC 纯函数（buildTocSnapshot + scrollToHeadingIn）"
```

---

## Task 7: 新增 MarkoraEditor 组件（核心替换件）

**Files:**
- Create: `components/editor/markora-editor.tsx`
- Test: `components/editor/__tests__/markora-editor.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `components/editor/__tests__/markora-editor.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkoraEditor } from '@/components/editor/markora-editor';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

describe('MarkoraEditor', () => {
  it('渲染编辑器并显示初始 markdown', () => {
    render(
      <MarkoraEditor
        documentKey="doc-1"
        markdown="# 标题\n\n正文"
        onMarkdownChange={() => {}}
      />,
    );
    expect(document.querySelector('.cm-editor')).toBeTruthy();
  });

  it('Cmd+S 触发 onSaveRequested', () => {
    const onSave = vi.fn();
    render(
      <MarkoraEditor
        documentKey="doc-1"
        markdown="# x"
        onSaveRequested={onSave}
        onMarkdownChange={() => {}}
      />,
    );
    const container = screen
      .getByTestId('markora-editor-root')
      .querySelector('.cm-editor') as HTMLElement;
    fireEvent.keyDown(container, { key: 's', metaKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it('documentKey 变化时不报错（重建由 React key 控制）', () => {
    const { rerender } = render(
      <MarkoraEditor
        documentKey="doc-1"
        markdown="# a"
        onMarkdownChange={() => {}}
      />,
    );
    expect(() =>
      rerender(
        <MarkoraEditor
          documentKey="doc-2"
          markdown="# b"
          onMarkdownChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run components/editor/__tests__/markora-editor.test.tsx`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 MarkoraEditor**

Create `components/editor/markora-editor.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { ArrowUp } from 'lucide-react';
import CodeMirror, {
  type Extension,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import {
  markora,
  ThemeEnum,
  type MarkoraNode,
  type MarkoraTocItem,
} from '@refinex/markora/editor';
import { allPlugins } from '@refinex/markora/plugins';

import {
  buildTocSnapshot,
  scrollToHeadingIn,
  type DocumentTocSnapshot,
} from '@/components/editor/use-markora-toc';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import { WorkspaceAssetProvider } from '@/components/editor/workspace-asset-context';
import type { PageWidthMode } from '@/components/workspace/workspace-types';

interface MarkoraEditorProps {
  documentKey?: string;
  markdown: string;
  pageWidthMode?: PageWidthMode;
  onSaveRequested?: () => void;
  onTocSnapshotChange?: (snapshot: DocumentTocSnapshot) => void;
  onMarkdownChange?: (markdown: string) => void;
  workspaceRootPath?: string | null;
}

export function MarkoraEditor({
  documentKey,
  markdown,
  pageWidthMode = 'standard',
  onSaveRequested,
  onTocSnapshotChange,
  onMarkdownChange,
  workspaceRootPath = null,
}: MarkoraEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const tocItemsRef = React.useRef<MarkoraTocItem[]>([]);
  const [activeTocId, setActiveTocId] = React.useState<string | null>(null);
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);

  const isDark = resolvedTheme === 'dark';
  const cmTheme = isDark ? githubDark : githubLight;
  const markoraTheme = isDark ? ThemeEnum.DARK : ThemeEnum.LIGHT;
  const uploader = useWorkspaceAssetUploader(workspaceRootPath ?? null);

  // TOC snapshot 发布
  React.useEffect(() => {
    if (!onTocSnapshotChange) {
      return;
    }

    const snapshot = buildTocSnapshot(tocItemsRef.current, activeTocId);
    onTocSnapshotChange({
      ...snapshot,
      scrollToHeading: (id) =>
        scrollToHeadingIn(
          editorRef.current?.view ?? null,
          tocItemsRef.current,
          id,
        ),
    });
  }, [activeTocId, onTocSnapshotChange]);

  const extensions = React.useMemo<Extension[]>(() => {
    const tocAware: Extension[] = [
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.viewportChanged) {
          updateActiveToc(update.view);
        }
      }),
    ];

    return [
      ...markora({
        theme: markoraTheme,
        locale: 'zh-CN',
        baseStyles: true,
        plugins: allPlugins,
        disableViewPlugin: false,
        defaultKeybindings: true,
        history: true,
        indentWithTab: true,
        lineWrapping: true,
        slashCommands: { enabled: true },
        selectionToolbar: { enabled: true },
        attachments: {
          enabled: true,
          uploader,
          enablePaste: true,
          enableDrop: true,
          accept: {
            image: ['image/*'],
            video: ['video/*'],
            audio: ['audio/*'],
            file: ['*/*'],
          },
        },
        toc: {
          enabled: false, // 不用 markora 内置 TOC 面板
          onTocChange: (items) => {
            tocItemsRef.current = items;
          },
        },
      }),
      ...tocAware,
    ];
  }, [markoraTheme, uploader]);

  function updateActiveToc(view: EditorView) {
    const items = tocItemsRef.current;

    if (items.length === 0) {
      return;
    }

    const scrollTop =
      scrollContainerRef.current?.scrollTop ?? 0;
    const threshold = scrollTop + 80;

    let active: MarkoraTocItem | null = null;

    for (const item of items) {
      const coords = view.coordsAtPos(item.from);

      if (coords && coords.top <= threshold) {
        active = item;
      } else {
        break;
      }
    }

    setActiveTocId(active?.id ?? items[0]?.id ?? null);
  }

  const maxWidthClass =
    pageWidthMode === 'wide' ? 'max-w-none' : 'max-w-[48rem]';

  return (
    <WorkspaceAssetProvider
      mode="workspace"
      rootPath={workspaceRootPath ?? null}
    >
      <div
        className="relative flex h-full min-h-0 flex-col"
        data-testid="markora-editor-root"
        key={documentKey}
      >
        <div
          className="workspace-editor-shell workspace-editor-scrollarea min-h-0 flex-1 overflow-auto"
          ref={scrollContainerRef}
          onScroll={(event) =>
            setBackToTopVisible(event.currentTarget.scrollTop > 240)
          }
        >
          <div className={`mx-auto w-full ${maxWidthClass} px-6 py-8`}>
            <CodeMirror
              ref={editorRef}
              value={markdown}
              theme={cmTheme}
              extensions={extensions}
              basicSetup={false}
              onChange={(value) => onMarkdownChange?.(value)}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key.toLowerCase() === 's'
                ) {
                  event.preventDefault();
                  onSaveRequested?.();
                }
              }}
            />
          </div>
        </div>

        {backToTopVisible ? (
          <button
            aria-label="回到顶部"
            className="absolute right-4 bottom-4 z-40 flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
            type="button"
            onClick={() => {
              scrollContainerRef.current?.scrollTo({
                behavior: 'smooth',
                top: 0,
              });
              setBackToTopVisible(false);
            }}
          >
            <ArrowUp size={15} />
          </button>
        ) : null}
      </div>
    </WorkspaceAssetProvider>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run components/editor/__tests__/markora-editor.test.tsx`
Expected: PASS。

**注意：** 若 `markora` 的 `toc.enabled: false` 时不调用 `onTocChange`，则 TOC 面板永远拿不到数据。**执行时验证：** 读 markora `table-of-contents/extension.ts`，确认 `enabled: false` 是否还触发 `onTocChange`。如果不触发，改为 `enabled: true` 但用一个隐藏容器（或 CSS 把 markora 自带的 TOC 面板 `display:none`），确保 `onTocChange` 回调仍被调用。这是 Task 7 的关键验证点，执行时必须确认。

- [ ] **Step 5: 提交**

```bash
git add components/editor/markora-editor.tsx components/editor/__tests__/markora-editor.test.tsx
git commit -m "feat: 新增 MarkoraEditor 组件（CodeMirror + markora 扩展）"
```

---

## Task 8: 切换 workspace-layout 引用 PlateEditor → MarkoraEditor

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`

- [ ] **Step 1: 替换 import 与 JSX**

在 `components/workspace/workspace-layout.tsx`：

把第 17 行：
```ts
import { PlateEditor } from '@/components/editor/plate-editor';
```
改为：
```ts
import { MarkoraEditor } from '@/components/editor/markora-editor';
```

把约 1048-1059 行的 `<PlateEditor ... />` JSX：
```tsx
<PlateEditor
  documentKey={`${workspace.documentVersion}`}
  pageWidthMode={pageWidthMode}
  value={workspace.draftDocument.value}
  variant="workspace"
  workspaceRootPath={workspace.snapshot?.rootPath ?? null}
  onSaveRequested={() => void workspace.saveCurrentDocumentNow()}
  onTocSnapshotChange={handleTocSnapshotChange}
  onValueChange={workspace.updateDocumentValue}
/>
```
改为：
```tsx
<MarkoraEditor
  documentKey={`${workspace.documentVersion}`}
  pageWidthMode={pageWidthMode}
  markdown={workspace.draftDocument.markdown}
  workspaceRootPath={workspace.snapshot?.rootPath ?? null}
  onSaveRequested={() => void workspace.saveCurrentDocumentNow()}
  onTocSnapshotChange={handleTocSnapshotChange}
  onMarkdownChange={workspace.updateMarkdown}
/>
```

- [ ] **Step 2: 修复字数统计与 documentEnvelopeForPanel**

把约 58 行：
```ts
import { countPlateDocumentCharacters } from './workspace-document-insights';
```
改为：
```ts
import { countMarkdownCharacters } from './workspace-document-insights';
```

把约 193-196 行：
```ts
const documentCharacterCount = React.useMemo(
  () => countPlateDocumentCharacters(workspace.draftDocument?.value),
  [workspace.draftDocument?.value],
);
```
改为：
```ts
const documentCharacterCount = React.useMemo(
  () => countMarkdownCharacters(workspace.draftDocument?.markdown),
  [workspace.draftDocument?.markdown],
);
```

把约 197-210 行的 `documentEnvelopeForPanel`（构造 `PlateDocumentEnvelope`）改为构造 markdown + metadata 透传给右侧面板：
```ts
const documentPanelData = React.useMemo<{
  markdown: string;
  metadata: { title: string; createdAt: string; updatedAt: string };
} | null>(() => {
  if (!workspace.draftDocument) {
    return null;
  }

  return {
    markdown: workspace.draftDocument.markdown,
    metadata: {
      title: workspace.draftDocument.metadata.title,
      createdAt: workspace.draftDocument.metadata.createdAt ?? '',
      updatedAt: workspace.draftDocument.metadata.updatedAt ?? '',
    },
  };
}, [workspace.draftDocument]);
```

把约 1077-1084 行 `RightSidePanel` 的 `documentEnvelope={documentEnvelopeForPanel}` 改为 `documentPanelData={documentPanelData}`。

- [ ] **Step 3: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: `workspace-layout.tsx` 无错。`ai-side-panel.tsx`、`document-meta-panel.tsx` 会因 `documentEnvelope` → `documentPanelData` 改名报错，下一个 task 修复。

- [ ] **Step 4: 暂不提交（与 Task 9 一起提交）**

---

## Task 9: 适配 document-meta-panel 和 ai-side-panel 到 markdown

**Files:**
- Modify: `components/workspace/document-meta-panel.tsx`
- Modify: `components/workspace/ai-side-panel.tsx`

- [ ] **Step 1: 修改 document-meta-panel props**

在 `components/workspace/document-meta-panel.tsx`：

把 import（约 1、26-34 行）中依赖 Plate 的部分删除：
```ts
import type { Value } from 'platejs';  // 删
// ...
import {
  countPlateDocumentCharacters,
  extractDocumentResourceReferences,
  type DocumentResourceReference,
} from './workspace-document-insights';
import type {
  PlateDocumentEnvelope,
  ResolvedWorkspaceAsset,
  WorkspaceNode,
} from './workspace-types';
```
改为：
```ts
import {
  countMarkdownCharacters,
  extractResourceReferencesFromMarkdown,
  type DocumentResourceReference,
} from './workspace-document-insights';
import type {
  ResolvedWorkspaceAsset,
  WorkspaceNode,
} from './workspace-types';
```

把 `DocumentMetaPanelProps`（约 38-42 行）：
```ts
interface DocumentMetaPanelProps {
  currentDocument: WorkspaceNode | null;
  documentEnvelope: PlateDocumentEnvelope | null;
  workspaceRootPath: string | null;
}
```
改为：
```ts
interface DocumentMetaPanelProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: {
    markdown: string;
    metadata: { title: string; createdAt: string; updatedAt: string };
  } | null;
  workspaceRootPath: string | null;
}
```

把组件体（约 44-57 行）：
```ts
export function DocumentMetaPanel({
  currentDocument,
  documentEnvelope,
  workspaceRootPath,
}: DocumentMetaPanelProps) {
  const resources = React.useMemo(
    () => extractDocumentResourceReferences(documentEnvelope?.content),
    [documentEnvelope?.content],
  );
  const characterCount = React.useMemo(
    () => countPlateDocumentCharacters(documentEnvelope?.content),
    [documentEnvelope?.content],
  );
```
改为：
```ts
export function DocumentMetaPanel({
  currentDocument,
  documentPanelData,
  workspaceRootPath,
}: DocumentMetaPanelProps) {
  const resources = React.useMemo(
    () => extractResourceReferencesFromMarkdown(documentPanelData?.markdown),
    [documentPanelData?.markdown],
  );
  const characterCount = React.useMemo(
    () => countMarkdownCharacters(documentPanelData?.markdown),
    [documentPanelData?.markdown],
  );
```

把 `DocumentMetaDetails` 组件（约 135-181 行）中所有 `documentEnvelope` 引用改为 `documentPanelData`，字段访问从 `documentEnvelope?.title` 改为 `documentPanelData?.metadata.title`，`documentEnvelope?.createdAt` 改为 `documentPanelData?.metadata.createdAt`，`updatedAt` 同理。把该组件的 prop 类型 `documentEnvelope: PlateDocumentEnvelope | null` 改为 `documentPanelData: DocumentMetaPanelProps['documentPanelData']`。

- [ ] **Step 2: 修改 ai-side-panel RightSidePanel props**

在 `components/workspace/ai-side-panel.tsx`：

把 import（约 28 行）`PlateDocumentEnvelope` 删除（若仅此处用）。把 `RightSidePanelProps`（约 33-47 行）的 `documentEnvelope: PlateDocumentEnvelope | null;` 改为：
```ts
documentPanelData: {
  markdown: string;
  metadata: { title: string; createdAt: string; updatedAt: string };
} | null;
```

把 `RightSidePanel`（约 49-84 行）解构里 `documentEnvelope` 改为 `documentPanelData`，传给 `<DocumentMetaPanel documentPanelData={documentPanelData} ... />`。

- [ ] **Step 3: 运行相关测试**

Run: `pnpm vitest run components/workspace/__tests__/workspace-layout.test.tsx`
Expected: PASS（若该测试断言 Plate 相关结构，适配为 markdown；执行时按报错精简）。

- [ ] **Step 4: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: `workspace-layout.tsx`、`document-meta-panel.tsx`、`ai-side-panel.tsx` 无错。剩余报错应只在 plate-editor.tsx、plugins/、ui/*-node 等待删文件里。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/document-meta-panel.tsx components/workspace/ai-side-panel.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "refactor: workspace-layout 与右侧面板切换到 MarkoraEditor + markdown 数据"
```

---

## Task 10: 删除 Plate 编辑器与插件代码

**Files:**
- Delete: `components/editor/plate-editor.tsx`、`editor-kit.tsx`、`editor-base-kit.tsx`、`plate-types.ts`、`markdown-document.ts`、`markdown-import.ts`、`transforms.ts`、`settings-dialog.tsx`、`document-toc-bridge.tsx`、`math-kit.tsx`
- Delete: `components/editor/plugins/`（整个目录）

- [ ] **Step 1: 确认无残留引用**

Run: `grep -rn "plate-editor\|editor-kit\|editor-base-kit\|plate-types\|markdown-document\|markdown-import\|components/editor/transforms\|settings-dialog\|document-toc-bridge\|components/editor/plugins" components/ app/ lib/ hooks/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"`
Expected: 应无引用（Task 8/9 已切换）。若有残留，先修复引用点再删。

**注意：** `workspace-asset-context.tsx`、`use-resolved-asset-url.ts`、`use-chat.ts` 需单独判断：
- `use-chat.ts`：检查是否依赖 Plate。Run: `grep -n "platejs\|@platejs\|Value" components/editor/use-chat.ts`。若不依赖，保留；否则本 task 一起删。
- `workspace-asset-context.tsx`：`MarkoraEditor` 仍在用它（Task 7 import 了）。Run: `grep -n "platejs\|@platejs" components/editor/workspace-asset-context.tsx`。若不依赖 Plate，保留。
- `use-resolved-asset-url.ts`：检查是否还被引用。Run: `grep -rn "use-resolved-asset-url" components/ app/`。若无引用，删；否则保留并确认不依赖 Plate。

- [ ] **Step 2: 删除文件**

```bash
git rm components/editor/plate-editor.tsx \
  components/editor/editor-kit.tsx \
  components/editor/editor-base-kit.tsx \
  components/editor/plate-types.ts \
  components/editor/markdown-document.ts \
  components/editor/markdown-import.ts \
  components/editor/transforms.ts \
  components/editor/settings-dialog.tsx \
  components/editor/document-toc-bridge.tsx \
  components/editor/math-kit.tsx
git rm -r components/editor/plugins/
```

根据 Step 1 的检查结果，决定是否额外 `git rm` `use-resolved-asset-url.ts`（若无引用）、`use-chat.ts`（若依赖 Plate）。

删除对应测试：
```bash
git rm components/editor/__tests__/plate-editor.test.tsx \
  components/editor/__tests__/markdown-document.test.ts \
  components/editor/__tests__/markdown-import.test.ts \
  components/editor/__tests__/document-toc-bridge.test.tsx \
  components/editor/__tests__/excalidraw-kit.test.ts \
  components/editor/__tests__/title-sync-utils.test.ts
```

- [ ] **Step 3: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 编辑器目录无错。剩余报错只在 `components/ui/*-node.tsx`（下个 task 处理）。

- [ ] **Step 4: 暂不提交（与 Task 11 一起提交）**

---

## Task 11: 删除 Plate UI 节点组件（逐个甄别保留通用 UI）

**Files:**
- Delete: `components/ui/` 下所有 Plate 节点与 Plate 专属组件
- Keep: 通用 UI 组件

- [ ] **Step 1: 识别 Plate 专属组件 vs 通用 UI**

Run: `grep -rln "platejs\|@platejs\|@udecode" components/ui/`
Expected: 列出所有依赖 Plate 的 UI 文件——这些是要删的。

同时列出所有 `components/ui/` 文件，与上面的列表对比，**不**依赖 Plate 的就是通用 UI（保留），例如：`button.tsx`、`popover.tsx`、`tooltip.tsx`、`calendar.tsx`、`alert-dialog.tsx`、`input-group.tsx`、`hover-card.tsx`、`resize-handle.tsx`、`toolbar.tsx`、`dropdown-menu` 相关、`theme-provider.tsx`。

- [ ] **Step 2: 删除 Plate 专属组件**

对 Step 1 列出的每个文件执行 `git rm`。典型包括：
```bash
git rm components/ui/paragraph-node-static.tsx \
  components/ui/highlight-node.tsx \
  components/ui/code-node.tsx \
  components/ui/ghost-text.tsx \
  components/ui/link-node-static.tsx \
  components/ui/excalidraw-data.ts \
  components/ui/suggestion-node.tsx \
  components/ui/floating-toolbar-buttons.tsx \
  components/ui/import-toolbar-button.tsx \
  components/ui/history-toolbar-button.tsx \
  components/ui/link-toolbar.tsx \
  components/ui/mention-node-static.tsx \
  components/ui/equation-node-static.tsx \
  components/ui/media-file-node.tsx \
  components/ui/inline-combobox.tsx \
  components/ui/blockquote-node-static.tsx \
  components/ui/block-list-static.tsx \
  components/ui/heading-node-static.tsx \
  components/ui/table-toolbar-button.tsx \
  components/ui/editor-static.tsx \
  components/ui/link-node.tsx \
  components/ui/kbd-node.tsx \
  components/ui/block-list.tsx \
  components/ui/block-context-menu.tsx \
  components/ui/code-block-node-static.tsx \
  components/ui/hr-node-static.tsx \
  components/ui/align-toolbar-button.tsx \
  components/ui/toolbar.tsx \
  components/ui/footnote-node-static.tsx \
  components/ui/code-drawing-node-static.tsx \
  components/ui/code-drawing-rendering.ts \
  components/ui/suggestion-node-static.tsx \
  components/ui/turn-into-toolbar-button.tsx \
  components/ui/fixed-toolbar.tsx \
  components/ui/editor.tsx \
  components/ui/toc-node-static.tsx \
  components/ui/blockquote-node.tsx \
  components/ui/mention-node.tsx \
  components/ui/toggle-node.tsx \
  components/ui/media-audio-node.tsx \
  components/ui/suggestion-toolbar-button.tsx \
  components/ui/column-node-static.tsx \
  components/ui/highlight-node-static.tsx \
  components/ui/media-audio-node-static.tsx \
  components/ui/equation-node.tsx \
  components/ui/emoji-node.tsx \
  components/ui/equation-toolbar-button.tsx \
  components/ui/media-image-node-static.tsx \
  components/ui/list-toolbar-button.tsx \
  components/ui/line-height-toolbar-button.tsx \
  components/ui/heading-node.tsx \
  components/ui/fixed-toolbar-buttons.tsx
```

（实际清单以 Step 1 grep 结果为准。注意 `toolbar.tsx`——确认它是否依赖 Plate；若不依赖则保留。）

- [ ] **Step 3: 检查通用 UI 是否被删除的组件引用**

Run: `pnpm tsc --noEmit 2>&1 | grep "components/ui" | head -40`
Expected: 若有通用 UI 组件（如 `button.tsx`）被已删组件引用但不被保留代码引用，可能会有"未使用"警告——不影响编译。重点看是否有"找不到模块"错误，若有说明删多了或保留了不该保留的。

- [ ] **Step 4: 删除导出层（基于 Plate value 的导出）**

```bash
git rm components/workspace/workspace-document-transfer.ts \
  components/workspace/workspace-export-archive.ts
```

检查 `workspace-layout.tsx` 是否还引用 `workspace-document-transfer` 或 `exportNode`：Run: `grep -n "exportNode\|workspace-document-transfer\|workspace-export-archive" components/workspace/*.tsx`。若有残留引用（如右键菜单的导出按钮），本步把导出按钮的 handler 改为 `toast('导出功能即将重新设计')` 或直接隐藏入口（执行时按实际调用点处理）。**设计决策：导出后续统一重做，本期删除入口。**

- [ ] **Step 5: 运行测试**

Run: `pnpm vitest run`
Expected: 剩余测试全绿。删除的测试不再运行。若有测试因引用已删模块报错，删除或适配该测试。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor: 删除全部 Plate 编辑器、插件与节点组件及导出层"
```

---

## Task 12: 清理 package.json 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 新增 markora 与 CodeMirror 依赖**

编辑 `package.json` 的 `dependencies`，新增：
```json
"@codemirror/commands": "^6.10.1",
"@codemirror/lang-markdown": "^6.5.0",
"@codemirror/language": "^6.12.1",
"@codemirror/language-data": "^6.5.2",
"@codemirror/state": "^6.5.4",
"@codemirror/view": "^6.39.11",
"@refinex/markora": "1.0.1",
"@uiw/codemirror-theme-github": "^5.0.0",
"@uiw/react-codemirror": "^4.23.0"
```

（版本号以 markora 的 peerDependencies 要求为准；执行时 `pnpm add` 让 pnpm 解析最新兼容版本。）

- [ ] **Step 2: 删除 Plate 依赖**

从 `dependencies` 删除所有 `@platejs/*`、`@udecode/cn`、`@emoji-mart/data`、`@excalidraw/excalidraw`、`html2canvas-pro`、`jszip`。

- [ ] **Step 3: 安装并更新锁文件**

Run: `pnpm install`
Expected: pnpm 重新解析依赖，更新 `pnpm-lock.yaml`，移除 Plate 相关包。

- [ ] **Step 4: 删除冗余锁文件**

Run: `rm package-lock.json`
（项目用 pnpm，npm 锁文件冗余且易误导。）

- [ ] **Step 5: 类型检查 + 构建**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: 类型检查全绿，next build 成功。若有报错，通常是遗漏的 Plate 引用——按报错点修复（回到对应文件删除 import）。

- [ ] **Step 6: 全局扫描 Plate 残留**

Run: `grep -ri "platejs\|@platejs\|@udecode" components/ app/ lib/ hooks/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: 无输出（完全清除）。若有残留，逐个清除。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml
git rm package-lock.json
git commit -m "chore: 移除 Plate 依赖，新增 markora 与 CodeMirror 依赖"
```

---

## Task 13: 集成验证与冒烟测试

**Files:**
- 无新增，全量验证

- [ ] **Step 1: 全量测试**

Run: `pnpm test:run`
Expected: 全绿。

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 无错误（warning 可接受）。

- [ ] **Step 3: 构建**

Run: `pnpm build`
Expected: 成功。

- [ ] **Step 4: 桌面端冒烟（手动，记录在 PR 描述）**

Run: `pnpm desktop:dev`
手动验证：
1. 打开工作区 → 打开 `.md` 文档 → 编辑器显示内容。
2. 编辑文本 → 800ms 后自动保存（状态栏"已保存"）→ 用外部编辑器确认磁盘文件内容变化。
3. 修改 H1 → 300ms 后文件树名称防抖更新。
4. 右侧切换到 TOC 面板 → 显示 H2-H6 标题 → 点击跳转 → 滚动后高亮当前标题。
5. 粘贴一张图片 → 写入 workspace assets 目录 → markdown 插入 `refinex-asset://` 引用 → 编辑器显示图片。
6. 切换 light/dark 主题 → 编辑器主题跟随。
7. Cmd/Ctrl+S → 触发保存。

- [ ] **Step 5: 若冒烟发现问题，回到对应 Task 修复**

常见问题预案：
- TOC 面板无数据：检查 markora `toc.enabled` 是否触发 `onTocChange`（Task 7 Step 4 注意的点）。
- 图片不显示：检查 `refinex-asset://` URL 解析（`use-resolved-asset-url.ts` 或 markora 的图片渲染是否识别这个 scheme）。
- 主题不跟随：检查 `useTheme()` 在 MarkoraEditor 内的返回值。

- [ ] **Step 6: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix: markora 编辑器集成冒烟问题修复"
```

---

## Self-Review

**1. Spec coverage（对照设计文档逐节核对）：**

| Spec 要求 | 覆盖 Task |
|---|---|
| MarkoraEditor 组件替换 PlateEditor | Task 7, 8 |
| 数据模型瘦身为纯 markdown | Task 2, 3 |
| TOC 桥重写（markora onTocChange + scrollIntoView） | Task 6, 7 |
| 附件复用 workspace-local-assets | Task 5, 7 |
| H1 ↔ 文件名同步（基于 markdown 正则） | Task 1, 3 |
| frontmatter 解析/序列化工具 | Task 1, 3 |
| 删除全部 Plate 代码 | Task 10, 11 |
| 删除 Plate 依赖 | Task 12 |
| workspace-document-insights 改 markdown | Task 4 |
| document-meta-panel 适配 | Task 9 |
| 导出功能删除（非目标） | Task 11 Step 4 |
| 测试策略 | 各 Task TDD + Task 13 |
| 验收标准 | Task 12 Step 6, Task 13 |

**2. Placeholder scan:** 已检查，无 TBD/TODO。Task 7 Step 4 有一处"执行时验证 markora toc.enabled 行为"——这是真实的集成不确定性，已明确标注验证方法和 fallback（改 enabled:true + CSS 隐藏面板），不算 placeholder。

**3. Type consistency:**
- `MarkdownDraft`（Task 2 定义）→ Task 3 `createMarkdownDraft`/`withUpdatedMarkdown` 使用 ✓
- `updateMarkdown`（Task 3）→ Task 8 `workspace.updateMarkdown` ✓
- `countMarkdownCharacters`/`extractResourceReferencesFromMarkdown`（Task 4）→ Task 9 使用 ✓
- `useWorkspaceAssetUploader`（Task 5）→ Task 7 使用 ✓
- `buildTocSnapshot`/`scrollToHeadingIn`/`DocumentTocSnapshot`（Task 6）→ Task 7 使用 ✓
- `documentPanelData`（Task 8）→ Task 9 使用 ✓
- `MarkoraEditor` props `markdown`/`onMarkdownChange`（Task 7）→ Task 8 传参 ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-markora-editor-replacement.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 task 派发独立 subagent，task 间 review，快速迭代。

**2. Inline Execution** - 在当前 session 按 task 批量执行，带 checkpoint review。

Which approach?

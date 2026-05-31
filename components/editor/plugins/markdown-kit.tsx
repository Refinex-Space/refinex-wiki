import {
  BaseFootnoteDefinitionPlugin,
  BaseFootnoteReferencePlugin,
} from '@platejs/footnote';
import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Plugin } from 'unified';

type MarkdownCodeNode = {
  lang?: string | null;
  value?: string | null;
};

type MarkdownRuleOptions = {
  editor?: {
    getType?: (key: string) => string;
  };
};

const drawingTypeToMarkdownLang: Record<string, string> = {
  Flowchart: 'flowchart',
  Graphviz: 'dot',
  Mermaid: 'mermaid',
  PlantUml: 'plantuml',
};

export function deserializeMarkdownCodeBlock(
  mdastNode: MarkdownCodeNode,
  _deco: unknown,
  options: MarkdownRuleOptions,
) {
  const lang = mdastNode.lang ?? undefined;
  const code = mdastNode.value ?? '';

  if (lang?.toLowerCase() === 'mermaid') {
    return {
      children: [{ text: '' }],
      data: {
        code,
        drawingMode: 'Both',
        drawingType: 'Mermaid',
      },
      type: getPluginType(options, KEYS.codeDrawing),
    };
  }

  return {
    children: code.split('\n').map((line) => ({
      children: [{ text: line }],
      type: getPluginType(options, KEYS.codeLine),
    })),
    lang,
    type: getPluginType(options, KEYS.codeBlock),
  };
}

export function serializeCodeDrawing(slateNode: {
  data?: {
    code?: string;
    drawingType?: string;
  };
}) {
  const drawingType = slateNode.data?.drawingType ?? 'Mermaid';

  return {
    lang: drawingTypeToMarkdownLang[drawingType] ?? drawingType.toLowerCase(),
    type: 'code',
    value: slateNode.data?.code ?? '',
  };
}

function getPluginType(options: MarkdownRuleOptions, key: string) {
  return options.editor?.getType?.(key) ?? key;
}

export const MarkdownKit = [
  BaseFootnoteReferencePlugin,
  BaseFootnoteDefinitionPlugin,
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      rules: {
        [KEYS.codeBlock]: {
          deserialize: deserializeMarkdownCodeBlock as never,
        },
        [KEYS.codeDrawing]: {
          serialize: serializeCodeDrawing as never,
        },
      },
      remarkPlugins: [
        remarkMath,
        remarkGfm,
        remarkEmoji as unknown as Plugin,
        remarkMdx,
        remarkMention,
      ],
    },
  }),
];

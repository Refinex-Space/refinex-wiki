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
  type MarkoraTocItem,
} from '@refinex/markora/editor';
import { allPlugins } from '@refinex/markora/plugins';

import {
  buildTocSnapshot,
  scrollToHeadingIn,
  type DocumentTocSnapshot,
} from '@/components/editor/markdown-toc';
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import { WorkspaceAssetProvider } from '@/components/editor/workspace-asset-context';
import type { PageWidthMode } from '@/components/workspace/workspace-types';

interface MarkdownEditorProps {
  documentKey?: string;
  markdown: string;
  pageWidthMode?: PageWidthMode;
  onSaveRequested?: () => void;
  onTocSnapshotChange?: (snapshot: DocumentTocSnapshot) => void;
  onMarkdownChange?: (markdown: string) => void;
  workspaceRootPath?: string | null;
}

const STANDARD_PAGE_WIDTH = '64rem';

export function MarkdownEditor({
  documentKey,
  markdown,
  pageWidthMode = 'wide',
  onSaveRequested,
  onTocSnapshotChange,
  onMarkdownChange,
  workspaceRootPath = null,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [tocItems, setTocItems] = React.useState<MarkoraTocItem[]>([]);
  const [activeTocId, setActiveTocId] = React.useState<string | null>(null);
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);

  const isDark = resolvedTheme === 'dark';
  const cmTheme = isDark ? githubDark : githubLight;
  const markoraTheme = isDark ? ThemeEnum.DARK : ThemeEnum.LIGHT;
  const uploader = useWorkspaceAssetUploader(workspaceRootPath ?? null);
  const frontmatterView = React.useMemo(() => {
    const parsed = parseFrontmatter(markdown);
    const entries = Object.entries(parsed.metadata);

    if (entries.length === 0) {
      return {
        body: markdown,
        entries,
        hasFrontmatter: false,
        metadata: parsed.metadata,
      };
    }

    return {
      body: parsed.body,
      entries,
      hasFrontmatter: true,
      metadata: parsed.metadata,
    };
  }, [markdown]);
  const pageWidthExtensions = React.useMemo<Extension[]>(() => {
    const contentMaxWidth =
      pageWidthMode === 'wide' ? 'none' : STANDARD_PAGE_WIDTH;

    return [
      EditorView.theme({
        '&.cm-markora .cm-scroller': {
          overflow: 'visible !important',
        },
        '&.cm-markora .cm-content': {
          maxWidth: contentMaxWidth,
          width: '100%',
        },
      }),
      EditorView.contentAttributes.of({
        style: `max-width: ${contentMaxWidth}; width: 100%;`,
      }),
    ];
  }, [pageWidthMode]);

  const handleTocChange = React.useCallback((items: MarkoraTocItem[]) => {
    setTocItems(items);

    const markoraActiveId = items.find((item) => item.active)?.id ?? null;
    setActiveTocId((currentActiveId) => {
      if (markoraActiveId) {
        return markoraActiveId;
      }

      if (
        currentActiveId &&
        items.some((item) => item.id === currentActiveId)
      ) {
        return currentActiveId;
      }

      return null;
    });
  }, []);

  // markora 的 onTocChange 会推带 active 字段的 items；
  // 用 state 存储，effect 负责发布 DocumentTocSnapshot 给右侧 TOC 面板。
  React.useEffect(() => {
    if (!onTocSnapshotChange) {
      return;
    }

    const snapshot = buildTocSnapshot(tocItems, activeTocId);
    onTocSnapshotChange({
      ...snapshot,
      scrollToHeading: (id: string) => {
        setActiveTocId(id);
        scrollToHeadingIn(
          editorRef.current?.view ?? null,
          tocItems,
          id,
          scrollContainerRef.current,
        );
      },
    });
  }, [activeTocId, onTocSnapshotChange, tocItems]);

  const handleMarkdownChange = React.useCallback(
    (value: string) => {
      if (!onMarkdownChange) {
        return;
      }

      if (!frontmatterView.hasFrontmatter) {
        onMarkdownChange(value);
        return;
      }

      onMarkdownChange(
        serializeFrontmatter({
          body: value,
          metadata: frontmatterView.metadata,
        }),
      );
    },
    [frontmatterView, onMarkdownChange],
  );

  const extensions = React.useMemo<Extension[]>(
    () =>
      markora({
        theme: markoraTheme,
        locale: 'zh-CN',
        baseStyles: true,
        plugins: allPlugins,
        extensions: pageWidthExtensions,
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
          // 不渲染 markora 内置 TOC 面板，但 onTocChange 仍会触发。
          // handleTocChange 会同步 TOC 列表与当前 active id。
          enabled: false,
          onTocChange: handleTocChange,
        },
      }),
    [handleTocChange, markoraTheme, pageWidthExtensions, uploader],
  );

  const maxWidthClass =
    pageWidthMode === 'wide' ? 'max-w-none' : 'max-w-[64rem]';

  return (
    <WorkspaceAssetProvider
      mode="workspace"
      rootPath={workspaceRootPath ?? null}
    >
      <div
        className={`workspace-editor-page-${pageWidthMode} relative flex h-full min-h-0 flex-col`}
        data-page-width-mode={pageWidthMode}
        data-testid="markdown-editor-root"
        key={documentKey}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === 's'
          ) {
            event.preventDefault();
            onSaveRequested?.();
          }
        }}
      >
        <div
          className="workspace-editor-shell workspace-editor-scrollarea min-h-0 flex-1 overflow-auto"
          ref={scrollContainerRef}
          onScroll={(event) =>
            setBackToTopVisible(event.currentTarget.scrollTop > 240)
          }
        >
          <div className={`mx-auto w-full ${maxWidthClass} px-6 py-8`}>
            {frontmatterView.hasFrontmatter ? (
              <FrontmatterPanel entries={frontmatterView.entries} />
            ) : null}
            <CodeMirror
              ref={editorRef}
              value={frontmatterView.body}
              theme={cmTheme}
              extensions={extensions}
              basicSetup={false}
              onChange={handleMarkdownChange}
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

function FrontmatterPanel({
  entries,
}: {
  entries: Array<[string, string]>;
}) {
  return (
    <section
      className="mb-6 border-b px-4 py-3"
      data-testid="markdown-frontmatter-panel"
    >
      <div className="mb-3 text-xs font-medium text-muted-foreground">
        文档元数据
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {entries.map(([key, value]) => (
          <div className="min-w-0" key={key}>
            <dt className="mb-1 text-xs text-muted-foreground">
              {key}
            </dt>
            <dd className="truncate font-medium text-foreground" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

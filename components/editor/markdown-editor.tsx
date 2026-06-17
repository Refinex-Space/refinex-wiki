'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { ArrowUp } from 'lucide-react';
import CodeMirror, {
  type Extension,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
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

export function MarkdownEditor({
  documentKey,
  markdown,
  pageWidthMode = 'standard',
  onSaveRequested,
  onTocSnapshotChange,
  onMarkdownChange,
  workspaceRootPath = null,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [tocItems, setTocItems] = React.useState<MarkoraTocItem[]>([]);
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);

  const isDark = resolvedTheme === 'dark';
  const cmTheme = isDark ? githubDark : githubLight;
  const markoraTheme = isDark ? ThemeEnum.DARK : ThemeEnum.LIGHT;
  const uploader = useWorkspaceAssetUploader(workspaceRootPath ?? null);

  // markora 的 onTocChange 会推带 active 字段的 items；
  // 用 state 存储，effect 负责发布 DocumentTocSnapshot 给右侧 TOC 面板。
  React.useEffect(() => {
    if (!onTocSnapshotChange) {
      return;
    }

    const activeId = tocItems.find((item) => item.active)?.id ?? null;
    const snapshot = buildTocSnapshot(tocItems, activeId);
    onTocSnapshotChange({
      ...snapshot,
      scrollToHeading: (id: string) =>
        scrollToHeadingIn(
          editorRef.current?.view ?? null,
          tocItems,
          id,
        ),
    });
  }, [onTocSnapshotChange, tocItems]);

  const extensions = React.useMemo<Extension[]>(
    () =>
      markora({
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
          // 不渲染 markora 内置 TOC 面板，但 onTocChange 仍会触发。
          // setTocItems 是 React state setter，安全可在渲染期创建的回调中使用。
          enabled: false,
          onTocChange: setTocItems,
        },
      }),
    [markoraTheme, uploader],
  );

  const maxWidthClass =
    pageWidthMode === 'wide' ? 'max-w-none' : 'max-w-[48rem]';

  return (
    <WorkspaceAssetProvider
      mode="workspace"
      rootPath={workspaceRootPath ?? null}
    >
      <div
        className="relative flex h-full min-h-0 flex-col"
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
            <CodeMirror
              ref={editorRef}
              value={markdown}
              theme={cmTheme}
              extensions={extensions}
              basicSetup={false}
              onChange={(value) => onMarkdownChange?.(value)}
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

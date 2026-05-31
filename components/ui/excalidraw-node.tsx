'use client';

import * as React from 'react';

import type { TExcalidrawElement } from '@platejs/excalidraw';
import type { PlateElementProps } from 'platejs/react';

import { useExcalidrawElement } from '@platejs/excalidraw/react';
import { Eye, Maximize2, Minimize2, Pencil } from 'lucide-react';
import { useTheme } from 'next-themes';
import { PlateElement, useReadOnly } from 'platejs/react';

import { Button } from '@/components/ui/button';
import { createSafeExcalidrawProps } from '@/components/ui/excalidraw-data';
import { cn } from '@/lib/utils';

import '@excalidraw/excalidraw/index.css';

export function ExcalidrawElement(
  props: PlateElementProps<TExcalidrawElement>
) {
  const { children, element } = props;
  const readOnly = useReadOnly();
  const { resolvedTheme } = useTheme();
  const [editing, setEditing] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [expandedFrame, setExpandedFrame] = React.useState<
    React.CSSProperties | undefined
  >();

  const { Excalidraw, excalidrawProps } = useExcalidrawElement({
    element,
  });
  const ExcalidrawComponent = Excalidraw;
  const safeExcalidrawProps = React.useMemo(
    () => createSafeExcalidrawProps(excalidrawProps),
    [excalidrawProps]
  );
  const excalidrawTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  React.useLayoutEffect(() => {
    if (!expanded) {
      return;
    }

    const editorBlock = document.querySelector<HTMLElement>(
      '[data-testid="workspace-editor-block"]'
    );
    const editorScroller = document.querySelector<HTMLElement>(
      '[data-testid="editor-pane-content"]'
    );
    const previousScrollerOverflow = editorScroller?.style.overflow;

    if (editorScroller) {
      editorScroller.style.overflow = 'hidden';
    }

    const updateExpandedFrame = () => {
      const rect = editorBlock?.getBoundingClientRect();

      if (!rect) {
        setExpandedFrame(undefined);
        return;
      }

      const nextFrame = {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };

      setExpandedFrame((currentFrame) => {
        if (
          currentFrame?.height === nextFrame.height &&
          currentFrame.left === nextFrame.left &&
          currentFrame.top === nextFrame.top &&
          currentFrame.width === nextFrame.width
        ) {
          return currentFrame;
        }

        return nextFrame;
      });
    };

    const animationFrame = window.requestAnimationFrame(updateExpandedFrame);

    window.addEventListener('resize', updateExpandedFrame);
    const resizeObserver = editorBlock
      ? new ResizeObserver(updateExpandedFrame)
      : null;

    if (editorBlock) {
      resizeObserver?.observe(editorBlock);
    }

    return () => {
      if (editorScroller) {
        editorScroller.style.overflow = previousScrollerOverflow ?? '';
      }

      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateExpandedFrame);
      resizeObserver?.disconnect();
    };
  }, [expanded]);

  return (
    <PlateElement {...props}>
      <div contentEditable={false}>
        <div
          className={cn(
            'group/excalidraw relative aspect-video h-[600px] w-full overflow-hidden rounded-md border bg-background',
            expanded &&
              'fixed z-50 aspect-auto h-auto w-auto rounded-lg border bg-background p-8 shadow-none'
          )}
          style={expanded ? expandedFrame : undefined}
        >
          {!readOnly && (
            <div
              className={cn(
                'absolute z-20 flex items-center gap-1 rounded-md bg-background/85 p-1 shadow-sm ring-1 ring-border backdrop-blur transition-opacity',
                expanded
                  ? 'top-3 right-3 opacity-100'
                  : 'top-2 right-2 opacity-0 group-hover/excalidraw:opacity-100'
              )}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => setEditing((value) => !value)}
                title={editing ? '切换到预览' : '切换到编辑'}
              >
                {editing ? (
                  <Eye className="size-4" />
                ) : (
                  <Pencil className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => {
                  setExpanded((value) => !value);
                  setEditing(true);
                }}
                title={expanded ? '缩小画布' : '扩大画布'}
              >
                {expanded ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            </div>
          )}

          <div className="h-full w-full overflow-hidden rounded-md">
            {ExcalidrawComponent && (
              <ExcalidrawComponent
                {...safeExcalidrawProps}
                theme={excalidrawTheme}
                viewModeEnabled={readOnly || !editing}
                zenModeEnabled={false}
                UIOptions={{
                  canvasActions: {
                    export: false,
                    loadScene: false,
                    saveAsImage: false,
                    saveToActiveFile: false,
                    toggleTheme: false,
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>
      {children}
    </PlateElement>
  );
}

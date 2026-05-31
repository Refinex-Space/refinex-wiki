'use client';

import * as React from 'react';

import type { TAudioElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { useMediaState } from '@platejs/media/react';
import { ResizableProvider } from '@platejs/resizable';
import { PlateElement, withHOC } from 'platejs/react';

import { useResolvedAssetUrl } from '@/components/editor/use-resolved-asset-url';
import { cn } from '@/lib/utils';

import { Caption, CaptionTextarea } from './caption';

export const AudioElement = withHOC(
  ResizableProvider,
  function AudioElement(props: PlateElementProps<TAudioElement>) {
    const { align = 'center', readOnly, unsafeUrl } = useMediaState();
    const resolvedUrl = useResolvedAssetUrl(
      props.element.url as string | undefined,
    );
    const sourceUrl = resolvedUrl ?? unsafeUrl;

    return (
      <PlateElement {...props} className="mb-1">
        <figure
          className="group relative cursor-default"
          contentEditable={false}
        >
          <div className={cn('h-16 rounded-sm')}>
            <audio className="size-full" src={sourceUrl} controls />
          </div>

          <Caption style={{ width: '100%' }} align={align}>
            <CaptionTextarea
              className="h-20"
              readOnly={readOnly}
              placeholder="Write a caption..."
            />
          </Caption>
        </figure>
        {props.children}
      </PlateElement>
    );
  }
);

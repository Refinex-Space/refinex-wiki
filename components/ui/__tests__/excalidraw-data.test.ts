import { describe, expect, it, vi } from 'vitest';

import {
  createSafeExcalidrawProps,
  sanitizeExcalidrawAppState,
  sanitizeExcalidrawInitialData,
} from '../excalidraw-data';

describe('Excalidraw data sanitizing', () => {
  it('removes persisted collaborators from restored app state', () => {
    expect(
      sanitizeExcalidrawInitialData({
        appState: {
          collaborators: {},
          viewBackgroundColor: '#ffffff',
        },
        elements: [],
      })
    ).toEqual({
      appState: {
        viewBackgroundColor: '#ffffff',
      },
      elements: [],
    });
  });

  it('removes collaborators before saving app state back to the document', () => {
    const appState = {
      collaborators: new Map([['socket-id', { username: 'A' }]]),
      viewBackgroundColor: '#ffffff',
    };

    expect(sanitizeExcalidrawAppState(appState)).toEqual({
      viewBackgroundColor: '#ffffff',
    });
  });

  it('wraps onChange so collaborators are never persisted', () => {
    const onChange = vi.fn();
    const props = createSafeExcalidrawProps({
      initialData: {
        appState: { collaborators: {}, viewBackgroundColor: '#ffffff' },
      },
      onChange,
    });

    props.onChange?.([], {
      collaborators: new Map(),
      viewBackgroundColor: '#eeeeee',
    } as never, {});

    expect(props.initialData).toEqual({
      appState: { viewBackgroundColor: '#ffffff' },
    });
    expect(onChange).toHaveBeenCalledWith(
      [],
      { viewBackgroundColor: '#eeeeee' },
      {}
    );
  });
});

import type { TExcalidrawProps } from '@platejs/excalidraw/react';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object';
}

export function sanitizeExcalidrawAppState<T>(appState: T): T {
  if (!isRecord(appState)) {
    return appState;
  }

  const rest = { ...appState };
  delete rest.collaborators;

  return rest as T;
}

export function sanitizeExcalidrawInitialData<T>(initialData: T): T {
  if (!isRecord(initialData)) {
    return initialData;
  }

  const appState = initialData.appState;

  if (!isRecord(appState)) {
    return initialData;
  }

  return {
    ...initialData,
    appState: sanitizeExcalidrawAppState(appState),
  };
}

export function createSafeExcalidrawProps(
  excalidrawProps: TExcalidrawProps
): TExcalidrawProps {
  const { onChange } = excalidrawProps;

  return {
    ...excalidrawProps,
    initialData: sanitizeExcalidrawInitialData(excalidrawProps.initialData),
    onChange: onChange
      ? (elements, appState, files) => {
          onChange(elements, sanitizeExcalidrawAppState(appState), files);
        }
      : undefined,
  };
}

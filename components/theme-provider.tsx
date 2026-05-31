'use client';

import * as React from 'react';

import {
  ThemeProvider as NextThemesProvider,
  useTheme,
} from 'next-themes';
import type { Color } from '@tauri-apps/api/window';

type NativeTheme = 'dark' | 'light';
type RgbaColor = [number, number, number, number];

const FALLBACK_WINDOW_BACKGROUND_BY_THEME: Record<
  NativeTheme,
  RgbaColor
> = {
  dark: [24, 24, 24, 255],
  light: [250, 250, 250, 255],
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableSystem
    >
      <TauriWindowThemeBridge />
      {children}
    </NextThemesProvider>
  );
}

function TauriWindowThemeBridge() {
  const { resolvedTheme, theme } = useTheme();

  React.useEffect(() => {
    const nativeTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

    if (!isTauriRuntime()) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const backgroundColor = getWorkspaceShellBackgroundColor(nativeTheme);

      void syncTauriWindowTheme({
        backgroundColor,
        windowTheme: theme === 'system' ? null : nativeTheme,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [resolvedTheme, theme]);

  return null;
}

async function syncTauriWindowTheme({
  backgroundColor,
  windowTheme,
}: {
  backgroundColor: Color;
  windowTheme: NativeTheme | null;
}) {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const currentWindow = getCurrentWindow();

  await currentWindow.setTheme(windowTheme);
  await currentWindow.setBackgroundColor(backgroundColor);
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getWorkspaceShellBackgroundColor(backgroundTheme: NativeTheme) {
  const workspaceShell = document.querySelector<HTMLElement>(
    '[data-testid="workspace-shell"]',
  );

  if (!workspaceShell) {
    return FALLBACK_WINDOW_BACKGROUND_BY_THEME[backgroundTheme];
  }

  const backgroundColor = workspaceShell
    ? parseCssColorToRgba(
        window.getComputedStyle(workspaceShell).backgroundColor,
      )
    : null;

  return compositeColorOverAncestorBackground(
    backgroundColor,
    workspaceShell.parentElement,
    FALLBACK_WINDOW_BACKGROUND_BY_THEME[backgroundTheme],
  );
}

function parseCssColorToRgba(color: string): RgbaColor | null {
  const rgbMatch = color.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );

  if (rgbMatch) {
    return [
      clampColor(Number(rgbMatch[1])),
      clampColor(Number(rgbMatch[2])),
      clampColor(Number(rgbMatch[3])),
      clampAlpha(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4])),
    ];
  }

  const srgbMatch = color.match(
    /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i,
  );

  if (srgbMatch) {
    return [
      clampColor(Number(srgbMatch[1]) * 255),
      clampColor(Number(srgbMatch[2]) * 255),
      clampColor(Number(srgbMatch[3]) * 255),
      clampAlpha(srgbMatch[4] === undefined ? 1 : Number(srgbMatch[4])),
    ];
  }

  return null;
}

function compositeColorOverAncestorBackground(
  color: RgbaColor | null,
  parentElement: HTMLElement | null,
  fallbackColor: RgbaColor,
): RgbaColor {
  let compositedColor = color ?? fallbackColor;
  let currentElement = parentElement;

  while (compositedColor[3] < 255 && currentElement) {
    const parentColor = parseCssColorToRgba(
      window.getComputedStyle(currentElement).backgroundColor,
    );

    if (parentColor && parentColor[3] > 0) {
      compositedColor = compositeColor(compositedColor, parentColor);
    }

    currentElement = currentElement.parentElement;
  }

  if (compositedColor[3] < 255) {
    compositedColor = compositeColor(compositedColor, fallbackColor);
  }

  return [compositedColor[0], compositedColor[1], compositedColor[2], 255];
}

function compositeColor(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const foregroundAlpha = foreground[3] / 255;
  const backgroundAlpha = background[3] / 255;
  const outputAlpha =
    foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);

  if (outputAlpha === 0) {
    return [0, 0, 0, 0];
  }

  return [
    clampColor(
      (foreground[0] * foregroundAlpha +
        background[0] * backgroundAlpha * (1 - foregroundAlpha)) /
        outputAlpha,
    ),
    clampColor(
      (foreground[1] * foregroundAlpha +
        background[1] * backgroundAlpha * (1 - foregroundAlpha)) /
        outputAlpha,
    ),
    clampColor(
      (foreground[2] * foregroundAlpha +
        background[2] * backgroundAlpha * (1 - foregroundAlpha)) /
        outputAlpha,
    ),
    clampAlpha(outputAlpha),
  ];
}

function clampColor(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function clampAlpha(value: number) {
  return clampColor(value <= 1 ? value * 255 : value);
}

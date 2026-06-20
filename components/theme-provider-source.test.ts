import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const layoutPath = join(process.cwd(), 'app/layout.tsx');
const providerPath = join(process.cwd(), 'components/theme-provider.tsx');
const tauriConfigPath = join(process.cwd(), 'src-tauri/tauri.conf.json');
const tauriCapabilityPath = join(
  process.cwd(),
  'src-tauri/capabilities/default.json',
);
const tauriLibPath = join(process.cwd(), 'src-tauri/src/lib.rs');
const workspaceLayoutPath = join(
  process.cwd(),
  'components/workspace/workspace-layout.tsx',
);

describe('theme provider source contract', () => {
  it('configures next-themes to drive Tailwind dark classes without changing the default light theme', () => {
    const layoutSource = readFileSync(layoutPath, 'utf8');
    const providerSource = readFileSync(providerPath, 'utf8');
    const tauriCapability = JSON.parse(
      readFileSync(tauriCapabilityPath, 'utf8'),
    );
    const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    const tauriLibSource = readFileSync(tauriLibPath, 'utf8');
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(providerSource).toContain("from 'next-themes'");
    expect(providerSource).toContain('attribute="class"');
    expect(providerSource).toContain('defaultTheme="light"');
    expect(providerSource).toContain('enableSystem');
    expect(providerSource).toContain("import('@tauri-apps/api/window')");
    expect(providerSource).toContain('setBackgroundColor');
    expect(providerSource).toContain("window.requestAnimationFrame");
    expect(providerSource).toContain('[data-testid="workspace-shell"]');
    expect(providerSource).toContain('getComputedStyle');
    expect(providerSource).toContain('setBackgroundColor(backgroundColor)');
    expect(providerSource).toContain('parseCssColorToRgba');
    expect(providerSource).toContain('compositeColorOverAncestorBackground');
    expect(providerSource).toContain('compositeColor');
    expect(providerSource).toContain('await currentWindow.setTheme(windowTheme)');
    expect(providerSource).toContain(
      'await currentWindow.setBackgroundColor(backgroundColor)',
    );
    expect(providerSource).toContain('setTheme');
    expect(layoutSource).toContain('suppressHydrationWarning');
    expect(layoutSource).toContain('<ThemeProvider>');
    expect(tauriConfig.app.windows[0].titleBarStyle).toBe('Overlay');
    expect(tauriConfig.app.windows[0].hiddenTitle).toBe(true);
    expect(tauriConfig.app.windows[0].dragDropEnabled).toBe(false);
    expect(tauriCapability.permissions).toContain(
      'core:window:allow-start-dragging',
    );
    expect(tauriCapability.permissions).toContain(
      'core:window:allow-minimize',
    );
    expect(tauriCapability.permissions).toContain(
      'core:window:allow-toggle-maximize',
    );
    expect(tauriCapability.permissions).toContain('core:window:allow-close');
    expect(tauriLibSource).toContain('cfg!(target_os = "windows")');
    expect(tauriLibSource).toContain('set_decorations(false)');
    expect(workspaceLayoutSource).toContain('data-tauri-drag-region="deep"');
    expect(workspaceLayoutSource).toContain(
      'workspace-titlebar-drag-region',
    );
    expect(workspaceLayoutSource).toContain('windows-titlebar-controls');
    expect(workspaceLayoutSource).toContain('flex h-8 shrink-0');
    expect(workspaceLayoutSource).not.toContain('flex h-10 shrink-0');
  });

  it('keeps web and desktop app icons sourced from the Madora asset set', () => {
    const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    const faviconPath = join(process.cwd(), 'app/favicon.ico');
    const tauriIcoPath = join(process.cwd(), 'src-tauri/icons/icon.ico');
    const madoraLogoPath = join(
      process.cwd(),
      'public/brand/madora-logo-dark.svg',
    );

    expect(readFileSync(madoraLogoPath, 'utf8')).toContain('fill="#111111"');
    expect(Buffer.compare(readFileSync(faviconPath), readFileSync(tauriIcoPath))).toBe(
      0,
    );
    for (const iconPath of tauriConfig.bundle.icon as string[]) {
      expect(existsSync(join(process.cwd(), 'src-tauri', iconPath))).toBe(true);
    }
  });
});

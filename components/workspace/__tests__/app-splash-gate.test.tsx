import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const layoutPath = join(process.cwd(), 'app/layout.tsx');
const globalsCssPath = join(process.cwd(), 'app/globals.css');
const splashGatePath = join(
  process.cwd(),
  'components/workspace/app-splash-gate.tsx',
);
const madoraLogoPath = join(
  process.cwd(),
  'public/brand/madora-logo-dark.svg',
);

describe('app splash screen', () => {
  it('renders a static Madora splash from the root layout before the workspace hydrates', () => {
    const layoutSource = readFileSync(layoutPath, 'utf8');
    const globalsCssSource = readFileSync(globalsCssPath, 'utf8');

    expect(existsSync(madoraLogoPath)).toBe(true);
    expect(layoutSource).toContain('AppSplashGate');
    expect(layoutSource).toContain('data-app-splash="active"');
    expect(layoutSource).toContain('className="app-splash"');
    expect(layoutSource).toContain('/brand/madora-logo-dark.svg');
    expect(layoutSource).toContain('先让它存在，再把它做好');
    expect(layoutSource).toContain('Make it exist first. Make it good later.');
    expect(globalsCssSource).toContain('.app-splash');
    expect(globalsCssSource).toContain('app-splash-line-flow');
    expect(globalsCssSource).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps the splash visible briefly, then marks it ready and complete', () => {
    expect(existsSync(splashGatePath)).toBe(true);

    const splashGateSource = readFileSync(splashGatePath, 'utf8');

    expect(splashGateSource).toContain('minimumVisibleMs = 600');
    expect(splashGateSource).toContain('completeAfterMs = 240');
    expect(splashGateSource).toContain(
      "document.body.dataset.appSplash = 'active'",
    );
    expect(splashGateSource).toContain(
      "document.body.dataset.appSplash = 'ready'",
    );
    expect(splashGateSource).toContain(
      "document.body.dataset.appSplash = 'complete'",
    );
  });
});

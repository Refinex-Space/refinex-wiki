import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from '../workspace-settings';

describe('workspace settings', () => {
  it('includes default font settings for UI, document and code text', () => {
    expect(DEFAULT_APP_SETTINGS.appearance.fonts).toEqual({
      code: 'JetBrains Mono',
      document: 'Songti SC',
      ui: 'SF Pro Text',
    });
  });

  it('normalizes legacy appearance settings with default fonts', () => {
    expect(
      withDefaultAppSettings({
        appearance: {
          pageWidthMode: 'standard',
        },
      }).appearance,
    ).toEqual({
      fonts: DEFAULT_APP_SETTINGS.appearance.fonts,
      pageWidthMode: 'standard',
    });
  });
});

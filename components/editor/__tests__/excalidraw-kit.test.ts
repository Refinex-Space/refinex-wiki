import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const editorKitPath = join(process.cwd(), 'components/editor/editor-kit.tsx');

describe('ExcalidrawKit', () => {
  it('registers the Excalidraw plugin in the editor kit', () => {
    const source = readFileSync(editorKitPath, 'utf8');

    expect(source).toContain(
      "import { ExcalidrawKit } from '@/components/editor/plugins/excalidraw-kit';"
    );
    expect(source).toContain('...ExcalidrawKit,');
  });
});

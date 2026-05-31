import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const excalidrawNodePath = join(process.cwd(), 'components/ui/excalidraw-node.tsx');

describe('ExcalidrawElement source contract', () => {
  it('uses the full document width instead of the upstream fixed width', () => {
    const source = readFileSync(excalidrawNodePath, 'utf8');

    expect(source).toContain('w-full');
    expect(source).not.toContain('w-[min(100%,600px)]');
  });

  it('supports preview/edit mode and expanded editor controls', () => {
    const source = readFileSync(excalidrawNodePath, 'utf8');

    expect(source).toContain("import { useTheme } from 'next-themes';");
    expect(source).toContain('const { resolvedTheme } = useTheme();');
    expect(source).toContain(
      "const excalidrawTheme = resolvedTheme === 'dark' ? 'dark' : 'light';"
    );
    expect(source).toContain('theme={excalidrawTheme}');
    expect(source).toContain('toggleTheme: false');
    expect(source).toContain('const [editing, setEditing]');
    expect(source).toContain('const [expanded, setExpanded]');
    expect(source).toContain('viewModeEnabled={readOnly || !editing}');
    expect(source).toContain('Maximize2');
    expect(source).toContain('Minimize2');
    expect(source).toContain('Pencil');
    expect(source).toContain('Eye');
  });

  it('sizes expanded editing to the workspace editor block', () => {
    const source = readFileSync(excalidrawNodePath, 'utf8');

    expect(source).not.toContain('fixed inset-4');
    expect(source).toContain('[data-testid="workspace-editor-block"]');
    expect(source).toContain('getBoundingClientRect');
    expect(source).toContain('style={expanded ? expandedFrame : undefined}');
    expect(source).toContain('[data-testid="editor-pane-content"]');
    expect(source).toContain("editorScroller.style.overflow = 'hidden'");
    expect(source).toContain('previousScrollerOverflow');
    expect(source).toContain('p-8');
    expect(source).toContain('h-full w-full overflow-hidden rounded-md');
    expect(source).toContain("expanded\n                  ? 'top-3 right-3 opacity-100'");
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentTabBar } from '../document-tab-bar';
import type { DocumentEditorGroup } from '../document-tabs';

function group(): DocumentEditorGroup {
  return {
    activeTabPath: '/repo/b.md',
    id: 'group-1',
    tabs: [
      { absolutePath: '/repo/a.md', name: 'a.md', title: 'A' },
      { absolutePath: '/repo/b.md', name: 'b.md', title: 'B' },
      { absolutePath: '/repo/c.md', name: 'c.md', title: 'C' },
    ],
  };
}

describe('DocumentTabBar', () => {
  it('selects and closes tabs', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <DocumentTabBar
        group={group()}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={onCloseTab}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={onSelectTab}
        onSplitTab={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: '关闭标签页 B' }));

    expect(onSelectTab).toHaveBeenCalledWith('group-1', '/repo/a.md');
    expect(onCloseTab).toHaveBeenCalledWith('group-1', '/repo/b.md');
  });

  it('shows context menu actions', async () => {
    const user = userEvent.setup();
    const onCloseOtherTabs = vi.fn();
    const onSplitTab = vi.fn();

    render(
      <DocumentTabBar
        group={group()}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={vi.fn()}
        onSplitTab={onSplitTab}
      />,
    );

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('tab', { name: /B/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '关闭其他标签页' }));
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('tab', { name: /B/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '向右拆分' }));

    expect(onCloseOtherTabs).toHaveBeenCalledWith('group-1', '/repo/b.md');
    expect(onSplitTab).toHaveBeenCalledWith('group-1', '/repo/b.md', 'right');
  });

  it('moves overflowed tabs into the more menu', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(
      <DocumentTabBar
        group={group()}
        visibleTabLimit={2}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={onSelectTab}
        onSplitTab={vi.fn()}
      />,
    );

    expect(screen.queryByRole('tab', { name: /C/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '显示更多打开的文档' }));
    await user.click(await screen.findByRole('menuitem', { name: 'C' }));

    expect(onSelectTab).toHaveBeenCalledWith('group-1', '/repo/c.md');
  });
});

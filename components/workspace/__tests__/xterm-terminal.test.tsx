import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { XtermTerminal } from '../xterm-terminal';

const terminalTestState = vi.hoisted(() => ({
  disposeMock: vi.fn(),
  fitMock: vi.fn(),
  loadAddonMock: vi.fn(),
  onDataMock: vi.fn(),
  openMock: vi.fn(),
  resizeMock: vi.fn(),
  terminalInstances: [] as Array<{
    cols: number;
    rows: number;
    options: Record<string, unknown>;
  }>,
  writeMock: vi.fn(),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function TerminalMock(options) {
    const instance = {
      cols: 120,
      dispose: terminalTestState.disposeMock,
      loadAddon: terminalTestState.loadAddonMock,
      onData: terminalTestState.onDataMock,
      open: terminalTestState.openMock,
      options,
      resize: terminalTestState.resizeMock,
      rows: 32,
      write: terminalTestState.writeMock,
    };

    terminalTestState.terminalInstances.push(instance);

    return instance;
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddonMock() {
    return {
    fit: terminalTestState.fitMock,
    };
  }),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(function WebLinksAddonMock() {
    return {};
  }),
}));

describe('XtermTerminal', () => {
  afterEach(() => {
    terminalTestState.disposeMock.mockReset();
    terminalTestState.fitMock.mockReset();
    terminalTestState.loadAddonMock.mockReset();
    terminalTestState.onDataMock.mockReset();
    terminalTestState.openMock.mockReset();
    terminalTestState.resizeMock.mockReset();
    terminalTestState.terminalInstances.length = 0;
    terminalTestState.writeMock.mockReset();
  });

  it('opens xterm, binds input, writes output, and cleans up', async () => {
    const onData = vi.fn();
    const onResize = vi.fn();
    const { rerender, unmount } = render(
      <XtermTerminal
        isActive
        output="hello"
        sessionId="term-1"
        themeMode="light"
        onData={onData}
        onResize={onResize}
      />,
    );

    await waitFor(() =>
      expect(terminalTestState.openMock).toHaveBeenCalledTimes(1),
    );
    expect(terminalTestState.loadAddonMock).toHaveBeenCalledTimes(2);
    expect(terminalTestState.writeMock).toHaveBeenCalledWith('hello');

    const dataHandler = terminalTestState.onDataMock.mock.calls[0][0] as (
      value: string,
    ) => void;
    dataHandler('pwd\r');
    expect(onData).toHaveBeenCalledWith('term-1', 'pwd\r');

    rerender(
      <XtermTerminal
        isActive
        output="helloworld"
        sessionId="term-1"
        themeMode="dark"
        onData={onData}
        onResize={onResize}
      />,
    );
    expect(terminalTestState.writeMock).toHaveBeenCalledWith('world');
    expect(terminalTestState.terminalInstances[0].options.theme).toBeTruthy();

    unmount();
    expect(terminalTestState.disposeMock).toHaveBeenCalledTimes(1);
  });

  it('uses a dark terminal background when theme mode is dark', async () => {
    render(
      <XtermTerminal
        isActive
        output=""
        sessionId="term-dark"
        themeMode="dark"
        onData={vi.fn()}
        onResize={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(terminalTestState.openMock).toHaveBeenCalledTimes(1),
    );
    expect(terminalTestState.terminalInstances[0].options.theme).toEqual(
      expect.objectContaining({
        background: '#0a0a0a',
        foreground: '#ededed',
      }),
    );
    expect(terminalTestState.terminalInstances[0].options.screenReaderMode).toBe(
      false,
    );
  });
});

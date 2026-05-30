import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { H2Element } from '../heading-node';

vi.mock('platejs/react', () => ({
  PlateElement: ({
    as = 'div',
    attributes,
    children,
    className,
  }: {
    as?: string;
    attributes?: Record<string, unknown>;
    children?: React.ReactNode;
    className?: string;
  }) => React.createElement(as, { ...attributes, className }, children),
}));

describe('HeadingElement', () => {
  it('does not add a highlight background when it is the navigation target', () => {
    render(
      React.createElement(
        H2Element as React.ComponentType<Record<string, unknown>>,
        {
          attributes: { 'data-nav-target': 'true' },
          element: { id: 'heading-a' },
        },
        '目标标题',
      ),
    );

    expect(screen.getByRole('heading', { name: '目标标题' }).className).not.toMatch(
      /data-\[nav-target=true\]:(bg|rounded)/,
    );
  });
});

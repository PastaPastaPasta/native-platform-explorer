import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EpochNav } from '../EpochNav';

const href = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href');

describe('epoch navigation', () => {
  it('links to neighbours and the history ending at this epoch', () => {
    render(<EpochNav index={41} currentIndex={50} />);
    expect(href('Epoch #40')).toMatch(/\/epoch\/detail\/?\?index=40$/);
    expect(href('Epoch #42')).toMatch(/\/epoch\/detail\/?\?index=42$/);
    expect(href('Epoch history')).toMatch(/\/epoch\/history\/?\?to=41$/);
  });

  it('sends "next" from the last finished epoch to the current epoch page', () => {
    render(<EpochNav index={49} currentIndex={50} />);
    expect(href('Current epoch #50')).toMatch(/\/epoch\/?$/);
  });

  it('has no next link on the current epoch and no previous link on epoch 0', () => {
    const { unmount } = render(<EpochNav index={50} currentIndex={50} />);
    expect(screen.queryByRole('link', { name: /Epoch #51|Current/ })).not.toBeInTheDocument();
    unmount();
    render(<EpochNav index={0} />);
    expect(screen.queryByRole('link', { name: 'Epoch #-1' })).not.toBeInTheDocument();
    expect(href('Epoch #1')).toMatch(/index=1$/);
  });
});

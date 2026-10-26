import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SecretInput } from '../SecretInput';

describe('SecretInput', () => {
  it.each([false, true])(
    'is a masked text field password managers skip (multiline: %s)',
    (multiline) => {
      renderWithProviders(
        multiline ? (
          <SecretInput multiline aria-label="Secret" value="" onChange={() => {}} />
        ) : (
          <SecretInput aria-label="Secret" value="" onChange={() => {}} />
        ),
      );
      const field = screen.getByRole('textbox', { name: 'Secret' });
      // A password field would let the browser offer to save the key.
      expect(field).not.toHaveAttribute('type', 'password');
      expect(field).toHaveAttribute('autocomplete', 'off');
      expect(field).toHaveAttribute('spellcheck', 'false');
      expect(field).toHaveAttribute('data-1p-ignore');
      expect(field).toHaveAttribute('data-lpignore', 'true');
    },
  );

  it('toggles showing the value', () => {
    renderWithProviders(<SecretInput aria-label="Secret" value="" onChange={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'Show Secret' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent('Hide');
  });

  it('falls back to a password field where CSS masking is unsupported', () => {
    vi.stubGlobal('CSS', { supports: () => false });
    try {
      renderWithProviders(<SecretInput aria-label="Secret" value="" onChange={() => {}} />);
      expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
      fireEvent.click(screen.getByRole('button', { name: 'Show Secret' }));
      expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'text');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

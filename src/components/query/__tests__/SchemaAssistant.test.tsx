import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { parseSql } from '@util/sql-parser';
import { SchemaAssistant } from '../SchemaAssistant';

vi.mock('@sdk/queries', () => ({
  useContract: () => ({
    data: {
      documents: {
        rewardShare: {
          properties: { group: { type: 'integer' } },
          indices: [{ name: 'group', properties: [{ group: 'asc' }] }],
        },
        order: {
          properties: { group: { type: 'integer' } },
          indices: [{ name: 'group', properties: [{ group: 'asc' }] }],
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

describe('Schema query suggestions', () => {
  it('preserves a quoted built-in alias and quotes reserved document and field names', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SchemaAssistant
        contractId="selected"
        sql={'SELECT * FROM `masternode-rewards`.rewardShare'}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use document type' }));
    expect(parseSql(onChange.mock.calls[0]![0] as string)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    fireEvent.change(screen.getByLabelText('Schema document type'), { target: { value: 'order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use index ordering' }));
    const parsed = parseSql(onChange.mock.calls.at(-1)![0] as string);
    expect(parsed).toEqual(
      expect.objectContaining({
        ok: true,
        query: expect.objectContaining({
          contractAlias: 'masternode-rewards',
          from: 'order',
          orderBy: [{ field: 'group', direction: 'asc' }],
        }),
      }),
    );
  });
});

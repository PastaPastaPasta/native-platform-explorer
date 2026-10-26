import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AggregateResults, type AggregateResultsProps } from '../AggregateResults';

/** Integer index keys are big-endian with the sign bit flipped. */
function intKey(n: number): string {
  return (BigInt(n) + (1n << 63n)).toString(16).padStart(16, '0');
}

const base: AggregateResultsProps = {
  kind: 'count',
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

describe('AggregateResults', () => {
  it('flags a GROUP BY result that reached its limit and suggests the next range', () => {
    const data = new Map([[intKey(20251), 4n], [intKey(20252), 7n]]);
    renderWithProviders(
      <AggregateResults
        {...base}
        groupBy={['semester']}
        groupBySchemas={[{ type: 'integer' }]}
        groupLimit={2}
        rangeGroupField="semester"
        data={data}
      />,
    );
    expect(screen.getByText('2+ groups')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the first 2 groups: the limit of 2 was reached, so more groups may exist. Aggregates have no page cursor. To continue, filter on semester > 20252 instead of the current lower bound.',
    );
    expect(screen.getByText('20252')).toBeInTheDocument();
  });

  it('does not flag results below the limit, and suggests < for descending order', () => {
    const data = new Map([[intKey(5), 1n]]);
    const { unmount } = renderWithProviders(
      <AggregateResults {...base} groupBy={['n']} groupBySchemas={[{ type: 'integer' }]} groupLimit={100} rangeGroupField="n" data={data} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('1 group')).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <AggregateResults {...base} groupBy={['n']} groupBySchemas={[{ type: 'integer' }]} groupLimit={1} rangeGroupField="n" descending data={data} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('filter on n < 5 instead of the current upper bound');
  });

  it('labels a compound GROUP BY by the field the SDK keeps', () => {
    const data = new Map([['4353313031', { count: 2n, sum: 180n }]]);
    renderWithProviders(
      <AggregateResults
        {...base}
        kind="avg"
        aggregateField="score"
        groupBy={['semester', 'class']}
        groupBySchemas={[{ type: 'integer' }, { type: 'string' }]}
        data={data}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'class' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /semester/ })).not.toBeInTheDocument();
    expect(screen.getByText(/totalled across every/)).toHaveTextContent(
      'One row per class value, totalled across every semester value in the filter.',
    );
    expect(screen.getByText('CS101')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });
});

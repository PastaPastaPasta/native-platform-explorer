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
        groupBound={{ limit: 2, entriesPerGroup: 1 }}
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
      <AggregateResults {...base} groupBy={['n']} groupBySchemas={[{ type: 'integer' }]} groupBound={{ limit: 100, entriesPerGroup: 1 }} rangeGroupField="n" data={data} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('1 group')).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <AggregateResults {...base} groupBy={['n']} groupBySchemas={[{ type: 'integer' }]} groupBound={{ limit: 1, entriesPerGroup: 1 }} rangeGroupField="n" descending data={data} />,
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

  it('never flags IN groups, which the IN list bounds', () => {
    const data = new Map(['CS101', 'CS202', 'MATH150', 'MATH250', 'PHYS200', 'BIO110', 'ENG101'].map((c) => [Buffer.from(c).toString('hex'), 3n]));
    renderWithProviders(<AggregateResults {...base} groupBy={['class']} groupBySchemas={[{ type: 'string' }]} data={data} />);
    expect(screen.getByText('7 groups')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('flags merged compound groups when the IN values can fill the pair limit', () => {
    const data = new Map([[intKey(20251), 4n], [intKey(20252), 7n]]);
    const props = { ...base, groupBy: ['class', 'semester'], groupBySchemas: [{ type: 'string' }, { type: 'integer' }], rangeGroupField: 'semester', data };
    const { unmount } = renderWithProviders(<AggregateResults {...props} groupBound={{ limit: 5, entriesPerGroup: 3 }} />);
    expect(screen.getByText('2+ groups')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Platform returns at most 5 (class, semester) pairs before the SDK merges them, so these 2 groups may be incomplete. Aggregates have no page cursor. Narrow the WHERE filter to see the rest.',
    );
    unmount();
    renderWithProviders(<AggregateResults {...props} groupBound={{ limit: 7, entriesPerGroup: 3 }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('explains a GROUP BY that came back as one total', () => {
    // Testnet answer for COUNT(*) WHERE class IN ('CS101','CS202') AND semester > 20241 GROUP BY class.
    renderWithProviders(<AggregateResults {...base} groupBy={['class']} groupBySchemas={[{ type: 'string' }]} data={new Map([['', 42n]])} />);
    expect(screen.getByRole('note')).toHaveTextContent('This GROUP BY came back as one total instead of a row per class value');
    expect(screen.getByText('(all)')).toBeInTheDocument();
  });
});

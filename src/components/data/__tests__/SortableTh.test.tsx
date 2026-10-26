import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, Tbody, Td, Thead, Tr } from '@chakra-ui/react';
import { compareValues, SortableTh, useSortedRows, useSortState } from '../SortableTh';

const rows = [
  { name: 'b', amount: 5n },
  { name: 'a', amount: 20n },
  { name: 'c', amount: 5n },
];

function Holders() {
  const { sort, toggle } = useSortState<'name' | 'amount'>({ key: 'amount', direction: 'desc' });
  const sorted = useSortedRows(rows, sort, { name: (r) => r.name, amount: (r) => r.amount });
  return (
    <Table>
      <Thead>
        <Tr>
          <SortableTh column="name" sort={sort} onSort={toggle}>Name</SortableTh>
          <SortableTh column="amount" sort={sort} onSort={toggle} firstDirection="desc">Amount</SortableTh>
        </Tr>
      </Thead>
      <Tbody>{sorted.map((r) => <Tr key={r.name}><Td>{r.name}</Td></Tr>)}</Tbody>
    </Table>
  );
}

const order = () => screen.getAllByRole('cell').map((c) => c.textContent);

describe('sortable table headers', () => {
  it('compares strings, numbers and bigints', () => {
    expect(compareValues('a', 'b')).toBeLessThan(0);
    expect(compareValues(10n, 9n)).toBeGreaterThan(0);
    expect(compareValues(1, 1)).toBe(0);
  });

  it('sorts stably, flips direction, and announces the state', () => {
    render(<Holders />);
    expect(order()).toEqual(['a', 'b', 'c']); // ties keep input order
    const amount = screen.getByRole('columnheader', { name: /Amount/ });
    expect(amount).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(screen.getByRole('button', { name: /Amount/ }));
    expect(order()).toEqual(['b', 'c', 'a']);
    expect(amount).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(amount).toHaveAttribute('aria-sort', 'none');
  });
});

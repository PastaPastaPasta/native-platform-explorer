'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button, Th, type TableColumnHeaderProps } from '@chakra-ui/react';
import { TriangleDownIcon, TriangleUpIcon } from '@chakra-ui/icons';

export type SortDirection = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/** Plain sort state for a table: clicking the active column flips the
 *  direction, clicking another column sorts it with that column's default. */
export function useSortState<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = (key: K, firstDirection: SortDirection = 'asc') => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: firstDirection });
  };
  return { sort, toggle };
}

export type Comparable = string | number | bigint;

export function compareValues(a: Comparable, b: Comparable): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable sort by one accessor per column. */
export function useSortedRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  accessors: Record<K, (row: T) => Comparable>,
): T[] {
  return useMemo(() => {
    const read = accessors[sort.key];
    const sign = sort.direction === 'asc' ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => sign * compareValues(read(a.row), read(b.row)) || a.index - b.index)
      .map(({ row }) => row);
    // Accessors are module-level or stable per render; sort and rows drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort.key, sort.direction]);
}

/** A table header that sorts its column. Announces the state via aria-sort. */
export function SortableTh<K extends string>({
  column,
  sort,
  onSort,
  children,
  firstDirection = 'asc',
  ...rest
}: {
  column: K;
  sort: SortState<K>;
  onSort: (key: K, firstDirection?: SortDirection) => void;
  children: ReactNode;
  firstDirection?: SortDirection;
} & Omit<TableColumnHeaderProps, 'children'>) {
  const active = sort.key === column;
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = active && sort.direction === 'desc' ? TriangleDownIcon : TriangleUpIcon;
  return (
    <Th aria-sort={ariaSort} {...rest}>
      <Button
        variant="unstyled"
        size="xs"
        height="auto"
        minW={0}
        display="inline-flex"
        alignItems="center"
        gap={1}
        fontSize="inherit"
        fontWeight="inherit"
        letterSpacing="inherit"
        textTransform="inherit"
        color="inherit"
        onClick={() => onSort(column, firstDirection)}
      >
        {children}
        <Icon boxSize="8px" opacity={active ? 1 : 0.3} aria-hidden />
      </Button>
    </Th>
  );
}

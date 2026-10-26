import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { parseSql } from '@util/sql-parser';
import { errorCaret, SqlEditor } from '../SqlEditor';

describe('errorCaret', () => {
  it('points at the offending line and column of multi-line SQL', () => {
    const sql = "SELECT *\nFROM domain\nWHERE label != 'x'";
    expect(errorCaret(sql, sql.indexOf('!='))).toEqual({ line: 3, column: 13, text: "WHERE label != 'x'", caret: '            ^' });
  });

  it('copies tabs so the caret aligns, and handles the end of input', () => {
    expect(errorCaret('SELECT *\n\tFROM', 10).caret).toBe('\t^');
    expect(errorCaret('SELECT * FROM', 13)).toEqual({ line: 1, column: 14, text: 'SELECT * FROM', caret: `${' '.repeat(13)}^` });
    expect(errorCaret('a\r\nb', 3)).toMatchObject({ line: 2, column: 1, text: 'b' });
  });
});

describe('SqlEditor', () => {
  it('renders the caret under the error on its own line', () => {
    const sql = "SELECT *\nFROM domain\nWHERE label != 'x'";
    const parsed = parseSql(sql);
    if (parsed.ok) throw new Error('expected a parse error');
    renderWithProviders(<SqlEditor value={sql} onChange={vi.fn()} onRun={vi.fn()} parseError={parsed} />);
    expect(screen.getByText('Line 3, column 13')).toBeInTheDocument();
    expect(screen.getByTestId('sql-error-caret').textContent).toBe("WHERE label != 'x'\n            ^");
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryPresets, TESTNET_GRADES_CONTRACT_ID } from '../QueryPresets';

describe('QueryPresets', () => {
  it('labels the aggregates as testnet and runs them against the testnet grades contract', () => {
    const onSelect = vi.fn();
    render(<ChakraProvider><QueryPresets onSelect={onSelect} /></ChakraProvider>);
    expect(screen.getByText('Aggregates (testnet grades contract)')).toBeInTheDocument();
    expect(screen.queryByText(/paloma/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'grades: global COUNT' }));
    expect(onSelect).toHaveBeenCalledWith('SELECT COUNT(*) FROM grade', TESTNET_GRADES_CONTRACT_ID);
    expect(TESTNET_GRADES_CONTRACT_ID).toBe('7DiE1W5YYgUXx7s68YTMGEM9UssZ5TFg7dXdGaDj8cet');
  });
});

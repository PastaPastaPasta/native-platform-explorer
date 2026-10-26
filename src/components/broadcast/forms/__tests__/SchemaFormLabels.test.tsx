import { fireEvent, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaForm } from '../SchemaForm';

describe('SchemaForm field labels', () => {
  it('names each field input after its property', () => {
    const onChange = vi.fn();
    const schema = {
      type: 'object',
      properties: { title: { type: 'string' }, count: { type: 'integer' }, tags: { type: 'object', properties: { label: { type: 'string' } } } },
      required: ['title'],
    };
    render(<ChakraProvider><SchemaForm schema={schema} value={{}} onChange={onChange} /></ChakraProvider>);
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenLastCalledWith({ title: 'hello' });
    expect(screen.getByLabelText('count')).toBeInTheDocument();
    expect(screen.getByLabelText('label')).toBeInTheDocument();
  });
});

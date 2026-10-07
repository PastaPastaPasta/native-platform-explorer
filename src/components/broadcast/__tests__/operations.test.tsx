import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { findOperationById } from '../operations';

function expectLink(name: string, path: string, query: Record<string, string>) {
  const link = screen.getByRole('link', { name });
  const url = new URL(link.getAttribute('href')!, 'https://explorer.invalid');
  expect(url.pathname.replace(/\/$/, '')).toBe(path);
  expect(Object.fromEntries(url.searchParams)).toEqual(query);
}

describe('operation result navigation', () => {
  it('keeps contract details and document creation links after registration', () => {
    const renderer = findOperationById('contract.register')!.descriptor.renderResult;
    expect(renderer).toBeDefined();
    renderWithProviders(<>{renderer!({
      kind: 'contractRegister',
      contractId: 'contract-1',
      ownerId: 'owner-1',
      version: 1,
      documentTypes: ['note'],
    })}</>);

    expectLink('Open contract', '/contract', { id: 'contract-1' });
    expectLink('Create a note →', '/broadcast', { op: 'document.create', contract: 'contract-1', type: 'note' });
  });

  it('keeps the created document and repeat creation links', () => {
    const renderer = findOperationById('document.create')!.descriptor.renderResult;
    expect(renderer).toBeDefined();
    renderWithProviders(<>{renderer!({
      kind: 'document',
      action: 'create',
      contractId: 'contract-1',
      documentType: 'note',
      documentId: 'document-1',
      ownerId: 'owner-1',
    })}</>);

    expectLink('Open document', '/contract/document', { id: 'contract-1', type: 'note', docId: 'document-1' });
    expectLink('Create another', '/broadcast', { op: 'document.create', contract: 'contract-1', type: 'note' });
  });
});

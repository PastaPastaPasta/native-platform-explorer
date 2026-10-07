import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { OperationReceipt } from '../OperationReceipt';

function expectLink(name: string, path: string, query: Record<string, string>) {
  const link = screen.getByRole('link', { name });
  const url = new URL(link.getAttribute('href')!, 'https://explorer.invalid');
  expect(url.pathname.replace(/\/$/, '')).toBe(path);
  expect(Object.fromEntries(url.searchParams)).toEqual(query);
}

describe('operation receipt navigation', () => {
  it('keeps contract details and document creation links after registration', () => {
    renderWithProviders(
      <OperationReceipt
        title="Register a contract"
        network="testnet"
        trusted={false}
        identityId="owner-1"
        submittedAt="2026-10-07T09:00:00Z"
        entities={{ contractId: 'contract-1' }}
        result={{
          kind: 'contractRegister',
          contractId: 'contract-1',
          ownerId: 'owner-1',
          version: 1,
          documentTypes: ['note'],
        }}
      />,
    );

    expectLink('Open contract', '/contract', { id: 'contract-1', network: 'testnet' });
    expectLink('Create a note →', '/broadcast', {
      op: 'document.create',
      contract: 'contract-1',
      type: 'note',
      network: 'testnet',
    });
  });

  it('keeps the created document and repeat creation links', () => {
    renderWithProviders(
      <OperationReceipt
        title="Create a document"
        network="testnet"
        trusted={false}
        identityId="owner-1"
        submittedAt="2026-10-07T09:00:00Z"
        entities={{ contractId: 'contract-1', documentType: 'note', documentId: 'document-1' }}
        result={{
          kind: 'document',
          action: 'create',
          contractId: 'contract-1',
          documentType: 'note',
          documentId: 'document-1',
          ownerId: 'owner-1',
        }}
      />,
    );

    expectLink('Open document', '/contract/document', {
      id: 'contract-1',
      type: 'note',
      docId: 'document-1',
      network: 'testnet',
    });
    expectLink('Create another', '/broadcast', {
      op: 'document.create',
      contract: 'contract-1',
      type: 'note',
      network: 'testnet',
    });
  });
});

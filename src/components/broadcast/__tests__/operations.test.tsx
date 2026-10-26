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

  it('links the addresses and identity of a form-signed operation without a signer', () => {
    renderWithProviders(
      <OperationReceipt
        title="Top up an identity from a Platform address"
        network="testnet"
        trusted
        identityId={null}
        submittedAt="2026-10-26T09:00:00Z"
        entities={{ identityId: 'identity-2', addresses: ['tdash1abc', 'tdash1def'] }}
      />,
    );
    expect(screen.getByText('Signed with keys entered in the form')).toBeInTheDocument();
    expectLink('Open identity', '/identity', { id: 'identity-2', network: 'testnet' });
    expectLink('Open address tdash1abc…', '/address', { addr: 'tdash1abc', network: 'testnet' });
    expectLink('Open address tdash1def…', '/address', { addr: 'tdash1def', network: 'testnet' });
  });

  it('links a raw broadcast to its state transition', () => {
    renderWithProviders(
      <OperationReceipt
        title="Broadcast a signed state transition"
        network="testnet"
        trusted
        identityId={null}
        submittedAt="2026-10-26T09:00:00Z"
        entities={{}}
        result={{ kind: 'raw', stateTransitionHash: 'ab'.repeat(32) }}
      />,
    );
    expectLink('Open state transition', '/state-transition', {
      hash: 'ab'.repeat(32),
      network: 'testnet',
    });
    expect(screen.queryByRole('link', { name: 'Open identity' })).not.toBeInTheDocument();
  });

  it('links the token and the affected identity and shows the proved balance change', () => {
    renderWithProviders(
      <OperationReceipt
        title="Destroy frozen funds"
        network="testnet"
        trusted
        identityId="owner-1"
        submittedAt="2026-10-26T09:00:00Z"
        entities={{ identityId: 'owner-1', contractId: 'contract-1', tokenId: 'token-1', targetIdentityId: 'holder-1' }}
        result={{
          kind: 'token',
          action: 'destroyFrozen',
          tokenId: 'token-1',
          balancesProvedAtHeight: '646775',
          balances: [{ identityId: 'holder-1', before: '500000000', after: '0', display: '5 → 0 npetok' }],
        }}
      />,
    );
    expectLink('Open token', '/token', { id: 'token-1', network: 'testnet' });
    expectLink('Open affected identity', '/identity', { id: 'holder-1', network: 'testnet' });
    expectLink('Open contract', '/contract', { id: 'contract-1', network: 'testnet' });
    const balances = screen.getByRole('status', { name: 'Token balance change' });
    expect(balances).toHaveTextContent('Token balances (proved at block 646775)');
    expect(balances).toHaveTextContent('holder-1: 5 → 0 npetok');
  });
});

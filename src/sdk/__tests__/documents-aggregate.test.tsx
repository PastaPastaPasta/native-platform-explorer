import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQueryProofStore } from '@contexts/QueryProofStore';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { useDocumentsAggregate, type AggregateKind, type DocumentsQueryParams } from '../queries';

const params: DocumentsQueryParams = {
  dataContractId: 'contract',
  documentTypeName: 'grade',
  where: [['class', 'in', ['CS101', 'MATH150']]],
  groupBy: ['class'],
};
const grouped = new Map([['4353313031', { count: 3n, sum: 270n }], ['4d415448313530', { count: 1n, sum: 70n }]]);
const proof = { grovedbProof: new Uint8Array([1, 2, 3]), quorumHash: new Uint8Array([4]), signature: new Uint8Array([5]), round: 0, blockIdHash: new Uint8Array([6]), quorumType: 6 };

function Probe({ kind, field }: { kind: AggregateKind; field?: string }) {
  const query = useDocumentsAggregate(params, kind, field, 'run-1');
  const entry = useQueryProofStore().entries[0];
  const data = query.data
    ? Array.from(query.data, ([k, v]) => `${k}=${typeof v === 'bigint' ? v : `${v.count}/${v.sum}`}`).join(',')
    : '';
  return (
    <>
      <div data-testid="state">{query.status}:{data}:{query.proofState.kind}</div>
      <div data-testid="entry">{entry ? `${entry.methodName}:${entry.hasProofVariant}:${entry.proof?.grovedbProof.length ?? 0}:${JSON.stringify(entry.methodParams)}` : ''}</div>
    </>
  );
}

describe('useDocumentsAggregate', () => {
  it('verifies trusted aggregates through the facade proof variant and captures the proof', async () => {
    const averageWithProof = vi.fn().mockResolvedValue({ data: grouped, proof, metadata: { height: 9 } });
    const average = vi.fn();
    const sdk = createMockSdk({ documents: { average, averageWithProof } });
    renderWithProviders(<Probe kind="avg" field="score" />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:4353313031=3/270,4d415448313530=1/70:verified'));
    expect(averageWithProof).toHaveBeenCalledWith(params, 'score');
    expect(average).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry')).toHaveTextContent(
      'documents.average:true:3:{"dataContractId":"contract","documentTypeName":"grade","where":[["class","in",["CS101","MATH150"]]],"groupBy":["class"],"averageProperty":"score"}',
    );
  });

  it.each([
    ['count', undefined, 'count', [params]],
    ['sum', 'score', 'sum', [params, 'score']],
  ] as const)('uses the plain facade %s method without trusted mode', async (kind, field, method, args) => {
    const plain = vi.fn().mockResolvedValue(new Map([['', 4n]]));
    const withProof = vi.fn();
    const sdk = createMockSdk({ documents: { [method]: plain, [`${method}WithProof`]: withProof } });
    renderWithProviders(<Probe kind={kind} field={field} />, { sdk: { sdk, trusted: false } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:=4:unverified-trusted-off'));
    expect(plain).toHaveBeenCalledWith(...args);
    expect(withProof).not.toHaveBeenCalled();
  });
});

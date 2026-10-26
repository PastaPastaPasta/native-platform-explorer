import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProofExplainer } from '../ProofExplainer';
import { MAX_DRAWN_DEPTH, ProofTreeView } from '../ProofTreeView';
import { proofText } from './proof-fixtures';

const DESC = proofText('testnet-dpns-domain-desc');

function stat(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'p' }).previousElementSibling?.textContent;
}

function merkLayer(ops: string[]): string {
  return ['GroveDBProofV1 {', '  LayerProof {', '    proof: Merk(', ...ops.map((op, i) => `      ${i}: ${op}`), '  }', '}'].join('\n');
}

describe('ProofExplainer', () => {
  it('counts PushInverted data items and every combine op of a real descending proof', () => {
    renderWithProviders(<ProofExplainer text={DESC} />);
    const combineLines = DESC.split('\n').filter((l) => /^\d+: (Parent|Child|ParentInverted|ChildInverted)\)*$/.test(l.trim()));
    expect(combineLines.length).toBe(36);
    expect(stat('combine ops')).toBe(String(combineLines.length));
    expect(stat('layers')).toBe('11');
    expect(stat('data items')).toBe('3');
    expect(screen.getByText(/'domain' \(document type\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Tree incomplete or malformed/)).not.toBeInTheDocument();
  });

  it('flags layers whose tree cannot be reconstructed', () => {
    renderWithProviders(<ProofExplainer text={merkLayer(['Push(Hash(HASH[aa]))', 'Parent'])} />);
    expect(screen.getByText('Tree incomplete or malformed (1 issue).')).toBeInTheDocument();
  });
});

describe('ProofTreeView', () => {
  it('draws every layer of a real descending proof without a malformed notice', () => {
    const { container } = renderWithProviders(<ProofTreeView text={DESC} />);
    expect(screen.getByText('Layer 11')).toBeInTheDocument();
    expect(screen.queryByText(/could not be fully reconstructed/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('svg text').length).toBeGreaterThan(0);
    const badges = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent ?? '');
    expect(badges.filter((b) => b.startsWith('TARGET'))).toHaveLength(3);
  });

  it('draws a real sum-tree proof and labels nodes with their sums', () => {
    const { container } = renderWithProviders(<ProofTreeView text={proofText('testnet-release-range-sum')} />);
    expect(screen.queryByText(/could not be fully reconstructed/)).not.toBeInTheDocument();
    const texts = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent ?? '');
    expect(texts).toContain('sum=2');
    expect(texts).toContain('sum=1');
    const titles = Array.from(container.querySelectorAll('svg title')).map((t) => t.textContent ?? '');
    expect(titles.find((t) => t.includes('HashWithSum'))).toMatch(/kv hash: +13b1c739[\s\S]*sum: +1$/);
  });

  it('shows an incomplete-tree notice for a malformed layer', () => {
    renderWithProviders(<ProofTreeView text={merkLayer(['Push(Hash(HASH[aa]))', 'Push(Hash(HASH[bb]))', 'Child', 'Child)'])} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 layer could not be fully reconstructed');
    expect(screen.getByText(/Incomplete or malformed tree/)).toBeInTheDocument();
    expect(screen.getByText('Op 3 (Child) needs two nodes but the stack holds 1.')).toBeInTheDocument();
  });

  it('summarizes a pathologically deep chain instead of overflowing the stack', () => {
    const ops = ['Push(Hash(HASH[00]))'];
    for (let i = 0; i < 40_000; i++) ops.push('Push(KVHash(HASH[11]))', 'Parent');
    renderWithProviders(<ProofTreeView text={merkLayer(ops)} />);
    expect(screen.getByText(new RegExp(`too large to draw \\(more than ${MAX_DRAWN_DEPTH} levels deep\\)`))).toBeInTheDocument();
  });

  it('makes KVValueHashFeatureTypeWithChildHash nodes expandable', () => {
    const text = [
      'LayerProof {',
      '  proof: Merk(',
      '    0: Push(KVValueHashFeatureTypeWithChildHash(counts, CountTree(00, 7), HASH[aa], ProvableCountedMerkNode(7), HASH[bb])))',
      '  lower_layers: {',
      '    counts => {',
      '      LayerProof {',
      '        proof: Merk(',
      '          0: Push(KV(k, Item(0x01))))',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const { container } = renderWithProviders(<ProofTreeView text={text} />);
    const badges = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent ?? '');
    expect(badges).toContain('DESCEND #0  ▾');
    expect(screen.getByText('Layer 2')).toBeInTheDocument();
  });
});

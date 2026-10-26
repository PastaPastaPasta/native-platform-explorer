import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { normaliseContract } from '@util/contract';
import { ContractHistoryTimeline } from '../ContractHistoryTimeline';
import { ContractGroupsTab, groupRows } from '../ContractGroupsTab';
import { ContractInternalTab } from '../ContractInternalTab';
import { SchemaNavigator } from '../SchemaNavigator';
import { DocumentHistorySection, documentRevisions } from '../DocumentHistorySection';
import { DocumentsFiltersPanel } from '../DocumentsFiltersPanel';
import { getIndicesForType } from '@util/schema';

const CONTRACT = 'EJ3pTnDkFJ7gWqY1H2fy7i81kKvfxg3pgFdM4u8cRFtv';
const A = '35SD29sWhmKEeQt1h87B2yXQVvBPDhevUYeubpAwGEow';
const B = 'AQV2G2Egvqk8jwDBAcpngjKYcwAkck8Cecs5AjYJxfvW';

const schemas = {
  issue: {
    type: 'object',
    properties: { title: { type: 'string', maxLength: 100 }, owner: { type: 'array', byteArray: true, contentMediaType: 'application/x.dash.dpp.identifier' } },
    required: ['title'],
    indices: [{ name: 'byTitle', properties: [{ title: 'asc' }], unique: true }],
  },
  comment: { type: 'object', properties: { body: { type: 'string' } } },
};

describe('SchemaNavigator', () => {
  it('lists document types with properties and indices and narrows the JSON to a selection', () => {
    renderWithProviders(<SchemaNavigator schemas={schemas} />);
    const nav = screen.getByRole('navigation', { name: 'Document types' });
    expect(within(nav).getByText('issue')).toBeVisible();
    expect(within(nav).getByText('identifier')).toBeVisible();
    expect(within(nav).getByText('byTitle: title')).toBeVisible();
    fireEvent.click(within(nav).getByRole('button', { name: /^title\*?/ }));
    expect(screen.getByText('issue.title')).toBeVisible();
    expect(screen.getByText(/"maxLength": 100/)).toBeInTheDocument();
    expect(screen.queryByText(/"comment"/)).toBeNull();
  });
});

describe('ContractHistoryTimeline', () => {
  it('shows versions newest first, each diffed against the previous one', () => {
    const history = new Map<bigint, unknown>([
      [1780000000000n, { version: 1, documentSchemas: { issue: { type: 'object', properties: { title: { type: 'string' } } } } }],
      [1790000000000n, { version: 2, documentSchemas: { issue: { type: 'object', properties: { title: { type: 'string', maxLength: 64 } } } }, keywords: ['git'] }],
    ]);
    renderWithProviders(<ContractHistoryTimeline history={history} />);
    const items = within(screen.getByRole('list', { name: 'Contract versions' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Version 2')).toBeVisible();
    expect(within(items[0]!).getByText('latest stored')).toBeVisible();
    expect(within(items[0]!).getByText('2 added · 0 removed · 0 changed')).toBeVisible();
    expect(within(items[0]!).getByText('documentSchemas.issue.properties.title.maxLength')).toBeVisible();
    expect(within(items[0]!).getByText('keywords')).toBeVisible();
    expect(within(items[1]!).getByText('initial stored version')).toBeVisible();
  });

  it('says so when nothing is stored', () => {
    renderWithProviders(<ContractHistoryTimeline history={new Map()} />);
    expect(screen.getByText(/no stored versions/)).toBeVisible();
  });
});

describe('ContractInternalTab', () => {
  it('shows format, config flags, keywords and description with the JSON behind a disclosure', () => {
    const contract = normaliseContract({
      $formatVersion: '1',
      version: 2,
      config: { $formatVersion: '1', canBeDeleted: false, readonly: false, keepsHistory: true, requiresIdentityEncryptionBoundedKey: null, sizedIntegerTypes: true },
      keywords: ['usd', 'stable'],
      description: 'A stablecoin',
    });
    renderWithProviders(<ContractInternalTab contract={contract} />);
    expect(screen.getAllByText('v1')).toHaveLength(2);
    expect(screen.getByText('A stablecoin')).toBeVisible();
    expect(screen.getByText('stable')).toBeVisible();
    const table = screen.getByRole('table', { name: 'Contract configuration' });
    const row = within(table).getByText('Keeps every contract version').closest('tr')!;
    expect(within(row).getByText('yes')).toBeVisible();
    expect(within(table).getAllByText('not required')).toHaveLength(2);
    expect(screen.queryByText(/"keepsHistory"/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Full contract JSON' }));
    expect(screen.getByText(/"keepsHistory": true/)).toBeInTheDocument();
  });
});

describe('ContractGroupsTab', () => {
  it('parses groupsDataContracts and links each group to its detail page', async () => {
    const group = Object.create({ members: new Map([[A, 1], [B, 2]]), requiredPower: 2 });
    const data = new Map([[CONTRACT, new Map([[0, group]])]]);
    expect(groupRows(data, CONTRACT)).toEqual([
      { position: 0, members: [{ id: B, power: 2 }, { id: A, power: 1 }], requiredPower: 2 },
    ]);
    const sdk = createMockSdk({
      group: {
        groupsDataContracts: vi.fn().mockResolvedValue(data),
        groupsDataContractsWithProof: vi.fn().mockResolvedValue({ data }),
      },
    });
    renderWithProviders(<ContractGroupsTab contractId={CONTRACT} />, { sdk: { sdk } });
    const table = await screen.findByRole('table', { name: 'Contract groups' });
    expect(within(table).getByText('#0')).toBeVisible();
    expect(within(table).getByText('of 3 total')).toBeVisible();
    expect(within(table).getByRole('link', { name: 'Actions' }).getAttribute('href')).toMatch(
      new RegExp(`^/groups/detail/?\\?contractId=${CONTRACT}&position=0&network=testnet$`),
    );
  });
});

describe('DocumentHistorySection', () => {
  it('explains when the document type keeps no history, without querying', () => {
    const history = vi.fn();
    renderWithProviders(<DocumentHistorySection contractId={CONTRACT} type="note" docId={A} keepsHistory={false} />, {
      sdk: { sdk: createMockSdk({ documents: { history, historyWithProof: history } }) },
    });
    expect(screen.getByText(/does not keep history/)).toBeVisible();
    expect(history).not.toHaveBeenCalled();
  });

  it('lists revisions newest first with property changes', async () => {
    const doc = (revision: bigint, title: string) => Object.create({ revision, ownerId: A, properties: { title } });
    const data = new Map<bigint, unknown>([[1784000000000n, doc(1n, 'first')], [1785000000000n, doc(2n, 'second')]]);
    expect(documentRevisions(data).map((r) => r.revision)).toEqual(['1', '2']);
    const sdk = createMockSdk({ documents: { history: vi.fn().mockResolvedValue(data), historyWithProof: vi.fn().mockResolvedValue({ data }) } });
    renderWithProviders(<DocumentHistorySection contractId={CONTRACT} type="issue" docId={A} keepsHistory />, { sdk: { sdk } });
    expect(await screen.findByText('Revision 2')).toBeVisible();
    expect(screen.getByText('latest')).toBeVisible();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'changed title: first → second')).toBeVisible();
    expect(screen.getByText('Oldest stored revision.')).toBeVisible();
  });

  it('pages by block time within Platform’s 10-revision limit and diffs across the page boundary', async () => {
    const doc = (revision: number) => Object.create({ revision: BigInt(revision), ownerId: A, properties: { n: revision } });
    const at = (i: number) => 1784000000000n + BigInt(i);
    const all = Array.from({ length: 12 }, (_, i) => [at(i), doc(i + 1)] as const);
    const history = vi.fn(async (q: { startAtMs: number; limit: number }) =>
      new Map(all.filter(([t]) => Number(t) > q.startAtMs).slice(0, q.limit)));
    const sdk = createMockSdk({ documents: { history, historyWithProof: vi.fn(async (q: { startAtMs: number; limit: number }) => ({ data: await history(q) })) } });
    renderWithProviders(<DocumentHistorySection contractId={CONTRACT} type="issue" docId={A} keepsHistory />, { sdk: { sdk } });
    expect(await screen.findByText('Revision 10')).toBeVisible();
    expect(screen.queryByText('latest')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('Revision 12')).toBeVisible();
    expect(screen.getByText('latest')).toBeVisible();
    // Revision 11 is diffed against revision 10 from the previous page.
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'changed n: 10 → 11')).toBeVisible();
    expect(screen.queryByText('Oldest stored revision.')).toBeNull();
    const calls = [...history.mock.calls.map((c) => c[0])];
    expect(calls.at(-1)).toMatchObject({ startAtMs: Number(at(9)), limit: 10 });
  });
});

describe('DocumentsFiltersPanel', () => {
  const docSchema = {
    properties: { normalizedParentDomainName: { type: 'string' }, normalizedLabel: { type: 'string' } },
    indices: [{ name: 'parentNameAndLabel', properties: [{ normalizedParentDomainName: 'asc' }, { normalizedLabel: 'asc' }] }],
  };

  it('edits filter rows and order locally and applies them together', () => {
    const onApply = vi.fn();
    renderWithProviders(
      <DocumentsFiltersPanel
        docSchema={docSchema}
        indices={getIndicesForType(docSchema)}
        filters={[['normalizedParentDomainName', '==', 'dash']]}
        orderBy={null}
        errors={[]}
        warnings={[]}
        limit={25}
        onApply={onApply}
        onLimitChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }));
    fireEvent.change(screen.getByLabelText('Filter 2 field'), { target: { value: 'normalizedLabel' } });
    fireEvent.change(screen.getByLabelText('Filter 2 operator'), { target: { value: 'startsWith' } });
    fireEvent.change(screen.getByLabelText('Filter 2 value'), { target: { value: 'al' } });
    fireEvent.change(screen.getByLabelText('Order by field'), { target: { value: 'normalizedLabel' } });
    fireEvent.change(screen.getByLabelText('Order direction'), { target: { value: 'desc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(
      [['normalizedParentDomainName', '==', 'dash'], ['normalizedLabel', 'startsWith', 'al']],
      ['normalizedLabel', 'desc'],
    );
  });

  it('shows query errors with the available indices', () => {
    renderWithProviders(
      <DocumentsFiltersPanel
        docSchema={docSchema}
        indices={getIndicesForType(docSchema)}
        filters={[]}
        orderBy={null}
        derivedOrderBy={['normalizedLabel', 'asc']}
        errors={['No index starts with `normalizedLabel`.']}
        warnings={[]}
        limit={25}
        onApply={vi.fn()}
        onLimitChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No index starts with `normalizedLabel`.');
    expect(screen.getByRole('status')).toHaveTextContent('parentNameAndLabel: normalizedParentDomainName, normalizedLabel');
    expect(screen.getByRole('option', { name: 'auto (normalizedLabel)' })).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSigner } from '@/signer/SignerProvider';
import { renderWithProviders } from '@/test/render';
import { writeModeEnabled } from '@/config';
import { SidebarNavBody } from '@components/layout/SidebarRail';
import { ContractLanding } from '@components/contract/ContractLanding';
import { TokenWriteActions } from '@components/token/TokenWriteActions';
import { SdkReference } from '@components/sdk-reference/SdkReference';
import { CONTRACT_ID, OWNER, TOKEN_ID, contractObject } from '@components/broadcast/tokens/__tests__/fixtures';
import ContractPage from '@/app/contract/page';
import { WriteActions } from '../WriteActions';

const nav = vi.hoisted(() => ({ params: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));
vi.mock('@/signer/SignerProvider', () => ({ useSigner: vi.fn() }));
const balances = vi.hoisted(() => vi.fn(() => ({ data: new Map() })));
vi.mock('@sdk/queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTokenIdentityBalances: balances,
  useContract: () => ({
    isLoading: false,
    isError: false,
    data: {
      id: CONTRACT_ID,
      ownerId: OWNER,
      version: 1,
      documentSchemas: { note: { type: 'object', properties: { body: { type: 'string', position: 0 } }, additionalProperties: false } },
    },
  }),
  useContractHistory: () => ({ data: undefined }),
}));

// The owner's reconnect hint is set, so every owner-gated action would show
// in a build with write mode on.
vi.mocked(useSigner).mockReturnValue({
  connect: vi.fn(),
  disconnect: vi.fn(),
  clearStash: vi.fn(),
  signer: null,
  stash: { kind: 'mnemonic', identityId: OWNER },
});

function writeLinks() {
  return screen.queryAllByRole('link').filter((link) => /^\/(broadcast|wallet)\/?(\?|$)/.test(link.getAttribute('href') ?? ''));
}

describe.each([
  ['enabled', 'false', true],
  ['disabled', 'true', false],
])('write mode %s', (_, flag, enabled) => {
  afterEach(() => vi.unstubAllEnvs());
  const setFlag = () => vi.stubEnv('NEXT_PUBLIC_DISABLE_WRITE_MODE', flag);

  it(enabled ? 'reports write mode on' : 'reports write mode off', () => {
    setFlag();
    expect(writeModeEnabled()).toBe(enabled);
  });

  it(enabled ? 'links the Write group in the sidebar' : 'drops the Write group from the sidebar', () => {
    setFlag();
    render(<ChakraProvider><SidebarNavBody /></ChakraProvider>);
    expect(screen.getByRole('link', { name: 'Query' })).toBeInTheDocument();
    expect(screen.queryByText('Write') !== null).toBe(enabled);
    expect(writeLinks().map((l) => l.textContent)).toEqual(enabled ? ['Broadcast', 'Wallet'] : []);
  });

  it(enabled ? 'shows owner shortcuts and vote links' : 'hides owner shortcuts and vote links', () => {
    setFlag();
    renderWithProviders(
      <WriteActions
        links={[
          { op: 'contract.update', label: 'Update contract', ownsTo: OWNER },
          { op: 'voting.castVote', label: 'Vote on this contest' },
        ]}
      />,
    );
    expect(writeLinks()).toHaveLength(enabled ? 2 : 0);
  });

  it(enabled ? 'shows the token Actions row' : 'hides the token Actions row without reading balances', () => {
    setFlag();
    balances.mockClear();
    renderWithProviders(
      <TokenWriteActions tokenId={TOKEN_ID} contractId={CONTRACT_ID} position={0} contract={contractObject()} forSale />,
    );
    expect(writeLinks().length > 0).toBe(enabled);
    expect(balances.mock.calls.length > 0).toBe(enabled);
  });

  it(enabled ? 'offers contract register, create and update' : 'offers no contract write shortcuts', () => {
    setFlag();
    const landing = renderWithProviders(<ContractLanding />);
    expect(screen.queryByRole('link', { name: /Register a new contract/ }) !== null).toBe(enabled);
    landing.unmount();
    nav.params = `id=${CONTRACT_ID}&tab=documents`;
    renderWithProviders(<NuqsTestingAdapter searchParams={nav.params}><ContractPage /></NuqsTestingAdapter>);
    const labels = writeLinks().map((l) => l.textContent);
    expect(labels).toEqual(enabled ? ['Create a document', 'Update contract', '+ new'] : []);
    nav.params = '';
  });

  it(enabled ? 'links the write pages in the SDK reference' : 'lists the write pages in the SDK reference without links', () => {
    setFlag();
    render(<ChakraProvider><SdkReference /></ChakraProvider>);
    expect(screen.getByRole('heading', { name: '/broadcast/' })).toBeInTheDocument();
    expect(writeLinks().length > 0).toBe(enabled);
  });
});

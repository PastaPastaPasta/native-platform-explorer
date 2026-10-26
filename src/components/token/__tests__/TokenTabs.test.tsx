import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { TokenOverview } from '../TokenOverview';
import { TokenBalanceLookup } from '../TokenBalanceLookup';

const signer = vi.hoisted(() => ({ current: null as { identityId: string } | null }));
vi.mock('@/signer/SignerProvider', () => ({ useSigner: () => ({ signer: signer.current }) }));

const OWNER = '3sL6q6eVCR6y8Ld6Gr14cedhJWNBPmBp3S5VtRcckxzE';
const HOLDER = 'DTFPLKMVbnkVQWEfkxHX7Ch62ytjvbtqH6eG1TF3nMbD';
const TOKEN = '8RsBCPSDUwWMnvLTDooh7ZcfZmnRb5tecsagsrdAFrrd';

const rule = (authorized: unknown) => ({
  authorizedToMakeChange: authorized,
  adminActionTakers: 'NoOne',
  changingAuthorizedActionTakersToNoOneAllowed: false,
  changingAdminActionTakersToNoOneAllowed: false,
  selfChangingAdminActionTakersAllowed: false,
});

// Shape of a live testnet token configuration (rc.2 `toJSON()`).
const config = {
  conventions: { decimals: 2, localizations: { en: { singularForm: 'Coin', pluralForm: 'Coins' } } },
  baseSupply: 100000,
  maxSupply: null,
  startAsPaused: false,
  allowTransferToFrozenBalance: true,
  keepsHistory: { keepsTransferHistory: true, keepsMintingHistory: false },
  manualMintingRules: rule('ContractOwner'),
  emergencyActionRules: rule({ Identity: OWNER }),
  mainControlGroup: null,
  mainControlGroupCanBeModified: 'NoOne',
  distributionRules: {
    perpetualDistribution: {
      distributionType: { BlockBasedDistribution: { interval: 100, function: { FixedAmount: { amount: 5 } } } },
      distributionRecipient: 'ContractOwner',
    },
    preProgrammedDistribution: { distributions: { '1700000000000': { [HOLDER]: 250 } } },
    newTokensDestinationIdentity: OWNER,
    mintingAllowChoosingDestination: false,
  },
  marketplaceRules: { tradeMode: 'NotTradeable', tradeModeChangeRules: rule('NoOne') },
};

function Url({ children, onUrlUpdate }: { children: ReactNode; onUrlUpdate?: (e: UrlUpdateEvent) => void }) {
  return <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} hasMemory>{children}</NuqsTestingAdapter>;
}

describe('TokenOverview', () => {
  it('renders distribution, control and marketplace rules instead of JSON', () => {
    renderWithProviders(<TokenOverview config={config} decimals={2} totalSupply={123456n} />, {
      sdk: { sdk: createMockSdk() },
    });
    expect(screen.getByText('1,234.56')).toBeVisible();
    expect(screen.getByText('1,000')).toBeVisible();
    expect(screen.getByText('no limit')).toBeVisible();
    expect(screen.getByText(/Fixed: 5 per interval/)).toBeVisible();
    expect(screen.getByText(/every 100 blocks/)).toBeVisible();
    const schedule = screen.getByRole('table', { name: 'Pre-programmed distribution' });
    expect(within(schedule).getByText('2.5')).toBeVisible();
    expect(within(schedule).getByText('released')).toBeVisible();
    const rules = screen.getByRole('table', { name: 'Change-control rules' });
    expect(within(rules).getByText('Mint')).toBeVisible();
    expect(within(rules).getByText('Contract owner')).toBeVisible();
    expect(screen.getByText('Not tradeable on the marketplace')).toBeVisible();
    expect(screen.getByText('Mints — not kept')).toBeVisible();
    expect(screen.queryByText(/"authorizedToMakeChange"/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Raw token configuration' }));
    expect(screen.getByText(/"authorizedToMakeChange"/)).toBeInTheDocument();
  });
});

describe('TokenBalanceLookup', () => {
  function sdkWith() {
    const moment = Object.create({ type: 'BlockBasedMoment', blockHeight: 4200n, timestampMs: undefined, epochIndex: undefined });
    const frozen = Object.create({ isFrozen: true });
    const tokens = {
      identityBalances: vi.fn().mockResolvedValue(new Map([[TOKEN, 1234n]])),
      identityBalancesWithProof: vi.fn().mockResolvedValue({ data: new Map([[TOKEN, 1234n]]) }),
      identityTokenInfos: vi.fn().mockResolvedValue(new Map([[TOKEN, frozen]])),
      identityTokenInfosWithProof: vi.fn().mockResolvedValue({ data: new Map([[TOKEN, frozen]]) }),
      perpetualDistributionLastClaim: vi.fn().mockResolvedValue(moment),
      perpetualDistributionLastClaimWithProof: vi.fn().mockResolvedValue({ data: moment }),
    };
    return { sdk: createMockSdk({ tokens }), tokens };
  }

  it('defaults to the connected signer identity without modifying the signer', async () => {
    signer.current = { identityId: HOLDER };
    const { sdk, tokens } = sdkWith();
    renderWithProviders(<Url><TokenBalanceLookup tokenId={TOKEN} decimals={2} hasPerpetualDistribution /></Url>, { sdk: { sdk } });
    expect(await screen.findByText('12.34')).toBeVisible();
    expect(screen.getByText("Showing the connected signer's identity.")).toBeVisible();
    expect(await screen.findByText('frozen')).toBeVisible();
    expect(await screen.findByText('block 4200')).toBeVisible();
    const calls = [...tokens.identityBalances.mock.calls, ...tokens.identityBalancesWithProof.mock.calls];
    expect(calls[0]).toEqual([HOLDER, [TOKEN]]);
  });

  it('looks up an entered identity, keeps it in the URL and skips the claim without perpetual distribution', async () => {
    signer.current = null;
    const { sdk, tokens } = sdkWith();
    const onUrlUpdate = vi.fn();
    renderWithProviders(
      <Url onUrlUpdate={onUrlUpdate}><TokenBalanceLookup tokenId={TOKEN} decimals={0} hasPerpetualDistribution={false} /></Url>,
      { sdk: { sdk } },
    );
    expect(screen.getByText(/connect a signer/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Identity ID for balance lookup'), { target: { value: OWNER } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('1,234')).toBeVisible();
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('holder')).toBe(OWNER);
    expect(screen.getByText('Token has no perpetual distribution.')).toBeVisible();
    expect(tokens.perpetualDistributionLastClaim).not.toHaveBeenCalled();
    expect(tokens.perpetualDistributionLastClaimWithProof).not.toHaveBeenCalled();
  });
});

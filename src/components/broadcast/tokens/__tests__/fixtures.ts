// Token fixtures in the evo-sdk 5.0 `DataContract.toJSON()` shape, recorded
// from the testnet contract registered for the live token-write tests.
import { tokenModelFromContract, type TokenModel } from '../model';
import type { TokenSnapshot } from '../state';

export const OWNER = 'ARJDcyfBJFVvWhVZaX4DhwswABWXjHKDWRnzyNT4CpTa';
export const MEMBER = '7ysNPVoaVZvHWAC7hGn3EmYsbyzizfu8a9Teq3zF6atm';
export const STRANGER = 'HJDxtN6FJF3U3T9TMLWCqudfJ5VRkaUrxTsRp36djXAG';
export const CONTRACT_ID = '8vLiDsbJXzJUjHGmgrGMw1VQryLW8Tsc8Mn2PaXq6FBt';
export const TOKEN_ID = '5DunBnakFSFb2y6rSxRvP73xqVNYTDT6fceqzLSL4Ej4';
export const ACTION_ID = 'G2fcXsGMCutSfxGs2qwfpNYpdrm2X4iLsenpFFQ4vHib';

const takers = (type: string, extra: Record<string, unknown> = {}) => ({ $type: type, ...extra });
export const rules = (authorized: unknown = takers('contractOwner'), admin: unknown = takers('contractOwner'), flags = true) => ({
  $formatVersion: '0',
  authorizedToMakeChange: authorized,
  adminActionTakers: admin,
  changingAuthorizedActionTakersToNoOneAllowed: flags,
  changingAdminActionTakersToNoOneAllowed: flags,
  selfChangingAdminActionTakersAllowed: flags,
});

export function tokenConfig(overrides: Record<string, unknown> = {}, distribution: Record<string, unknown> = {}) {
  return {
    $formatVersion: '0',
    conventions: {
      $formatVersion: '0',
      localizations: { en: { $formatVersion: '0', shouldCapitalize: false, singularForm: 'npetok', pluralForm: 'npetoks' } },
      decimals: 8,
    },
    conventionsChangeRules: rules(),
    baseSupply: 100_000_000_000,
    maxSupply: 100_000_000_000_000,
    keepsHistory: { $formatVersion: '0' },
    startAsPaused: false,
    allowTransferToFrozenBalance: true,
    maxSupplyChangeRules: rules(takers('mainGroup')),
    distributionRules: {
      $formatVersion: '0',
      perpetualDistribution: {
        $formatVersion: '0',
        distributionType: { $type: 'blockBasedDistribution', interval: 5, function: { $type: 'fixedAmount', amount: 100_000_000 } },
        distributionRecipient: { $type: 'contractOwner' },
      },
      perpetualDistributionRules: rules(),
      preProgrammedDistribution: null,
      newTokensDestinationIdentity: OWNER,
      newTokensDestinationIdentityRules: rules(),
      mintingAllowChoosingDestination: true,
      mintingAllowChoosingDestinationRules: rules(),
      changeDirectPurchasePricingRules: rules(),
      ...distribution,
    },
    marketplaceRules: { $formatVersion: '0', tradeMode: 'NotTradeable', tradeModeChangeRules: rules() },
    manualMintingRules: rules(),
    manualBurningRules: rules(),
    freezeRules: rules(),
    unfreezeRules: rules(),
    destroyFrozenFundsRules: rules(),
    emergencyActionRules: rules(),
    mainControlGroup: 0,
    mainControlGroupCanBeModified: takers('contractOwner'),
    description: 'native-platform-explorer token write tests',
    ...overrides,
  };
}

export function contractJson(config: Record<string, unknown> = tokenConfig()) {
  return {
    $formatVersion: '1',
    id: CONTRACT_ID,
    ownerId: OWNER,
    version: 1,
    documentSchemas: {},
    groups: { 0: { $formatVersion: '0', members: { [OWNER]: 1, [MEMBER]: 1 }, requiredPower: 2 } },
    tokens: { 0: config },
  };
}

/** A fetched contract: the SDK's DataContract exposes the JSON through toJSON(). */
export function contractObject(config?: Record<string, unknown>) {
  const json = contractJson(config);
  return { id: CONTRACT_ID, ownerId: OWNER, version: 1, toJSON: () => json };
}

export function model(config?: Record<string, unknown>): TokenModel {
  return tokenModelFromContract(contractObject(config), { tokenId: TOKEN_ID, contractId: CONTRACT_ID, position: 0 });
}

export function snapshot(overrides: Partial<TokenSnapshot> = {}, config?: Record<string, unknown>): TokenSnapshot {
  return {
    model: model(config),
    paused: false,
    totalSupply: 101_300_000_000n,
    holders: {
      [OWNER]: { exists: true, balance: 101_150_000_000n, frozen: false },
      [MEMBER]: { exists: true, balance: 150_000_000n, frozen: false },
    },
    nowMs: 1_793_006_500_493,
    height: 646_800n,
    ...overrides,
  };
}

export const base = {
  tokenId: TOKEN_ID,
  contractId: CONTRACT_ID,
  tokenPosition: 0,
  signerId: OWNER,
  decimals: 8,
  tokenName: 'npetok',
};

/** `GroupAction.toJSON()` of the live max-supply proposal. */
export const MAX_SUPPLY_ACTION = {
  $formatVersion: '0',
  contract_id: CONTRACT_ID,
  proposer_id: OWNER,
  token_contract_position: 0,
  event: {
    $kind: 'tokenEvent',
    $type: 'configUpdate',
    configurationChange: { $type: 'maxSupply', value: 200_000_000_000_000 },
    publicNote: null,
  },
};

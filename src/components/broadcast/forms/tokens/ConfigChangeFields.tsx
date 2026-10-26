'use client';

import { useEffect, useMemo, useState } from 'react';
import { Checkbox, HStack, Input, Radio, RadioGroup, Select, Text, VStack } from '@chakra-ui/react';
import { isBase58Identifier } from '@util/identifier';
import { toRecord } from '@util/contract';
import { formatTokenAmount } from '@util/token-rules';
import { parseDecimalBigInt } from '../amount';
import { MAX_TOKEN_SUPPLY, parseTokenAmount } from '../../tokens/amount';
import {
  ACTION_ONLY_RULES,
  CHANGE_RULE_LABELS,
  configChangeAuthority,
  describeConfigChange,
} from '../../tokens/config-change';
import type { CosignParameters } from '../../tokens/group-actions';
import { describeTakers, ruleFor, type TokenModel } from '../../tokens/model';
import { CHANGE_RULES, type ActionTakers, type ChangeRule, type TokenConfigChange } from '../../tokens/options';
import { Field } from './fields';

type ItemKey =
  | 'maxSupply'
  | 'conventions'
  | 'newTokensDestinationIdentity'
  | 'mintingAllowChoosingDestination'
  | 'perpetualDistribution'
  | 'marketplaceTradeMode'
  | 'mainControlGroup'
  | `rule:${ChangeRule}:${'authorized' | 'admin'}`;

const VALUE_ITEMS: Array<[ItemKey, string]> = [
  ['maxSupply', 'Max supply'],
  ['conventions', 'Conventions (names, decimals)'],
  ['newTokensDestinationIdentity', 'New-tokens destination identity'],
  ['mintingAllowChoosingDestination', 'Whether minters choose the destination'],
  ['perpetualDistribution', 'Perpetual distribution'],
  ['marketplaceTradeMode', 'Marketplace trade mode'],
  ['mainControlGroup', 'Main control group'],
];

const RULE_ITEMS: Array<[ItemKey, string]> = CHANGE_RULES.flatMap((rule) => [
  [`rule:${rule}:authorized`, `Who may act: ${CHANGE_RULE_LABELS[rule]}`] as [ItemKey, string],
  [`rule:${rule}:admin`, `Administrators: ${CHANGE_RULE_LABELS[rule]}`] as [ItemKey, string],
]);

type TakersType = ActionTakers['type'];

interface State {
  item: ItemKey;
  amount: string;
  noLimit: boolean;
  identity: string;
  flag: boolean;
  decimals: string;
  localizations: Array<{ lang: string; singularForm: string; pluralForm: string; shouldCapitalize: boolean }>;
  removeDistribution: boolean;
  intervalType: 'block' | 'time' | 'epoch';
  interval: string;
  perInterval: string;
  recipientType: 'contractOwner' | 'identity' | 'evonodes';
  group: string;
  takersType: TakersType;
}

function initialState(model: TokenModel): State {
  const conventions = toRecord(model.config.conventions);
  return {
    item: 'maxSupply',
    amount: model.maxSupply !== undefined ? formatTokenAmount(model.maxSupply, model.decimals).replace(/,/g, '') : '',
    noLimit: false,
    identity: model.newTokensDestinationIdentity ?? '',
    flag: !model.mintingAllowChoosingDestination,
    decimals: String(model.decimals),
    localizations: Object.entries(toRecord(conventions?.localizations) ?? {}).map(([lang, raw]) => {
      const l = toRecord(raw) ?? {};
      return {
        lang,
        singularForm: String(l.singularForm ?? ''),
        pluralForm: String(l.pluralForm ?? ''),
        shouldCapitalize: l.shouldCapitalize === true,
      };
    }),
    removeDistribution: false,
    intervalType: 'block',
    interval: '',
    perInterval: '',
    recipientType: 'contractOwner',
    group: model.mainControlGroup !== undefined ? String(model.mainControlGroup) : '',
    takersType: 'contractOwner',
  };
}

/** The change these inputs describe, or why they do not describe one yet. */
function buildChange(state: State, model: TokenModel): TokenConfigChange | string {
  const identity = state.identity.trim();
  const identityOk = isBase58Identifier(identity);
  switch (state.item) {
    case 'maxSupply': {
      if (state.noLimit) return { item: 'maxSupply', value: null };
      const parsed = parseTokenAmount(state.amount, model.decimals, MAX_TOKEN_SUPPLY);
      return parsed.value === undefined ? `Max supply: ${parsed.error}` : { item: 'maxSupply', value: parsed.value };
    }
    case 'newTokensDestinationIdentity':
      if (!identity) return { item: 'newTokensDestinationIdentity', value: null };
      return identityOk ? { item: 'newTokensDestinationIdentity', value: identity } : 'Enter a valid identity ID.';
    case 'mintingAllowChoosingDestination':
      return { item: 'mintingAllowChoosingDestination', value: state.flag };
    case 'marketplaceTradeMode':
      return { item: 'marketplaceTradeMode', value: 'NotTradeable' };
    case 'mainControlGroup':
      return { item: 'mainControlGroup', value: state.group === '' ? null : Number(state.group) };
    case 'conventions': {
      const decimals = Number(state.decimals);
      if (!/^\d+$/.test(state.decimals.trim())) return 'Decimals must be a whole number.';
      const localizations: Extract<TokenConfigChange, { item: 'conventions' }>['localizations'] = {};
      for (const l of state.localizations) {
        if (!l.lang.trim() || !l.singularForm.trim() || !l.pluralForm.trim())
          return 'Every localization needs a language, a singular and a plural form.';
        localizations[l.lang.trim()] = {
          shouldCapitalize: l.shouldCapitalize,
          singularForm: l.singularForm.trim(),
          pluralForm: l.pluralForm.trim(),
        };
      }
      return { item: 'conventions', decimals, localizations };
    }
    case 'perpetualDistribution': {
      if (state.removeDistribution) return { item: 'perpetualDistribution', value: null };
      const interval = parseDecimalBigInt(state.interval);
      if (interval === null || interval <= 0n) return 'Enter the distribution interval as a whole number.';
      const parsed = parseTokenAmount(state.perInterval, model.decimals);
      if (parsed.value === undefined) return `Amount per interval: ${parsed.error}`;
      if (state.recipientType === 'identity' && !identityOk) return 'Enter the recipient identity ID.';
      return {
        item: 'perpetualDistribution',
        value: {
          intervalType: state.intervalType,
          interval,
          amount: parsed.value,
          recipient:
            state.recipientType === 'identity'
              ? { type: 'identity', identityId: identity }
              : state.recipientType === 'evonodes'
                ? { type: 'evonodes' }
                : { type: 'contractOwner' },
        },
      };
    }
    default: {
      const [, rule, target] = state.item.split(':') as [string, ChangeRule, 'authorized' | 'admin'];
      let takers: ActionTakers;
      switch (state.takersType) {
        case 'identity':
          if (!identityOk) return 'Enter the identity ID to authorize.';
          takers = { type: 'identity', identityId: identity };
          break;
        case 'group':
          if (state.group === '') return 'Choose the group to authorize.';
          takers = { type: 'group', position: Number(state.group) };
          break;
        default:
          takers = { type: state.takersType } as ActionTakers;
      }
      return { item: 'rule', rule, target, takers };
    }
  }
}

export function ConfigChangeFields({
  model,
  totalSupply,
  signerId,
  locked,
  onChange,
}: {
  model: TokenModel;
  totalSupply: bigint;
  signerId: string;
  /** Co-signing: the pending action's change, which the inputs must repeat. */
  locked: CosignParameters | null;
  onChange: (change: TokenConfigChange | string | null) => void;
}) {
  const [state, setState] = useState<State>(() => initialState(model));
  const set = (patch: Partial<State>) => setState((current) => ({ ...current, ...patch }));
  const lockedChange = locked?.kind === 'configUpdate' ? locked.change : null;
  const change = useMemo(() => lockedChange ?? buildChange(state, model), [lockedChange, state, model]);
  const key = JSON.stringify(change, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v));
  useEffect(() => {
    onChange(change);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const authority = typeof change === 'string' ? null : configChangeAuthority(change, model, signerId);
  const groups = Object.keys(model.groups);

  if (lockedChange)
    return (
      <Text fontSize="sm" color="gray.250" role="status">
        Co-signing repeats the proposed change: {describeConfigChange(lockedChange, model.decimals, model.name)}
      </Text>
    );

  const ruleKey = state.item.startsWith('rule:') ? (state.item.split(':')[1] as ChangeRule) : null;
  const ruleTarget = state.item.endsWith(':admin') ? 'admin' : 'authorized';
  const rule = ruleKey ? ruleFor(model, ruleKey) : null;

  return (
    <VStack align="stretch" spacing={3}>
      <Field label="Change" hint={`Supply now ${formatTokenAmount(totalSupply, model.decimals)} ${model.name}.`}>
        <Select
          size="sm"
          aria-label="Configuration item"
          value={state.item}
          onChange={(e) => set({ item: e.target.value as ItemKey })}
          bg="gray.800"
          borderColor="gray.700"
        >
          <optgroup label="Values">
            {VALUE_ITEMS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Who governs a rule">
            {RULE_ITEMS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>

      {state.item === 'maxSupply' ? (
        <Field label={`New max supply (${model.name})`}>
          <HStack>
            <Input
              size="sm"
              aria-label="New max supply"
              value={state.amount}
              isDisabled={state.noLimit}
              onChange={(e) => set({ amount: e.target.value })}
              fontFamily="mono"
              bg="gray.800"
              borderColor="gray.700"
            />
            <Checkbox isChecked={state.noLimit} onChange={(e) => set({ noLimit: e.target.checked })}>
              No limit
            </Checkbox>
          </HStack>
        </Field>
      ) : null}

      {state.item === 'newTokensDestinationIdentity' ? (
        <Field label="Destination identity" hint="Leave empty to clear it.">
          <Input
            size="sm"
            aria-label="Destination identity"
            value={state.identity}
            onChange={(e) => set({ identity: e.target.value })}
            fontFamily="mono"
            bg="gray.800"
            borderColor="gray.700"
          />
        </Field>
      ) : null}

      {state.item === 'mintingAllowChoosingDestination' ? (
        <RadioGroup value={state.flag ? 'yes' : 'no'} onChange={(v) => set({ flag: v === 'yes' })}>
          <HStack spacing={4}>
            <Radio value="yes">Minters choose the recipient</Radio>
            <Radio value="no">Always the destination identity</Radio>
          </HStack>
        </RadioGroup>
      ) : null}

      {state.item === 'marketplaceTradeMode' ? (
        <Text fontSize="xs" color="gray.400">
          Platform v5 defines one trade mode: not tradeable.
        </Text>
      ) : null}

      {state.item === 'mainControlGroup' ? (
        <Field label="Main control group">
          <Select
            size="sm"
            aria-label="Main control group"
            value={state.group}
            onChange={(e) => set({ group: e.target.value })}
            bg="gray.800"
            borderColor="gray.700"
          >
            <option value="">None</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                Group #{g}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {state.item === 'conventions' ? (
        <VStack align="stretch" spacing={2}>
          <Field label="Decimals" hint="Changing the decimals changes how every balance is displayed.">
            <Input
              size="sm"
              aria-label="Decimals"
              value={state.decimals}
              onChange={(e) => set({ decimals: e.target.value })}
              fontFamily="mono"
              bg="gray.800"
              borderColor="gray.700"
              maxW="120px"
            />
          </Field>
          {state.localizations.map((l, index) => (
            <HStack key={index} spacing={2}>
              {(['lang', 'singularForm', 'pluralForm'] as const).map((field) => (
                <Input
                  key={field}
                  size="sm"
                  aria-label={`Localization ${index + 1} ${field}`}
                  value={l[field]}
                  onChange={(e) =>
                    set({
                      localizations: state.localizations.map((item, i) =>
                        i === index ? { ...item, [field]: e.target.value } : item,
                      ),
                    })
                  }
                  bg="gray.800"
                  borderColor="gray.700"
                  placeholder={field}
                />
              ))}
            </HStack>
          ))}
        </VStack>
      ) : null}

      {state.item === 'perpetualDistribution' ? (
        <VStack align="stretch" spacing={2}>
          <Checkbox isChecked={state.removeDistribution} onChange={(e) => set({ removeDistribution: e.target.checked })}>
            Remove the perpetual distribution
          </Checkbox>
          {!state.removeDistribution ? (
            <>
              <Text fontSize="xs" color="gray.400">
                Sets a fixed amount per interval; other emission functions are not editable here.
              </Text>
              <HStack spacing={2}>
                <Select
                  size="sm"
                  aria-label="Interval type"
                  value={state.intervalType}
                  onChange={(e) => set({ intervalType: e.target.value as State['intervalType'] })}
                  bg="gray.800"
                  borderColor="gray.700"
                >
                  <option value="block">Every N blocks</option>
                  <option value="time">Every N milliseconds</option>
                  <option value="epoch">Every N epochs</option>
                </Select>
                <Input
                  size="sm"
                  aria-label="Interval"
                  value={state.interval}
                  onChange={(e) => set({ interval: e.target.value })}
                  fontFamily="mono"
                  bg="gray.800"
                  borderColor="gray.700"
                  placeholder="N"
                />
                <Input
                  size="sm"
                  aria-label="Amount per interval"
                  value={state.perInterval}
                  onChange={(e) => set({ perInterval: e.target.value })}
                  fontFamily="mono"
                  bg="gray.800"
                  borderColor="gray.700"
                  placeholder={`${model.name} per interval`}
                />
              </HStack>
              <HStack spacing={2}>
                <Select
                  size="sm"
                  aria-label="Distribution recipient"
                  value={state.recipientType}
                  onChange={(e) => set({ recipientType: e.target.value as State['recipientType'] })}
                  bg="gray.800"
                  borderColor="gray.700"
                >
                  <option value="contractOwner">Contract owner</option>
                  <option value="identity">An identity</option>
                  <option value="evonodes">Evonodes by participation</option>
                </Select>
                {state.recipientType === 'identity' ? (
                  <Input
                    size="sm"
                    aria-label="Distribution recipient identity"
                    value={state.identity}
                    onChange={(e) => set({ identity: e.target.value })}
                    fontFamily="mono"
                    bg="gray.800"
                    borderColor="gray.700"
                  />
                ) : null}
              </HStack>
            </>
          ) : null}
        </VStack>
      ) : null}

      {ruleKey ? (
        <Field
          label={ruleTarget === 'authorized' ? 'New authority' : 'New administrators'}
          hint={
            rule
              ? `Now: ${describeTakers(rule.authorized)} may act; ${describeTakers(rule.admin)} administer the rule.${
                  ACTION_ONLY_RULES.has(ruleKey) ? '' : ' The value itself is changed with its own item.'
                }`
              : undefined
          }
        >
          <HStack spacing={2}>
            <Select
              size="sm"
              aria-label="New authority type"
              value={state.takersType}
              onChange={(e) => set({ takersType: e.target.value as TakersType })}
              bg="gray.800"
              borderColor="gray.700"
            >
              <option value="contractOwner">Contract owner</option>
              <option value="mainGroup">Main control group</option>
              <option value="group">A group</option>
              <option value="identity">An identity</option>
              <option value="noOne">No one (gives up control)</option>
            </Select>
            {state.takersType === 'identity' ? (
              <Input
                size="sm"
                aria-label="Authorized identity"
                value={state.identity}
                onChange={(e) => set({ identity: e.target.value })}
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
              />
            ) : null}
            {state.takersType === 'group' ? (
              <Select
                size="sm"
                aria-label="Authorized group"
                value={state.group}
                onChange={(e) => set({ group: e.target.value })}
                bg="gray.800"
                borderColor="gray.700"
              >
                <option value="">Choose…</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    Group #{g}
                  </option>
                ))}
              </Select>
            ) : null}
          </HStack>
        </Field>
      ) : null}

      {typeof change !== 'string' ? (
        <Text fontSize="xs" color="gray.250" role="status">
          {describeConfigChange(change, model.decimals, model.name)}
          {authority?.kind === 'denied' ? '' : authority?.kind === 'group' ? ` Group #${authority.group.position} must approve it.` : ''}
        </Text>
      ) : null}
    </VStack>
  );
}

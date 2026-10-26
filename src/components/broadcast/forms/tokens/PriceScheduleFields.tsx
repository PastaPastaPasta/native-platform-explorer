'use client';

import { Button, HStack, Input, Radio, RadioGroup, Text, VStack } from '@chakra-ui/react';
import { formatCredits, formatDashAmount } from '@util/credits';
import { parseDecimalBigInt } from '../amount';
import type { PriceScheduleFields as Fields } from '../../tokens/draft';
import { Field } from './fields';

/** "= N credits (X DASH) per whole token" for a per-base-unit price. */
function perToken(price: string, decimals: number, name: string): string | null {
  const value = parseDecimalBigInt(price);
  if (value === null) return null;
  const total = value * 10n ** BigInt(decimals);
  return `= ${formatCredits(total.toString())} credits (${formatDashAmount(total.toString(), 8)} DASH) per whole ${name}`;
}

export function PriceScheduleFields({
  value,
  decimals,
  name,
  onChange,
}: {
  value: Fields;
  decimals: number;
  name: string;
  onChange: (value: Fields) => void;
}) {
  const setTier = (index: number, patch: Partial<Fields['tiers'][number]>) =>
    onChange({ ...value, tiers: value.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) });
  return (
    <VStack align="stretch" spacing={3}>
      <Field
        label="Pricing"
        hint="Prices are credits per base unit (the token's smallest unit); Platform charges price × amount in base units."
      >
        <RadioGroup value={value.type} onChange={(type) => onChange({ ...value, type: type as Fields['type'] })}>
          <HStack spacing={4} flexWrap="wrap">
            <Radio value="single">Single price</Radio>
            <Radio value="tiers">Tiered by amount</Radio>
            <Radio value="none">Not for sale</Radio>
          </HStack>
        </RadioGroup>
      </Field>
      {value.type === 'single' ? (
        <Field label="Price per base unit (credits)" hint={perToken(value.price, decimals, name) ?? undefined}>
          <Input
            size="sm"
            aria-label="Price per base unit (credits)"
            value={value.price}
            onChange={(e) => onChange({ ...value, price: e.target.value })}
            fontFamily="mono"
            bg="gray.800"
            borderColor="gray.700"
          />
        </Field>
      ) : null}
      {value.type === 'tiers' ? (
        <Field
          label="Tiers"
          hint={`A purchase pays the price of the largest tier whose minimum it reaches. Minimums are in ${name}; amounts below the smallest minimum cannot be bought.`}
        >
          <VStack align="stretch" spacing={2}>
            {value.tiers.map((tier, index) => (
              <HStack key={index} spacing={2}>
                <Input
                  size="sm"
                  aria-label={`Tier ${index + 1} minimum amount`}
                  value={tier.minAmount}
                  onChange={(e) => setTier(index, { minAmount: e.target.value })}
                  fontFamily="mono"
                  bg="gray.800"
                  borderColor="gray.700"
                  placeholder={`From (${name})`}
                />
                <Input
                  size="sm"
                  aria-label={`Tier ${index + 1} price per base unit`}
                  value={tier.price}
                  onChange={(e) => setTier(index, { price: e.target.value })}
                  fontFamily="mono"
                  bg="gray.800"
                  borderColor="gray.700"
                  placeholder="Credits per base unit"
                />
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Remove tier ${index + 1}`}
                  isDisabled={value.tiers.length === 1}
                  onClick={() => onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== index) })}
                >
                  ✕
                </Button>
              </HStack>
            ))}
            <Button
              size="xs"
              variant="outline"
              alignSelf="flex-start"
              onClick={() => onChange({ ...value, tiers: [...value.tiers, { minAmount: '', price: '' }] })}
            >
              Add tier
            </Button>
          </VStack>
        </Field>
      ) : null}
      {value.type === 'none' ? (
        <Text fontSize="xs" color="gray.400">
          Removes the price: nobody can buy {name} directly until a new price is set.
        </Text>
      ) : null}
    </VStack>
  );
}

import { describe, expect, it } from 'vitest';
import { GROUPS, findOperationById, operationStatusLabel, operationsInGroup } from '../../operations';
import { TOKEN_OPERATION_KINDS, tokenOperationId, type TokenOperationOptions } from '../options';
import { MEMBER, base } from './fixtures';

describe('token operation registry', () => {
  it('adds a Tokens group with one operation per SDK token write', () => {
    expect(GROUPS.find((g) => g.id === 'token')?.label).toBe('Tokens');
    expect(operationsInGroup('token').map((o) => o.id)).toEqual(TOKEN_OPERATION_KINDS.map(tokenOperationId));
  });

  it.each(TOKEN_OPERATION_KINDS.map((kind) => [kind]))('%s is signable here with a CRITICAL key', (kind) => {
    const entry = findOperationById(tokenOperationId(kind))!;
    expect(operationStatusLabel(entry)).toBeNull();
    expect(entry.descriptor.capability).toMatchObject({ status: 'available', criteria: { allowedSecurityLevels: ['CRITICAL'] } });
    expect(entry.descriptor.secrets).toBe('none');
    expect(entry.descriptor.signingCriteria).toBeTypeOf('function');
  });

  it('flags burns, frozen-fund destruction and emergency actions as destructive', () => {
    const destructive = (kind: string) => findOperationById(`token.${kind}`)!.descriptor.destructive;
    expect(destructive('burn')).toBe(true);
    expect(destructive('destroyFrozen')).toBe(true);
    expect(destructive('emergencyAction')).toBe(true);
    expect(destructive('mint')).toBeUndefined();
    const configUpdate = destructive('configUpdate') as (options: unknown) => boolean;
    expect(configUpdate({ ...base, kind: 'configUpdate', change: { item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'noOne' } } })).toBe(true);
    expect(configUpdate({ ...base, kind: 'configUpdate', change: { item: 'maxSupply', value: 1n } })).toBe(false);
  });

  it('summarises the reviewed inputs', () => {
    const { summarise } = findOperationById('token.transfer')!.descriptor;
    const options: TokenOperationOptions = { ...base, kind: 'transfer', amount: 300_000_000n, recipientId: MEMBER };
    expect(summarise(options)).toMatch(/^Transfers 3 npetok \(300000000 base units\) from \S+ to 7ysN/);
  });
});

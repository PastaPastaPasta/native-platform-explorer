'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useSdk } from '@sdk/hooks';
import { getConfig } from '@/config';
import {
  defaultConnectionSettings,
  quorumUrlError,
  SDK_LOG_LEVELS,
  SETTING_LIMITS,
  type ConnectionSettings,
  type QuorumNetwork,
  type SdkLogLevel,
} from '@sdk/connection-settings';

type NumberField = 'startupTimeoutMs' | 'connectTimeoutMs' | 'requestTimeoutMs' | 'retries';

interface Draft {
  startupTimeoutMs: string;
  connectTimeoutMs: string;
  requestTimeoutMs: string;
  retries: string;
  banFailedAddress: 'default' | 'on' | 'off';
  logLevel: SdkLogLevel;
  mainnet: string;
  testnet: string;
}

function toDraft(s: ConnectionSettings): Draft {
  const num = (v: number | null) => (v === null ? '' : String(v));
  return {
    startupTimeoutMs: String(s.startupTimeoutMs),
    connectTimeoutMs: num(s.connectTimeoutMs),
    requestTimeoutMs: num(s.requestTimeoutMs),
    retries: num(s.retries),
    banFailedAddress: s.banFailedAddress === null ? 'default' : s.banFailedAddress ? 'on' : 'off',
    logLevel: s.logLevel,
    mainnet: s.quorumUrls.mainnet ?? '',
    testnet: s.quorumUrls.testnet ?? '',
  };
}

/** Validate a draft. Returns settings, or per-field messages. */
export function parseDraft(d: Draft): { settings?: ConnectionSettings; errors: Partial<Record<keyof Draft, string>> } {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const num = (field: NumberField, required: boolean): number | null => {
    const raw = d[field].trim();
    if (!raw) {
      if (required) errors[field] = 'Required.';
      return null;
    }
    const n = Number(raw);
    const { min, max } = SETTING_LIMITS[field];
    if (!Number.isInteger(n) || n < min || n > max) errors[field] = `Whole number from ${min} to ${max}.`;
    return n;
  };
  const url = (field: QuorumNetwork): string | null => {
    const raw = d[field].trim();
    if (!raw) return null;
    const message = quorumUrlError(raw);
    if (message) errors[field] = message;
    return raw.replace(/\/+$/, '');
  };
  const settings: ConnectionSettings = {
    startupTimeoutMs: num('startupTimeoutMs', true) ?? 0,
    connectTimeoutMs: num('connectTimeoutMs', false),
    requestTimeoutMs: num('requestTimeoutMs', false),
    retries: num('retries', false),
    banFailedAddress: d.banFailedAddress === 'default' ? null : d.banFailedAddress === 'on',
    logLevel: d.logLevel,
    quorumUrls: { mainnet: url('mainnet'), testnet: url('testnet') },
  };
  return Object.keys(errors).length ? { errors } : { settings, errors };
}

const NUMBER_FIELDS: Array<{ field: NumberField; label: string; help: string; placeholder?: string }> = [
  { field: 'startupTimeoutMs', label: 'Startup timeout (ms)', help: 'Explorer deadline for connecting: fetching quorum keys and the masternode list.' },
  { field: 'connectTimeoutMs', label: 'DAPI connect timeout (ms)', help: 'SDK `connectTimeoutMs` per DAPI connection.', placeholder: 'SDK default' },
  { field: 'requestTimeoutMs', label: 'Request timeout (ms)', help: 'SDK `timeoutMs` per request.', placeholder: 'SDK default' },
  { field: 'retries', label: 'Retries', help: 'SDK `retries` against other DAPI nodes.', placeholder: 'SDK default' },
];

export function ConnectionSettingsForm() {
  const { connectionSettings, setConnectionSettings } = useSdk();
  const [draft, setDraft] = useState<Draft>(() => toDraft(connectionSettings));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  // Stored settings hydrate after mount; follow them until the user edits.
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(toDraft(connectionSettings)); }, [connectionSettings, dirty]);
  const env = getConfig().quorumUrls;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const save = () => {
    const result = parseDraft(draft);
    setErrors(result.errors);
    if (!result.settings) return;
    setConnectionSettings(result.settings);
    setDirty(false);
  };
  const reset = () => {
    setErrors({});
    setDirty(false);
    const defaults = defaultConnectionSettings();
    setConnectionSettings(defaults);
    setDraft(toDraft(defaults));
  };

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {(['mainnet', 'testnet'] as const).map((net) => (
          <FormControl key={net} isInvalid={!!errors[net]}>
            <FormLabel fontSize="sm">{net === 'mainnet' ? 'Mainnet' : 'Testnet'} quorum service URL</FormLabel>
            <Input
              size="sm"
              fontFamily="mono"
              value={draft[net]}
              onChange={(e) => update(net, e.target.value)}
              placeholder={env[net] ?? `https://quorums.${net}.networks.dash.org`}
            />
            <FormHelperText fontSize="xs" color="gray.400">
              {env[net] ? 'Build default shown. ' : null}Blank uses the default. You trust this service for quorum keys.
            </FormHelperText>
            {errors[net] ? <FormErrorMessage fontSize="xs">{errors[net]}</FormErrorMessage> : null}
          </FormControl>
        ))}
        {NUMBER_FIELDS.map(({ field, label, help, placeholder }) => (
          <FormControl key={field} isInvalid={!!errors[field]}>
            <FormLabel fontSize="sm">{label}</FormLabel>
            <Input
              size="sm"
              inputMode="numeric"
              fontFamily="mono"
              value={draft[field]}
              placeholder={placeholder}
              onChange={(e) => update(field, e.target.value)}
            />
            <FormHelperText fontSize="xs" color="gray.400">{help}</FormHelperText>
            {errors[field] ? <FormErrorMessage fontSize="xs">{errors[field]}</FormErrorMessage> : null}
          </FormControl>
        ))}
        <FormControl>
          <FormLabel fontSize="sm">Ban failed DAPI addresses</FormLabel>
          <Select size="sm" value={draft.banFailedAddress} onChange={(e) => update('banFailedAddress', e.target.value as Draft['banFailedAddress'])}>
            <option value="default">SDK default</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </Select>
          <FormHelperText fontSize="xs" color="gray.400">SDK `banFailedAddress`: skip a node for a while after it fails.</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">SDK log level</FormLabel>
          <Select size="sm" value={draft.logLevel} onChange={(e) => update('logLevel', e.target.value as SdkLogLevel)}>
            {SDK_LOG_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </Select>
          <FormHelperText fontSize="xs" color="gray.400">SDK `logs`, written to the browser console.</FormHelperText>
        </FormControl>
      </SimpleGrid>
      <Text fontSize="xs" color="gray.400">
        Saved in this browser only. Saving starts a new SDK session. Explicit DAPI addresses
        are not offered for Mainnet or Testnet: the pinned SDK replaces them with the quorum
        service&apos;s masternode list, so pointing at another quorum service is how to use
        different endpoints.
      </Text>
      <HStack>
        <Button size="sm" variant="outline" onClick={save}>Save &amp; reconnect</Button>
        <Button size="sm" variant="ghost" onClick={reset}>Reset to defaults</Button>
      </HStack>
    </VStack>
  );
}

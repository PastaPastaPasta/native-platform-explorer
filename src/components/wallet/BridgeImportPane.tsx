'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';
import {
  createBackupSigner,
  parseBridgeBackup,
  type ParsedBridgeBackup,
} from '@/signer/backup';
import { shortId } from '@util/identifier';

function NetworkMismatchBanner({
  backupNetwork,
  currentNetwork,
}: {
  backupNetwork: string | undefined;
  currentNetwork: string;
}) {
  if (!backupNetwork || backupNetwork === currentNetwork) return null;
  return (
    <Box
      borderRadius="md"
      border="1px solid"
      borderColor="warning"
      bg="rgba(255,199,2,0.08)"
      p={3}
    >
      <Text fontSize="sm" color="warning" fontWeight={600}>
        Network mismatch
      </Text>
      <Text fontSize="xs" color="gray.250" mt={1}>
        Backup is for <strong>{backupNetwork}</strong> but the explorer is on{' '}
        <strong>{currentNetwork}</strong>. Switch network in the navbar before
        importing, or the on-chain identity lookup will fail.
      </Text>
    </Box>
  );
}

function ParsedPreview({ parsed }: { parsed: ParsedBridgeBackup }) {
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between" align="flex-start" flexWrap="wrap">
          <Box>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase">
              Identity
            </Text>
            <Text fontFamily="mono" fontSize="sm" color="gray.100">
              {parsed.identityId}
            </Text>
          </Box>
          {parsed.network ? (
            <Badge colorScheme="blue" variant="subtle">
              {parsed.network}
            </Badge>
          ) : null}
        </HStack>
        <Box>
          <Text fontSize="xs" color="gray.400" textTransform="uppercase" mb={2}>
            {parsed.keys.length} key{parsed.keys.length === 1 ? '' : 's'}
          </Text>
          <VStack align="stretch" spacing={1}>
            {parsed.keys.map((k) => (
              <HStack
                key={k.id}
                fontSize="xs"
                color="gray.250"
                bg="gray.800"
                p={2}
                borderRadius="sm"
                spacing={2}
              >
                <Text fontFamily="mono" w="2ch">
                  #{k.id}
                </Text>
                <Badge variant="outline" colorScheme="blue">
                  {k.purpose}
                </Badge>
                <Badge variant="outline" colorScheme="purple">
                  {k.securityLevel}
                </Badge>
                {k.keyType ? (
                  <Text color="gray.400" fontSize="xs">
                    {k.keyType}
                  </Text>
                ) : null}
                {k.publicKeyHex ? (
                  <Text fontFamily="mono" color="gray.400" ml="auto">
                    pub {shortId(k.publicKeyHex, 8, 6)}
                  </Text>
                ) : null}
              </HStack>
            ))}
          </VStack>
        </Box>
      </VStack>
    </InfoBlock>
  );
}

export function BridgeImportPane() {
  const { sdk, network } = useSdk();
  const { connect } = useSigner();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedBridgeBackup | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const ingest = useCallback((raw: string) => {
    setError(null);
    try {
      const json: unknown = JSON.parse(raw);
      const ok = parseBridgeBackup(json);
      setParsed(ok);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      ingest(text);
    },
    [ingest],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void onFile(file);
    },
    [onFile],
  );

  const onConnect = useCallback(async () => {
    if (!sdk || !parsed) return;
    setBusy(true);
    setError(null);
    try {
      const signer = await createBackupSigner(sdk, parsed);
      connect(signer);
      // Drop the in-page copy of the backup once the signer captures the WIFs.
      setParsed(null);
      setPastedText('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  }, [sdk, parsed, connect]);

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Drop in the key-backup JSON file you exported from the bridge, or paste
        the JSON below. Keys live only in this tab&apos;s memory.
      </Text>

      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        borderRadius="md"
        border="1px dashed"
        borderColor={dragging ? 'brand.light' : 'gray.700'}
        bg={dragging ? 'rgba(0,141,228,0.06)' : 'rgba(255,255,255,0.02)'}
        p={6}
        textAlign="center"
        cursor="pointer"
        _hover={{ borderColor: 'brand.light' }}
      >
        <Text fontSize="sm" color="gray.100" fontWeight={500}>
          {dragging
            ? 'Drop the file to import…'
            : 'Drop backup JSON here or click to pick a file'}
        </Text>
        <Text fontSize="xs" color="gray.400" mt={1}>
          File stays local — never uploaded.
        </Text>
        <Input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          display="none"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </Box>

      <Box>
        <Text fontSize="xs" color="gray.400" mb={1}>
          …or paste JSON
        </Text>
        <Textarea
          size="sm"
          rows={4}
          placeholder='{ "identityId": "…", "identityKeys": [ … ] }'
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          onBlur={() => {
            if (pastedText.trim().length > 0) ingest(pastedText);
          }}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
      </Box>

      {parsed ? (
        <>
          <NetworkMismatchBanner
            backupNetwork={parsed.network}
            currentNetwork={network}
          />
          <ParsedPreview parsed={parsed} />
          <HStack justify="flex-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setParsed(null);
                setPastedText('');
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              colorScheme="blue"
              isLoading={busy}
              onClick={() => void onConnect()}
            >
              Use this identity
            </Button>
          </HStack>
        </>
      ) : null}

      {error ? <ErrorCard error={error} /> : null}
    </VStack>
  );
}

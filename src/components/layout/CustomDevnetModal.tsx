'use client';

import { useState } from 'react';
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import {
  createCustomDevnetConfig,
  hasNetwork,
  isBuiltInNetwork,
  saveCustomDevnet,
} from '@sdk/networks';

export interface CustomDevnetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (name: string) => void;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function parseAddresses(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function CustomDevnetModal({ isOpen, onClose, onSaved }: CustomDevnetModalProps) {
  const [name, setName] = useState('');
  const [insightApiUrl, setInsightApiUrl] = useState('');
  const [dapiAddressesRaw, setDapiAddressesRaw] = useState('');
  const [faucetBaseUrl, setFaucetBaseUrl] = useState('');
  const [errors, setErrors] = useState<{
    name?: string;
    insight?: string;
    dapi?: string;
    faucet?: string;
  }>({});

  function reset() {
    setName('');
    setInsightApiUrl('');
    setDapiAddressesRaw('');
    setFaucetBaseUrl('');
    setErrors({});
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSave() {
    const next: typeof errors = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      next.name = 'Required';
    } else if (!NAME_PATTERN.test(trimmedName)) {
      next.name = 'Lowercase letters, digits, and hyphens only';
    } else if (isBuiltInNetwork(trimmedName)) {
      next.name = `"${trimmedName}" is a built-in network`;
    } else if (hasNetwork(trimmedName)) {
      next.name = `A network named "${trimmedName}" already exists`;
    }

    const addresses = parseAddresses(dapiAddressesRaw);
    if (addresses.length === 0) {
      next.dapi = 'At least one DAPI address is required';
    } else {
      const bad = addresses.find((a) => !isValidUrl(a));
      if (bad) next.dapi = `Not a valid HTTP(S) URL: ${bad}`;
    }

    const trimmedInsight = insightApiUrl.trim();
    if (trimmedInsight && !isValidUrl(trimmedInsight)) {
      next.insight = 'Not a valid HTTP(S) URL';
    }

    const trimmedFaucet = faucetBaseUrl.trim();
    if (trimmedFaucet && !isValidUrl(trimmedFaucet)) {
      next.faucet = 'Not a valid HTTP(S) URL';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const cfg = createCustomDevnetConfig({
      name: trimmedName,
      insightApiUrl: trimmedInsight || undefined,
      dapiAddresses: addresses,
      faucetBaseUrl: trimmedFaucet || undefined,
    });
    saveCustomDevnet(cfg);
    onSaved?.(trimmedName);
    handleClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent bg="gray.900" color="gray.100" borderColor="gray.700" borderWidth="1px">
        <ModalHeader>Add custom devnet</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <FormControl isInvalid={!!errors.name} isRequired>
              <FormLabel fontSize="sm">Name</FormLabel>
              <Input
                size="sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="devnet-mycoolnet"
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
                _focus={{ borderColor: 'brand.normal' }}
              />
              <FormHelperText fontSize="xs" color="gray.400">
                Unique identifier (lowercase, digits, hyphens). Used in URLs and localStorage.
              </FormHelperText>
              {errors.name ? (
                <FormErrorMessage fontSize="xs">{errors.name}</FormErrorMessage>
              ) : null}
            </FormControl>

            <FormControl isInvalid={!!errors.dapi} isRequired>
              <FormLabel fontSize="sm">DAPI addresses</FormLabel>
              <Textarea
                size="sm"
                value={dapiAddressesRaw}
                onChange={(e) => setDapiAddressesRaw(e.target.value)}
                placeholder={'https://1.2.3.4:1443\nhttps://5.6.7.8:1443'}
                fontFamily="mono"
                rows={4}
                bg="gray.800"
                borderColor="gray.700"
                _focus={{ borderColor: 'brand.normal' }}
              />
              <FormHelperText fontSize="xs" color="gray.400">
                HP masternode endpoints, one per line (or comma-separated). If they use
                self-signed certs you may need to visit each URL in a separate tab once to
                accept the certificate.
              </FormHelperText>
              {errors.dapi ? (
                <FormErrorMessage fontSize="xs">{errors.dapi}</FormErrorMessage>
              ) : null}
            </FormControl>

            <FormControl isInvalid={!!errors.insight}>
              <FormLabel fontSize="sm">Insight API URL (optional)</FormLabel>
              <Input
                size="sm"
                value={insightApiUrl}
                onChange={(e) => setInsightApiUrl(e.target.value)}
                placeholder="https://insight.devnet-mycoolnet.networks.dash.org/insight-api"
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
                _focus={{ borderColor: 'brand.normal' }}
              />
              {errors.insight ? (
                <FormErrorMessage fontSize="xs">{errors.insight}</FormErrorMessage>
              ) : null}
            </FormControl>

            <FormControl isInvalid={!!errors.faucet}>
              <FormLabel fontSize="sm">Faucet URL (optional)</FormLabel>
              <Input
                size="sm"
                value={faucetBaseUrl}
                onChange={(e) => setFaucetBaseUrl(e.target.value)}
                placeholder="https://faucet.devnet-mycoolnet.networks.dash.org"
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
                _focus={{ borderColor: 'brand.normal' }}
              />
              {errors.faucet ? (
                <FormErrorMessage fontSize="xs">{errors.faucet}</FormErrorMessage>
              ) : null}
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack>
            <Button size="sm" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              borderColor="brand.normal"
              color="brand.light"
              _hover={{ bg: 'gray.800' }}
              onClick={handleSave}
            >
              Save &amp; connect
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

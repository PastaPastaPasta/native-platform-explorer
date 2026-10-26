'use client';

import {
  Badge,
  Box,
  Heading,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { InfoLine } from '@components/data/InfoLine';
import { IdentityLink } from '@components/data/IdentityLink';
import { DateBlock } from '@components/data/DateBlock';
import { RawJsonDisclosure } from '@components/data/RawJsonDisclosure';
import { toRecord } from '@util/contract';
import {
  KEEPS_HISTORY_LABELS,
  changeControlRows,
  describeActionTakers,
  describePerpetualDistribution,
  describeTradeMode,
  formatTokenAmount,
  preProgrammedSchedule,
  type ActionTakers,
} from '@util/token-rules';


function Takers({ value }: { value: ActionTakers }) {
  if (value.identityId) return <IdentityLink id={value.identityId} dense />;
  return (
    <Text as="span" fontSize="xs" color={value.label === 'No one' ? 'gray.400' : 'gray.100'}>
      {value.label}
    </Text>
  );
}

function Amount({ value, decimals }: { value: unknown; decimals?: number }) {
  if (value === null || value === undefined) return <Text as="span" color="gray.400" fontSize="sm">no limit</Text>;
  return <Text as="span" fontFamily="mono" color="gray.100">{formatTokenAmount(String(value), decimals)}</Text>;
}

export interface TokenOverviewProps {
  /** The token's `TokenConfiguration` entry from its contract. */
  config: unknown;
  decimals?: number;
  totalSupply?: bigint | null;
}

/** The token configuration rendered as rules instead of JSON. */
export function TokenOverview({ config, decimals, totalSupply }: TokenOverviewProps) {
  const cfg = toRecord(config);
  if (!cfg) return null;
  const distribution = toRecord(cfg.distributionRules);
  const perpetual = describePerpetualDistribution(distribution?.perpetualDistribution);
  const schedule = preProgrammedSchedule(distribution?.preProgrammedDistribution);
  const destination = distribution?.newTokensDestinationIdentity;
  const marketplace = toRecord(cfg.marketplaceRules);
  const history = toRecord(cfg.keepsHistory);
  const rules = changeControlRows(cfg);
  const emergency = rules.find((r) => r.key === 'emergencyActionRules');
  const now = Date.now();

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock>
        <Heading size="sm" mb={3} color="gray.100">Supply</Heading>
        <HStack spacing={8} flexWrap="wrap" align="flex-start">
          <InfoLine label="Total supply" value={<Amount value={totalSupply ?? undefined} decimals={decimals} />} />
          <InfoLine label="Base supply (minted at creation)" value={<Amount value={cfg.baseSupply ?? 0} decimals={decimals} />} />
          <InfoLine label="Max supply" value={<Amount value={cfg.maxSupply} decimals={decimals} />} />
          <InfoLine label="Decimals" value={<Text fontFamily="mono">{decimals ?? '—'}</Text>} />
        </HStack>
      </InfoBlock>

      <InfoBlock>
        <Heading size="sm" mb={3} color="gray.100">Distribution</Heading>
        <VStack align="stretch" spacing={3}>
          <InfoLine
            label="Perpetual distribution"
            value={perpetual ? (
              <VStack align="flex-start" spacing={1} fontSize="sm">
                <Text color="gray.100">
                  {perpetual.emission}
                  {perpetual.interval ? <Text as="span" color="gray.250">, {perpetual.interval}</Text> : null}
                </Text>
                <HStack spacing={2} fontSize="xs" color="gray.250">
                  <Text>Paid to</Text>
                  {perpetual.recipient.identityId
                    ? <IdentityLink id={perpetual.recipient.identityId} dense />
                    : <Text color="gray.100">{perpetual.recipient.label}</Text>}
                  <Text color="gray.400">· the recipient claims it; x counts {perpetual.intervalUnit}</Text>
                </HStack>
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">None — no tokens are emitted on a schedule.</Text>}
          />
          <InfoLine
            label="Pre-programmed distribution"
            value={schedule.length === 0 ? (
              <Text fontSize="sm" color="gray.400">None.</Text>
            ) : (
              <Box overflowX="auto">
                <Table size="sm" aria-label="Pre-programmed distribution">
                  <Thead>
                    <Tr>
                      <Th color="gray.400" borderColor="gray.750">Release time</Th>
                      <Th color="gray.400" borderColor="gray.750">Recipient</Th>
                      <Th color="gray.400" borderColor="gray.750" isNumeric>Amount</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {schedule.flatMap((entry) => entry.recipients.map((r) => (
                      <Tr key={`${entry.timestampMs}-${r.identityId}`}>
                        <Td borderColor="gray.750">
                          <DateBlock value={entry.timestampMs} />{' '}
                          {entry.timestampMs <= now ? <Badge variant="subtle" fontSize="2xs" title="Release time has passed; the recipient can claim it if not already claimed">released</Badge> : null}
                        </Td>
                        <Td borderColor="gray.750"><IdentityLink id={r.identityId} dense /></Td>
                        <Td borderColor="gray.750" isNumeric fontFamily="mono">{formatTokenAmount(r.amount, decimals)}</Td>
                      </Tr>
                    )))}
                  </Tbody>
                </Table>
              </Box>
            )}
          />
          <HStack spacing={8} flexWrap="wrap" align="flex-start">
            <InfoLine
              label="New tokens go to"
              value={typeof destination === 'string'
                ? <IdentityLink id={destination} dense />
                : <Text fontSize="sm" color="gray.400">No default destination — each mint names a recipient.</Text>}
            />
            <InfoLine
              label="Minter may choose destination"
              value={<Text fontSize="sm" color="gray.100">{distribution?.mintingAllowChoosingDestination === true ? 'Yes' : 'No'}</Text>}
            />
          </HStack>
        </VStack>
      </InfoBlock>

      <InfoBlock>
        <Heading size="sm" mb={3} color="gray.100">Emergency actions and control</Heading>
        <HStack spacing={8} flexWrap="wrap" align="flex-start" mb={3}>
          <InfoLine label="Emergency pause / resume" value={emergency ? <Takers value={emergency.authorized} /> : <Text color="gray.400">—</Text>} />
          <InfoLine label="Started paused" value={<Text fontSize="sm" color="gray.100">{cfg.startAsPaused === true ? 'Yes' : 'No'}</Text>} />
          <InfoLine
            label="Main control group"
            value={cfg.mainControlGroup === null || cfg.mainControlGroup === undefined
              ? <Text fontSize="sm" color="gray.400">None</Text>
              : <Text fontFamily="mono">#{String(cfg.mainControlGroup)}</Text>}
          />
          <InfoLine label="Main group can be changed by" value={<Takers value={describeActionTakers(cfg.mainControlGroupCanBeModified)} />} />
          <InfoLine label="Transfers to frozen balances" value={<Text fontSize="sm" color="gray.100">{cfg.allowTransferToFrozenBalance === false ? 'Blocked' : 'Allowed'}</Text>} />
        </HStack>
        <Box overflowX="auto">
          <Table size="sm" aria-label="Change-control rules">
            <Thead>
              <Tr>
                <Th color="gray.400" borderColor="gray.750">Action</Th>
                <Th color="gray.400" borderColor="gray.750">Who can do it</Th>
                <Th color="gray.400" borderColor="gray.750">Who can reassign that</Th>
                <Th color="gray.400" borderColor="gray.750">Reassignment limits</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rules.map((r) => (
                <Tr key={r.key}>
                  <Td borderColor="gray.750"><Text fontSize="sm" color="gray.100">{r.label}</Text></Td>
                  <Td borderColor="gray.750"><Takers value={r.authorized} /></Td>
                  <Td borderColor="gray.750"><Takers value={r.admin} /></Td>
                  <Td borderColor="gray.750">
                    <Wrap spacing={1}>
                      {r.changingAuthorizedToNoOneAllowed ? <WrapItem><Badge fontSize="2xs" variant="outline">can revoke to no one</Badge></WrapItem> : null}
                      {r.changingAdminToNoOneAllowed ? <WrapItem><Badge fontSize="2xs" variant="outline">admin can be revoked</Badge></WrapItem> : null}
                      {r.selfChangingAdminAllowed ? <WrapItem><Badge fontSize="2xs" variant="outline">admins can change themselves</Badge></WrapItem> : null}
                    </Wrap>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </InfoBlock>

      <InfoBlock>
        <Heading size="sm" mb={3} color="gray.100">Marketplace and history</Heading>
        <HStack spacing={8} flexWrap="wrap" align="flex-start">
          <InfoLine label="Trade mode" value={<Text fontSize="sm" color="gray.100">{describeTradeMode(marketplace?.tradeMode)}</Text>} />
          <InfoLine
            label="History kept for"
            value={(
              <Wrap spacing={1}>
                {Object.entries(KEEPS_HISTORY_LABELS).map(([key, label]) => (
                  <WrapItem key={key}>
                    <Badge colorScheme={history?.[key] === true ? 'green' : 'gray'} variant="subtle" fontSize="2xs" textTransform="none">
                      {label}{history?.[key] === true ? '' : ' — not kept'}
                    </Badge>
                  </WrapItem>
                ))}
              </Wrap>
            )}
          />
        </HStack>
      </InfoBlock>

      <RawJsonDisclosure value={cfg} label="Raw token configuration" />
    </VStack>
  );
}

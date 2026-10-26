'use client';

import { useState, type ReactNode } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from './Container';
import { InfoBlock } from './InfoBlock';

export interface LandingField {
  name: string;
  label: string;
  placeholder?: string;
  /** Prefilled value, e.g. the part of the URL that was already given. */
  initial?: string;
  /** Return null when valid, a reason string when not. */
  validate?: (value: string) => string | null;
}

export interface ParamsLandingProps {
  title: string;
  description: ReactNode;
  /** Where these pages are normally reached from. */
  parent: { label: string; href: string };
  /** Inputs for the page's params; omit when typing them in isn't useful. */
  fields?: ReadonlyArray<LandingField>;
  /** Destination for the trimmed field values, keyed by field name. */
  buildHref?: (values: Record<string, string>) => string;
  children?: ReactNode;
}

/** What a detail page shows when it is opened without its URL params:
 *  what the page is, the page that leads to it, and optional inputs. */
export function ParamsLanding(props: ParamsLandingProps) {
  // Remount when the URL's partial params change (back/forward between two
  // landings), so the fields show the new values rather than the old ones.
  const key = (props.fields ?? []).map((f) => f.initial ?? '').join('\n');
  return <Landing key={key} {...props} />;
}

function Landing({ title, description, parent, fields = [], buildHref, children }: ParamsLandingProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ''])),
  );
  const rows = fields.map((field) => {
    const value = (values[field.name] ?? '').trim();
    return { field, value, error: value ? field.validate?.(value) ?? null : null };
  });
  const canSubmit = rows.every((r) => r.value && !r.error);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <InfoBlock emphasised>
        <VStack align="stretch" spacing={3}>
          <Heading as="h1" size="md">{title}</Heading>
          <Text fontSize="sm" color="muted" maxW="70ch">{description}</Text>
          {buildHref && rows.length > 0 ? (
            <VStack
              as="form"
              align="stretch"
              spacing={2}
              maxW="40rem"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) router.push(buildHref(Object.fromEntries(rows.map((r) => [r.field.name, r.value]))));
              }}
            >
              {rows.map(({ field, error }) => (
                <FormControl key={field.name} isInvalid={!!error}>
                  <FormLabel fontSize="xs" color="muted" mb={1} textTransform="uppercase" letterSpacing="0.08em">
                    {field.label}
                  </FormLabel>
                  <Input
                    size="sm"
                    fontFamily="mono"
                    bg="raised"
                    borderColor="hairline"
                    borderRadius="card"
                    _hover={{ borderColor: 'hairlineStrong' }}
                    _focusVisible={{ borderColor: 'accent', boxShadow: 'none' }}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                  />
                  {error ? <FormErrorMessage fontSize="xs">{error}</FormErrorMessage> : null}
                </FormControl>
              ))}
              <Button type="submit" size="sm" colorScheme="blue" alignSelf="start" isDisabled={!canSubmit}>
                Open
              </Button>
            </VStack>
          ) : null}
          {children}
          <Button as={NextLink} href={parent.href} size="sm" variant="outline" alignSelf="start">
            {parent.label}
          </Button>
        </VStack>
      </InfoBlock>
    </Container>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  HStack,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  Switch,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';

// ── schema helpers ────────────────────────────────────────────────────────

type JsonValue = unknown;
export type SchemaObject = Record<string, unknown>;

interface FieldNodeProps {
  name: string;
  path: string[];
  schema: SchemaObject;
  required?: boolean;
  value: JsonValue;
  onChange: (next: JsonValue) => void;
}

function isObject(v: unknown): v is SchemaObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function inferKind(schema: SchemaObject): string {
  const explicit = typeof schema.type === 'string' ? schema.type : undefined;
  if (explicit) return explicit;
  if (Array.isArray(schema.enum)) return 'string';
  if (isObject(schema.properties)) return 'object';
  if (isObject(schema.items)) return 'array';
  return 'string';
}

function defaultForSchema(schema: SchemaObject): JsonValue {
  if ('default' in schema) return schema.default as JsonValue;
  const kind = inferKind(schema);
  switch (kind) {
    case 'integer':
    case 'number':
      return '';
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

/** Produce an empty initial value for the form from a top-level schema. */
export function emptyValueFor(schema: SchemaObject): SchemaObject {
  const out: SchemaObject = {};
  const props = isObject(schema.properties) ? schema.properties : {};
  for (const [key, def] of Object.entries(props)) {
    if (key.startsWith('$')) continue;
    if (isObject(def)) out[key] = defaultForSchema(def);
  }
  return out;
}

// ── label / required marker ───────────────────────────────────────────────

function FieldLabel({
  name,
  required,
  description,
}: {
  name: string;
  required?: boolean;
  description?: string;
}) {
  return (
    <Box>
      <HStack spacing={1} align="baseline">
        <Text fontSize="sm" color="gray.100" fontWeight={500}>
          {name}
        </Text>
        {required ? (
          <Text fontSize="xs" color="danger">
            *
          </Text>
        ) : null}
      </HStack>
      {description ? (
        <Text fontSize="xs" color="gray.400" mt={0.5}>
          {description}
        </Text>
      ) : null}
    </Box>
  );
}

// ── leaf field renderers ──────────────────────────────────────────────────

function StringField({ schema, value, onChange }: FieldNodeProps) {
  const v = typeof value === 'string' ? value : value == null ? '' : String(value);
  const maxLength = typeof schema.maxLength === 'number' ? schema.maxLength : undefined;
  const enumOpts = Array.isArray(schema.enum) ? (schema.enum as JsonValue[]) : undefined;
  const format = typeof schema.format === 'string' ? schema.format : undefined;

  if (enumOpts) {
    return (
      <Select
        size="sm"
        bg="gray.800"
        borderColor="gray.700"
        value={v}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— select —</option>
        {enumOpts.map((opt, i) => (
          <option key={i} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </Select>
    );
  }

  if (format === 'date-time') {
    return (
      <Input
        size="sm"
        type="datetime-local"
        bg="gray.800"
        borderColor="gray.700"
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      size="sm"
      bg="gray.800"
      borderColor="gray.700"
      value={v}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={typeof schema.description === 'string' ? schema.description : undefined}
      fontFamily={schema.contentMediaType ? 'mono' : undefined}
    />
  );
}

function NumberField({ schema, value, onChange }: FieldNodeProps) {
  const min = typeof schema.minimum === 'number' ? schema.minimum : undefined;
  const max = typeof schema.maximum === 'number' ? schema.maximum : undefined;
  const isInt = inferKind(schema) === 'integer';

  return (
    <NumberInput
      size="sm"
      min={min}
      max={max}
      step={isInt ? 1 : undefined}
      precision={isInt ? 0 : undefined}
      value={typeof value === 'number' ? value : value == null ? '' : String(value)}
      onChange={(_, asNumber) => {
        if (Number.isNaN(asNumber)) onChange('');
        else onChange(asNumber);
      }}
    >
      <NumberInputField bg="gray.800" borderColor="gray.700" />
      <NumberInputStepper>
        <NumberIncrementStepper />
        <NumberDecrementStepper />
      </NumberInputStepper>
    </NumberInput>
  );
}

function BooleanField({ value, onChange }: FieldNodeProps) {
  return (
    <Switch
      isChecked={value === true}
      onChange={(e) => onChange(e.target.checked)}
      colorScheme="blue"
    />
  );
}

function ByteArrayField({ schema, value, onChange }: FieldNodeProps) {
  const v = typeof value === 'string' ? value : '';
  const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : undefined;
  return (
    <VStack align="stretch" spacing={1}>
      <Input
        size="sm"
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
        placeholder="hex bytes"
        value={v}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <Text fontSize="xs" color="gray.400">
        {v ? `${v.length / 2} byte${v.length === 2 ? '' : 's'}` : 'hex-encoded'}
        {maxItems ? ` · max ${maxItems}` : ''}
      </Text>
    </VStack>
  );
}

function ArrayField({ schema, path, value, onChange }: FieldNodeProps) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = isObject(schema.items) ? schema.items : { type: 'string' };

  const setAt = (i: number, next: JsonValue) => {
    const copy = items.slice();
    copy[i] = next;
    onChange(copy);
  };
  const removeAt = (i: number) => {
    const copy = items.slice();
    copy.splice(i, 1);
    onChange(copy);
  };
  const addNew = () => onChange([...items, defaultForSchema(itemSchema)]);

  return (
    <VStack
      align="stretch"
      spacing={2}
      borderLeft="2px solid"
      borderColor="gray.700"
      pl={3}
    >
      {items.length === 0 ? (
        <Text fontSize="xs" color="gray.400">
          (empty list)
        </Text>
      ) : null}
      {items.map((item, i) => (
        <Box key={i}>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="xs" color="gray.400">
              [{i}]
            </Text>
            <Button size="xs" variant="ghost" onClick={() => removeAt(i)}>
              × Remove
            </Button>
          </HStack>
          <FieldNode
            name={`[${i}]`}
            path={[...path, String(i)]}
            schema={itemSchema}
            value={item}
            onChange={(next) => setAt(i, next)}
          />
        </Box>
      ))}
      <HStack>
        <Button size="xs" variant="outline" onClick={addNew}>
          + Add item
        </Button>
      </HStack>
    </VStack>
  );
}

function ObjectField({ schema, path, value, onChange }: FieldNodeProps) {
  const props = isObject(schema.properties) ? schema.properties : {};
  const obj = isObject(value) ? value : {};
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];

  const setField = (key: string, next: JsonValue) => {
    const copy = { ...obj };
    if (next === '' || next === null || next === undefined) {
      delete copy[key];
    } else {
      copy[key] = next;
    }
    onChange(copy);
  };

  return (
    <VStack
      align="stretch"
      spacing={3}
      borderLeft="2px solid"
      borderColor="gray.700"
      pl={3}
    >
      {Object.entries(props)
        .filter(([key]) => !key.startsWith('$'))
        .map(([key, defUnknown]) => {
          if (!isObject(defUnknown)) return null;
          return (
            <FieldNode
              key={key}
              name={key}
              path={[...path, key]}
              schema={defUnknown}
              required={required.includes(key)}
              value={obj[key]}
              onChange={(next) => setField(key, next)}
            />
          );
        })}
    </VStack>
  );
}

// ── dispatch ──────────────────────────────────────────────────────────────

function FieldNode(props: FieldNodeProps) {
  const { schema, name, required } = props;
  const kind = inferKind(schema);
  const isByteArray =
    (schema as { byteArray?: boolean }).byteArray === true ||
    schema.contentEncoding === 'base64';
  const description =
    typeof schema.description === 'string' ? schema.description : undefined;

  let renderer: React.ReactNode;
  if (isByteArray) {
    renderer = <ByteArrayField {...props} />;
  } else {
    switch (kind) {
      case 'integer':
      case 'number':
        renderer = <NumberField {...props} />;
        break;
      case 'boolean':
        renderer = <BooleanField {...props} />;
        break;
      case 'array':
        renderer = <ArrayField {...props} />;
        break;
      case 'object':
        renderer = <ObjectField {...props} />;
        break;
      default:
        renderer = <StringField {...props} />;
    }
  }

  return (
    <Box>
      <FieldLabel name={name} required={required} description={description} />
      <Box mt={1}>{renderer}</Box>
    </Box>
  );
}

// ── top-level form with JSON toggle ───────────────────────────────────────

export interface SchemaFormProps {
  schema: SchemaObject;
  value: SchemaObject;
  onChange: (next: SchemaObject) => void;
  /** Errors keyed by JSON-pointer-style path; rendered inline. */
  errors?: Record<string, string>;
}

export function SchemaForm({ schema, value, onChange, errors }: SchemaFormProps) {
  const [editAsJson, setEditAsJson] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const requiredTop = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];

  // Keep JSON view fresh when value updates externally.
  useEffect(() => {
    if (!editAsJson) setJsonText(JSON.stringify(value, null, 2));
  }, [value, editAsJson]);

  const applyJson = useCallback(() => {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!isObject(parsed)) {
        setJsonError('Document must be a JSON object.');
        return;
      }
      setJsonError(null);
      onChange(parsed);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  }, [jsonText, onChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <HStack justify="flex-end">
        <Text fontSize="xs" color="gray.400">
          Edit as JSON
        </Text>
        <Switch
          size="sm"
          isChecked={editAsJson}
          onChange={(e) => {
            if (!e.target.checked) {
              // leaving JSON view — apply any pending text first.
              applyJson();
            } else {
              setJsonText(JSON.stringify(value, null, 2));
            }
            setEditAsJson(e.target.checked);
          }}
        />
      </HStack>

      {editAsJson ? (
        <VStack align="stretch" spacing={2}>
          <Textarea
            rows={14}
            fontFamily="mono"
            fontSize="xs"
            bg="gray.800"
            borderColor="gray.700"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            onBlur={applyJson}
          />
          {jsonError ? (
            <Text fontSize="xs" color="danger">
              {jsonError}
            </Text>
          ) : null}
          <Text fontSize="xs" color="gray.400">
            Tip: JSON is validated and applied on blur. Toggle off to return to
            the typed form.
          </Text>
        </VStack>
      ) : (
        <VStack align="stretch" spacing={3}>
          <ObjectField
            name=""
            path={[]}
            schema={schema}
            required={false}
            value={value}
            onChange={(next) => {
              if (isObject(next)) onChange(next);
            }}
          />
          {requiredTop.length > 0 ? (
            <HStack spacing={1} flexWrap="wrap" pt={2}>
              <Text fontSize="xs" color="gray.400">
                Required:
              </Text>
              {requiredTop.map((r) => (
                <Badge key={r} variant="outline" colorScheme="red" fontSize="0.6rem">
                  {r}
                </Badge>
              ))}
            </HStack>
          ) : null}
          {errors && Object.keys(errors).length > 0 ? (
            <VStack align="stretch" spacing={0.5} pt={2}>
              {Object.entries(errors).map(([path, msg]) => (
                <Text key={path} fontSize="xs" color="danger">
                  {path}: {msg}
                </Text>
              ))}
            </VStack>
          ) : null}
        </VStack>
      )}
    </VStack>
  );
}

// ── validation helper ────────────────────────────────────────────────────

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Lightweight validator that catches the cases the form already prevents at
 *  input time but is also useful as a final gate before broadcast. */
export function validateAgainstSchema(
  schema: SchemaObject,
  value: JsonValue,
  pathPrefix: string[] = [],
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const kind = inferKind(schema);
  const here = pathPrefix.length === 0 ? '/' : '/' + pathPrefix.join('/');
  const joinChild = (child: string) =>
    here === '/' ? '/' + child : here + '/' + child;

  const isMissing = value === undefined || value === '' || value === null;
  if (isMissing) {
    // required-ness is enforced one level up
    return out;
  }

  if (kind === 'object') {
    if (!isObject(value)) {
      out.push({ path: here, message: `expected object, got ${typeof value}` });
      return out;
    }
    const props = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? (schema.required as string[])
      : [];
    for (const r of required) {
      if (!(r in value) || value[r] === '' || value[r] === undefined || value[r] === null) {
        out.push({ path: joinChild(r), message: 'required' });
      }
    }
    for (const [k, defUnknown] of Object.entries(props)) {
      if (!isObject(defUnknown)) continue;
      if (!(k in value)) continue;
      out.push(...validateAgainstSchema(defUnknown, value[k], [...pathPrefix, k]));
    }
  } else if (kind === 'array') {
    if (!Array.isArray(value)) {
      out.push({ path: here, message: `expected array, got ${typeof value}` });
      return out;
    }
    const itemSchema = isObject(schema.items) ? schema.items : null;
    if (itemSchema) {
      value.forEach((v, i) => {
        out.push(...validateAgainstSchema(itemSchema, v, [...pathPrefix, String(i)]));
      });
    }
  } else if (kind === 'string') {
    if (typeof value !== 'string') {
      out.push({ path: here, message: `expected string` });
    } else {
      const maxLength = typeof schema.maxLength === 'number' ? schema.maxLength : undefined;
      if (maxLength !== undefined && value.length > maxLength) {
        out.push({ path: here, message: `max length ${maxLength}` });
      }
      const minLength = typeof schema.minLength === 'number' ? schema.minLength : undefined;
      if (minLength !== undefined && value.length < minLength) {
        out.push({ path: here, message: `min length ${minLength}` });
      }
      const pat = typeof schema.pattern === 'string' ? schema.pattern : undefined;
      if (pat && !new RegExp(pat).test(value)) {
        out.push({ path: here, message: `pattern: ${pat}` });
      }
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        out.push({ path: here, message: `must be one of ${schema.enum.join(', ')}` });
      }
    }
  } else if (kind === 'integer' || kind === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      out.push({ path: here, message: `expected number` });
    } else {
      const min = typeof schema.minimum === 'number' ? schema.minimum : undefined;
      const max = typeof schema.maximum === 'number' ? schema.maximum : undefined;
      if (min !== undefined && value < min) out.push({ path: here, message: `>= ${min}` });
      if (max !== undefined && value > max) out.push({ path: here, message: `<= ${max}` });
      if (kind === 'integer' && !Number.isInteger(value)) {
        out.push({ path: here, message: 'must be integer' });
      }
    }
  } else if (kind === 'boolean') {
    if (typeof value !== 'boolean') {
      out.push({ path: here, message: `expected boolean` });
    }
  }
  return out;
}

/** Convenience: returns map keyed by path for SchemaForm.errors. */
export function issuesToErrorMap(issues: ValidationIssue[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const i of issues) map[i.path] = i.message;
  return map;
}

// Re-export validator helper symbol for forms.
export { isObject };

// Track unused-state warnings.
void Checkbox;

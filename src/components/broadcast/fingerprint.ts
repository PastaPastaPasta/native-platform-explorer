// Tag every primitive so bigint credits cannot collide with a string or JSON
// object supplied by a form. Sorting keys makes equivalent JSON edits stable.
export function fingerprint(value: unknown): string {
  function encode(input: unknown): unknown {
    if (input === null) return ['null'];
    if (typeof input !== 'object') return [typeof input, String(input)];
    if (input instanceof Uint8Array) return ['bytes', Array.from(input)];
    if (Array.isArray(input)) return ['array', input.map(encode)];
    return [
      'object',
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, encode(item)]),
    ];
  }
  return JSON.stringify(encode(value));
}

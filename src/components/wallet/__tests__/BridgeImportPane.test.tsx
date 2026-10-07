import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';
import { createBackupSigner } from '@/signer/backup';
import type * as BackupModule from '@/signer/backup';
import { createSdkContextValue } from '@/test/sdk';
import { createMockSigner } from '@/test/signer';
import { BridgeImportPane } from '../BridgeImportPane';

vi.mock('@sdk/hooks', () => ({ useSdk: vi.fn() }));
vi.mock('@/signer/SignerProvider', () => ({ useSigner: vi.fn() }));
vi.mock('@/signer/backup', async (importOriginal) => ({
  ...(await importOriginal<typeof BackupModule>()),
  createBackupSigner: vi.fn(),
}));

const backup = {
  network: 'testnet',
  identityId: '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr',
  identityKeys: [{ id: 0, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', privateKeyWif: 'invalid-test-WIF' }],
};
const connect = vi.fn();

function pasteBackup(value = backup) {
  const input = screen.getByRole('textbox', { name: 'Bridge backup JSON' });
  fireEvent.change(input, { target: { value: JSON.stringify(value) } });
  fireEvent.blur(input);
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSdk).mockReturnValue(createSdkContextValue());
  vi.mocked(useSigner).mockReturnValue({ signer: null, stash: null, connect, disconnect: vi.fn(), clearStash: vi.fn() });
});

describe('BridgeImportPane', () => {
  it('blocks imports during reconnects and when the backup network differs', () => {
    const context = createSdkContextValue({ status: 'connecting' });
    vi.mocked(useSdk).mockReturnValue(context);
    const view = render(<BridgeImportPane />);
    pasteBackup();
    expect(screen.getByRole('button', { name: 'Use this identity' })).toBeDisabled();
    expect(createBackupSigner).not.toHaveBeenCalled();

    vi.mocked(useSdk).mockReturnValue({ ...context, status: 'ready', network: 'mainnet' });
    view.rerender(<BridgeImportPane />);
    expect(screen.getByText('Network mismatch')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use this identity' })).toBeDisabled();
  });

  it('clears secret-bearing drafts on failure and allows a fresh attempt', async () => {
    vi.mocked(createBackupSigner).mockRejectedValueOnce(new Error('Key did not match'));
    vi.mocked(createBackupSigner).mockResolvedValueOnce(createMockSigner());
    render(<BridgeImportPane />);
    const input = pasteBackup();
    fireEvent.click(screen.getByRole('button', { name: 'Use this identity' }));
    expect(await screen.findByText('Key did not match')).toBeVisible();
    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Use this identity' })).toBeNull();
    expect(connect).not.toHaveBeenCalled();

    pasteBackup();
    fireEvent.click(screen.getByRole('button', { name: 'Use this identity' }));
    await waitFor(() => expect(connect).toHaveBeenCalledOnce());
    expect(input).toHaveValue('');
  });

  it('invalidates the parsed backup immediately when its source changes', () => {
    render(<BridgeImportPane />);
    const input = pasteBackup();
    expect(screen.getByRole('button', { name: 'Use this identity' })).toBeEnabled();
    fireEvent.change(input, { target: { value: 'invalid JSON' } });
    expect(screen.queryByRole('button', { name: 'Use this identity' })).toBeNull();
    expect(createBackupSigner).not.toHaveBeenCalled();
  });

  it('disables secret editing and discard while an import is pending', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(createBackupSigner).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    render(<BridgeImportPane />);
    const input = pasteBackup();
    fireEvent.click(screen.getByRole('button', { name: 'Use this identity' }));
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
    reject(new Error('Import cancelled'));
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('');
  });

  it('invalidates the current preview while reading a file and ignores a discarded read', async () => {
    let resolve!: (value: string) => void;
    const file = { text: () => new Promise<string>((done) => { resolve = done; }) };
    render(<BridgeImportPane />);
    const input = pasteBackup();
    fireEvent.change(screen.getByLabelText('Bridge backup file'), { target: { files: [file] } });
    expect(screen.queryByRole('button', { name: 'Use this identity' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Reading backup file');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await act(async () => resolve(JSON.stringify(backup)));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Use this identity' })).toBeNull();
  });

  it('does not overwrite edited JSON with a late file read', async () => {
    let resolve!: (value: string) => void;
    const file = { text: () => new Promise<string>((done) => { resolve = done; }) };
    render(<BridgeImportPane />);
    fireEvent.change(screen.getByLabelText('Bridge backup file'), { target: { files: [file] } });
    const edited = { ...backup, identityId: '9eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr' };
    const input = pasteBackup(edited);
    await act(async () => resolve(JSON.stringify(backup)));
    await waitFor(() => expect(screen.getByText(edited.identityId)).toBeVisible());
    expect(input).toHaveValue(JSON.stringify(edited));
    expect(screen.queryByText(backup.identityId)).toBeNull();
  });
});

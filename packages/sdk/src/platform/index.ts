// Platform adapters — web variant (self-contained).
// Consumed as @drakkar.software/octovault-sdk/platform.
// hash-wasm-shim stays as its own dedicated subpath entry (./hash-wasm-shim).

import { createVaultStorage, enrollPasskey as _enrollPasskey } from '@drakkar.software/octospaces-platform-sdk';
import type { VaultLoad, UnlockMethod, Vault, SeedLock, PasskeyEnrollment } from '@drakkar.software/octospaces-sdk';

export { kvGet, kvSet, kvRemove } from '@drakkar.software/octospaces-platform-sdk';
export { configureStarfishPlatform } from '@drakkar.software/octospaces-platform-sdk';
export { passkeyEnrollable, evalPasskey } from '@drakkar.software/octospaces-platform-sdk';
export type { PersistedSession } from '@drakkar.software/octospaces-sdk';
export { subscribeArgon2Progress } from './hash-wasm-shim';

const _vault = createVaultStorage({ storageKey: 'octovault.session.v1' });

export const loadVault = (): Promise<VaultLoad> => _vault.loadVault();
export const vaultMethods = (): UnlockMethod[] => _vault.vaultMethods();
export const unlockVault = (method: UnlockMethod, pin?: string): Promise<Vault> => _vault.unlockVault(method, pin);
export const saveVault = (vault: Vault, lock?: SeedLock): Promise<void> => _vault.saveVault(vault, lock);
export const addPasskeyToVault = (passkey: PasskeyEnrollment): Promise<void> => _vault.addPasskeyToVault(passkey);
export const removePasskeyFromVault = (): Promise<void> => _vault.removePasskeyFromVault();
export const clearVault = (): Promise<void> => _vault.clearVault();
export const passkeySupported = (): boolean => _vault.passkeySupported();

export const enrollPasskey = (displayName: string): Promise<PasskeyEnrollment> =>
  _enrollPasskey(displayName, 'OctoVault', 'octovault');

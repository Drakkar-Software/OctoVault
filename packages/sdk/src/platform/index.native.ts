// Platform adapters — native variant (React Native / Expo).
// Consumed as @drakkar.software/octovault-sdk/platform on native.
// hash-wasm-shim stays as its own dedicated subpath entry (./hash-wasm-shim).

import { createVaultStorageNative, enrollPasskey as _enrollPasskey } from '@drakkar.software/octospaces-platform-sdk';
import type { PasskeyEnrollment } from '@drakkar.software/octospaces-sdk';

export { kvGet, kvSet, kvRemove } from '@drakkar.software/octospaces-platform-sdk';
export { configureStarfishPlatform } from '@drakkar.software/octospaces-platform-sdk';
export { passkeyEnrollable, evalPasskey } from '@drakkar.software/octospaces-platform-sdk';
export type { PersistedSession } from '@drakkar.software/octospaces-sdk';
export { subscribeArgon2Progress } from './hash-wasm-shim';

const _vault = createVaultStorageNative({ storageKey: 'octovault_session_v1' });

export const loadVault = () => _vault.loadVault();
export const vaultMethods = () => _vault.vaultMethods();
export const unlockVault = _vault.unlockVault.bind(_vault);
export const saveVault = _vault.saveVault.bind(_vault);
export const addPasskeyToVault = _vault.addPasskeyToVault.bind(_vault);
export const removePasskeyFromVault = () => _vault.removePasskeyFromVault();
export const clearVault = () => _vault.clearVault();
export const passkeySupported = () => _vault.passkeySupported();

export const enrollPasskey = (displayName: string): Promise<PasskeyEnrollment> =>
  _enrollPasskey(displayName, 'OctoVault', 'octovault');

/**
 * Module augmentation — adds the native exports from `@drakkar.software/dk-spaces-platform-sdk`
 * that TypeScript cannot see when `moduleResolution: Bundler` resolves the web barrel (index.d.ts).
 * Metro resolves index.native.js at runtime, which exports these correctly.
 * Remove this file once dk-spaces-platform-sdk's exports resolution is fixed for Bundler.
 */
export type {};

declare module '@drakkar.software/dk-spaces-platform-sdk' {
  export interface VaultStorageNative {
    loadVault(): Promise<import('@drakkar.software/starfish-spaces').VaultLoad>;
    vaultMethods(): import('@drakkar.software/starfish-spaces').UnlockMethod[];
    unlockVault(
      method: import('@drakkar.software/starfish-spaces').UnlockMethod,
      pin?: string,
    ): Promise<import('@drakkar.software/starfish-spaces').Vault>;
    saveVault(
      vault: import('@drakkar.software/starfish-spaces').Vault,
      lock?: import('@drakkar.software/starfish-spaces').SeedLock,
    ): Promise<void>;
    addPasskeyToVault(
      passkey: import('@drakkar.software/starfish-spaces').PasskeyEnrollment,
    ): Promise<void>;
    removePasskeyFromVault(): Promise<void>;
    clearVault(): Promise<void>;
    passkeySupported(): boolean;
  }
  export function createVaultStorageNative(opts: {
    storageKey: string;
  }): VaultStorageNative;
}

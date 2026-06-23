import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'platform/index': 'src/platform/index.ts',
    'platform/index.native': 'src/platform/index.native.ts',
    'platform/hash-wasm-shim': 'src/platform/hash-wasm-shim.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  external: [
    '@drakkar.software/starfish-client',
    '@drakkar.software/starfish-identities',
    '@drakkar.software/starfish-keyring',
    '@drakkar.software/starfish-protocol',
    '@drakkar.software/starfish-sharing',
    '@drakkar.software/starfish-spaces',
    '@drakkar.software/starfish-wal',
    '@react-native-async-storage/async-storage',
    'expo-secure-store',
    'react-native-quick-crypto',
  ],
});

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// react-native ships Flow-typed source (`import typeof`) that esbuild can't parse; redirect to stub.
const rnMock = fileURLToPath(new URL('./__mocks__/react-native.js', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // @/ path alias (tsconfig paths)
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Redirect every react-native import (and sub-paths) to the minimal stub.
      { find: /^react-native(\/.*)?$/, replacement: rnMock },
    ],
  },
  test: {
    // Force octospaces-ui through vite's transform so the react-native alias applies to its imports.
    server: {
      deps: {
        inline: ['@drakkar.software/octospaces-ui'],
      },
    },
  },
});

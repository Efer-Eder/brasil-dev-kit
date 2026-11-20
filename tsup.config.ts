import { defineConfig } from 'tsup';

export default defineConfig([
  // Biblioteca publicada (ESM + CJS + tipos).
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
    treeshake: true,
  },
  // API HTTP: um único arquivo, sem dependências de runtime, para o container.
  {
    entry: { server: 'server/src/main.ts' },
    outDir: 'dist-server',
    format: ['esm'],
    platform: 'node',
    target: 'node24',
    sourcemap: true,
    clean: true,
    noExternal: [/.*/],
  },
]);

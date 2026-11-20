import { defineConfig } from 'vitest/config';

// Testes contra as APIs reais. Não rodam no `pnpm test` nem no CI obrigatório,
// para que indisponibilidade de terceiros não quebre o build.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    retry: 1,
  },
});

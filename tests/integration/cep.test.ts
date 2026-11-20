import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/core/errors.js';
import { createCepClient } from '../../src/modules/cep/index.js';

// Contrato com os provedores reais: confere que o formato gravado nas fixtures
// continua valendo. Rode com `pnpm test:integration`.
describe.each(['viacep', 'brasilapi'] as const)('CEP real via %s', (provider) => {
  const cep = createCepClient({
    providers: [provider],
    timeoutMs: 10_000,
    userAgent: 'brasil-dev-kit-integration-tests',
  });

  it('encontra a Avenida Paulista (01310-100)', async () => {
    const endereco = await cep.lookup('01310-100');
    expect(endereco).toMatchObject({
      cep: '01310100',
      uf: 'SP',
      municipio: 'São Paulo',
      codigoIbgeMunicipio: '3550308',
      fonte: { provedor: provider },
    });
    expect(endereco.logradouro).toMatch(/Paulista/);
  });

  it('não encontra 00000-000', async () => {
    await expect(cep.lookup('00000000')).rejects.toBeInstanceOf(NotFoundError);
  });
});

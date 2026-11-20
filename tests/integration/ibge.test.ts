import { describe, expect, it } from 'vitest';
import { createIbgeClient } from '../../src/modules/ibge/index.js';

// Contrato com a API de Localidades real do IBGE. Rode com `pnpm test:integration`.
describe('IBGE real', () => {
  const ibge = createIbgeClient({
    timeoutMs: 15_000,
    userAgent: 'brasil-dev-kit-integration-tests',
  });

  it('lista 27 UFs', async () => {
    const ufs = await ibge.listUfs();
    expect(ufs).toHaveLength(27);
    expect(ufs.find((u) => u.sigla === 'SP')).toMatchObject({
      codigoIbge: '35',
      nome: 'São Paulo',
    });
  });

  it('lista os municípios do DF', async () => {
    const municipios = await ibge.listMunicipios('DF');
    expect(municipios).toEqual([
      expect.objectContaining({ codigoIbge: '5300108', nome: 'Brasília', uf: 'DF' }),
    ]);
  });
});

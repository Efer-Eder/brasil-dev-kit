import { describe, expect, it } from 'vitest';
import { createBancosClient } from '../../src/modules/bancos/index.js';

// Contrato com o arquivo real do Banco Central. Rode com `pnpm test:integration`.
describe('Bancos (participantes do STR) real', () => {
  const bancos = createBancosClient({
    timeoutMs: 20_000,
    userAgent: 'brasil-dev-kit-integration-tests',
  });

  it('lê a lista inteira com o formato esperado', async () => {
    const lista = await bancos.list();
    expect(lista.length).toBeGreaterThan(300);
    expect(new Set(lista.map((b) => b.ispb)).size).toBe(lista.length);
  });

  it('encontra o Banco do Brasil por código e por ISPB', async () => {
    expect(await bancos.getByCodigo('001')).toMatchObject({ ispb: '00000000', codigo: '001' });
    expect((await bancos.getByIspb('0'))?.codigo).toBe('001');
  });
});

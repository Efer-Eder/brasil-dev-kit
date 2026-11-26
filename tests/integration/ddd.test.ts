import { describe, expect, it } from 'vitest';
// @ts-expect-error: script JavaScript sem tipos.
import { PGCN_CSV_NAME, PGCN_ZIP_URL, parsePgcnCsv, unzipEntry } from '../../scripts/ddd/pgcn.mjs';
import { getDddPorMunicipio, PGCN_VERSAO } from '../../src/modules/ddd/index.js';

// Compara a tabela embutida com o PGCN publicado hoje pela Anatel.
// Se falhar por diferença, rode `pnpm data:ddd` e revise o diff.
describe('DDD x PGCN atual da Anatel', () => {
  it('a tabela embutida bate com o arquivo oficial', async () => {
    const res = await fetch(PGCN_ZIP_URL, {
      headers: { 'user-agent': 'brasil-dev-kit-integration-tests' },
      signal: AbortSignal.timeout(30_000),
    });
    expect(res.status).toBe(200);
    const zip = Buffer.from(await res.arrayBuffer());
    const vigentes = parsePgcnCsv(unzipEntry(zip, PGCN_CSV_NAME).toString('utf8')) as {
      codigoIbge: string;
      ddd: string;
    }[];

    const divergentes = vigentes.filter((v) => getDddPorMunicipio(v.codigoIbge)?.ddd !== v.ddd);
    expect(divergentes, `tabela de ${PGCN_VERSAO.atualizadoEm} desatualizada`).toEqual([]);
    expect(vigentes).toHaveLength(PGCN_VERSAO.municipios);
  }, 40_000);
});

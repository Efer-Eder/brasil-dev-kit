import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: script JavaScript sem tipos, usado só para conferir a tabela.
import { PGCN_CSV_NAME, parsePgcnCsv, unzipEntry } from '../../../scripts/ddd/pgcn.mjs';
import { ValidationError } from '../../../src/core/errors.js';
import {
  getDdd,
  getDddPorMunicipio,
  isDddValido,
  listDdds,
  normalizeDdd,
  PGCN_VERSAO,
} from '../../../src/modules/ddd/index.js';

interface LinhaPgcn {
  codigoIbge: string;
  uf: string;
  municipio: string;
  ddd: string;
}

const ZIP = readFileSync(new URL('../../fixtures/ddd/anatel/pgcn.zip', import.meta.url));
const vigentes = parsePgcnCsv(unzipEntry(ZIP, PGCN_CSV_NAME).toString('utf8')) as LinhaPgcn[];

describe('tabela embutida x arquivo oficial gravado (Anatel, 2026-11-23)', () => {
  it('a versão registrada é a do ZIP gravado', async () => {
    const { createHash } = await import('node:crypto');
    expect(PGCN_VERSAO.sha256).toBe(createHash('sha256').update(ZIP).digest('hex'));
    expect(PGCN_VERSAO.municipios).toBe(5571);
  });

  it('todo município vigente do arquivo tem o mesmo DDD, nome e UF na tabela', () => {
    expect(vigentes).toHaveLength(5571);
    for (const linha of vigentes) {
      expect(getDddPorMunicipio(linha.codigoIbge)).toMatchObject({
        ddd: linha.ddd,
        municipio: { codigoIbge: linha.codigoIbge, nome: linha.municipio, uf: linha.uf },
      });
    }
  });

  it('67 DDDs em uso, somando os 5571 municípios', () => {
    const ddds = listDdds();
    expect(ddds).toHaveLength(67);
    expect(ddds.reduce((n, d) => n + d.totalMunicipios, 0)).toBe(5571);
  });
});

describe('getDdd', () => {
  it('61 atende DF e parte de GO', () => {
    const ddd = getDdd('61');
    expect(ddd?.ufs).toEqual(['DF', 'GO']);
    expect(ddd?.municipios).toContainEqual({ codigoIbge: '5300108', nome: 'Brasília', uf: 'DF' });
    expect(ddd?.fonte).toEqual({
      provedor: 'anatel',
      servicoOrigem: 'pgcn',
      atualizadoEm: '2026-11-23',
      url: 'https://www.anatel.gov.br/dadosabertos/paineis_de_dados/areastarifarias/pgcn.zip',
    });
  });

  it('11 inclui São Paulo, em ordem alfabética', () => {
    const nomes = getDdd(11)?.municipios.map((m) => m.nome) ?? [];
    expect(nomes).toContain('São Paulo');
    expect([...nomes].sort(new Intl.Collator('pt-BR').compare)).toEqual(nomes);
  });

  it('formato válido sem uso devolve null', () => {
    expect(getDdd('29')).toBeNull();
    expect(getDdd('23')).toBeNull();
  });

  it('devolve cópias', () => {
    const a = getDdd('11');
    a?.municipios.splice(0);
    expect(getDdd('11')?.municipios.length).toBeGreaterThan(0);
  });
});

describe('normalizeDdd e isDddValido', () => {
  it.each([
    ['11', '11'],
    [11, '11'],
    ['(21)', '21'],
    ['011', '11'],
    [' 61 ', '61'],
  ] as const)('%j → %s', (input, expected) => {
    expect(normalizeDdd(input)).toBe(expected);
  });

  it.each(['', '1', '10', '01', '100', 'ab', 0, 9])('rejeita %j', (input) => {
    expect(() => normalizeDdd(input)).toThrow(ValidationError);
  });

  it('isDddValido não lança', () => {
    expect(isDddValido('11')).toBe(true);
    expect(isDddValido('20')).toBe(false);
    expect(isDddValido('52')).toBe(false);
    expect(isDddValido('xx')).toBe(false);
  });
});

describe('listDdds e getDddPorMunicipio', () => {
  it('filtra por UF, incluindo DDDs que cruzam a divisa', () => {
    expect(listDdds({ uf: 'df' }).map((d) => d.ddd)).toEqual(['61']);
    expect(listDdds({ uf: 'SC' }).map((d) => d.ddd)).toEqual(['42', '47', '48', '49']);
    expect(() => listDdds({ uf: 'XX' })).toThrow(ValidationError);
  });

  it('município novo (Boa Esperança do Norte, MT) tem DDD 66', () => {
    expect(getDddPorMunicipio(5101837)?.ddd).toBe('66');
  });

  it('código inexistente devolve null; formato inválido lança', () => {
    expect(getDddPorMunicipio('9999999')).toBeNull();
    expect(() => getDddPorMunicipio('35503')).toThrow(ValidationError);
  });
});

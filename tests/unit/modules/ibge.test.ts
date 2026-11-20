import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NotFoundError,
  ProviderUnavailableError,
  RateLimitError,
  ValidationError,
} from '../../../src/core/errors.js';
import type { FetchLike } from '../../../src/core/http.js';
import { createIbgeClient, resolveUf, UF_CODES } from '../../../src/modules/ibge/index.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/ibge/api/${name}`, import.meta.url), 'utf8');

const BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades/';
const ESTADOS = `${BASE}estados?orderBy=nome`;
const MUNICIPIOS = (code: string) => `${BASE}estados/${code}/municipios?orderBy=nome`;

function routedFetch(routes: Record<string, { body: string; status?: number }>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error(`URL não mapeada no teste: ${url}`);
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, calls };
}

describe('resolveUf', () => {
  it.each([
    ['SP', { sigla: 'SP', codigoIbge: '35' }],
    [' sp ', { sigla: 'SP', codigoIbge: '35' }],
    [35, { sigla: 'SP', codigoIbge: '35' }],
    ['53', { sigla: 'DF', codigoIbge: '53' }],
  ] as const)('resolve %j', (input, expected) => {
    expect(resolveUf(input)).toEqual(expected);
  });

  it.each(['XX', '', '99', 10, 'São Paulo'])('rejeita %j', (input) => {
    expect(() => resolveUf(input)).toThrow(ValidationError);
  });

  it('a tabela estática coincide com a resposta real de /estados', () => {
    const estados = JSON.parse(fixture('estados-orderby-nome.json')) as {
      id: number;
      sigla: string;
    }[];
    const fromApi = Object.fromEntries(estados.map((e) => [e.sigla, String(e.id)]));
    expect(UF_CODES).toEqual(fromApi);
  });
});

describe('createIbgeClient().listUfs', () => {
  it('normaliza as 27 UFs ordenadas pelo nome', async () => {
    const { fetch, calls } = routedFetch({
      [ESTADOS]: { body: fixture('estados-orderby-nome.json') },
    });
    const ufs = await createIbgeClient({ fetch }).listUfs();

    expect(calls).toEqual([ESTADOS]);
    expect(ufs).toHaveLength(27);
    expect(ufs[0]).toEqual({
      codigoIbge: '12',
      sigla: 'AC',
      nome: 'Acre',
      regiao: { codigoIbge: '1', sigla: 'N', nome: 'Norte' },
    });
    expect(ufs.map((u) => u.sigla)).toContain('DF');
  });

  it('lista vazia → ProviderUnavailableError', async () => {
    const { fetch } = routedFetch({ [ESTADOS]: { body: '[]' } });
    await expect(createIbgeClient({ fetch }).listUfs()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});

describe('createIbgeClient().listMunicipios', () => {
  it('lista os 15 municípios de RR usando o código na URL', async () => {
    const { fetch, calls } = routedFetch({
      [MUNICIPIOS('14')]: { body: fixture('municipios-14-orderby-nome.json') },
    });
    const municipios = await createIbgeClient({ fetch }).listMunicipios('rr');

    expect(calls).toEqual([MUNICIPIOS('14')]);
    expect(municipios).toHaveLength(15);
    expect(municipios[0]).toEqual({
      codigoIbge: '1400050',
      nome: 'Alto Alegre',
      uf: 'RR',
      microrregiao: { codigoIbge: '14001', nome: 'Boa Vista' },
      mesorregiao: { codigoIbge: '1401', nome: 'Norte de Roraima' },
      regiaoImediata: { codigoIbge: '140001', nome: 'Boa Vista' },
      regiaoIntermediaria: { codigoIbge: '1401', nome: 'Boa Vista' },
    });
  });

  it('aceita o código numérico da UF (DF = 53)', async () => {
    const { fetch } = routedFetch({
      [MUNICIPIOS('53')]: { body: fixture('municipios-53-orderby-nome.json') },
    });
    const municipios = await createIbgeClient({ fetch }).listMunicipios(53);
    expect(municipios).toEqual([
      expect.objectContaining({ codigoIbge: '5300108', nome: 'Brasília', uf: 'DF' }),
    ]);
  });

  it('município sem microrregião (caso real em MT) vira null, sem erro', async () => {
    const { fetch } = routedFetch({
      [MUNICIPIOS('51')]: { body: fixture('municipios-51-orderby-nome.json') },
    });
    const municipios = await createIbgeClient({ fetch }).listMunicipios('MT');
    expect(municipios).toHaveLength(142);
    const semMicro = municipios.filter((m) => m.microrregiao === null);
    expect(semMicro).toEqual([
      expect.objectContaining({
        codigoIbge: '5101837',
        nome: 'Boa Esperança do Norte',
        microrregiao: null,
        mesorregiao: null,
      }),
    ]);
    expect(semMicro[0]?.regiaoImediata).not.toBeNull();
  });

  it('UF inválida gera ValidationError sem requisição', async () => {
    const { fetch, calls } = routedFetch({});
    await expect(createIbgeClient({ fetch }).listMunicipios('XX')).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(calls).toHaveLength(0);
  });

  it('lista vazia para UF válida (como a API faz para UF inexistente) → ProviderUnavailableError', async () => {
    const { fetch } = routedFetch({
      [MUNICIPIOS('35')]: { body: fixture('municipios-99-vazio.json') },
    });
    await expect(createIbgeClient({ fetch }).listMunicipios('SP')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it.each([
    ['corpo não é lista', '{"id":1}'],
    ['item sem nome', '[{"id":3550308}]'],
    ['id inválido', '[{"id":"abc","nome":"X"}]'],
    ['município de outra UF', '[{"id":3304557,"nome":"Rio de Janeiro"}]'],
    ['microrregião com formato errado', '[{"id":3550308,"nome":"São Paulo","microrregiao":"x"}]'],
  ])('%s → ProviderUnavailableError', async (_label, body) => {
    const { fetch } = routedFetch({ [MUNICIPIOS('35')]: { body } });
    const error = await createIbgeClient({ fetch })
      .listMunicipios('SP')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ provider: 'ibge' });
  });

  it('propaga erros HTTP tipados do core', async () => {
    const { fetch } = routedFetch({
      [MUNICIPIOS('35')]: { body: '', status: 429 },
      [ESTADOS]: { body: '', status: 404 },
    });
    const ibge = createIbgeClient({ fetch });
    await expect(ibge.listMunicipios('SP')).rejects.toBeInstanceOf(RateLimitError);
    await expect(ibge.listUfs()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('repassa o AbortSignal', async () => {
    const controller = new AbortController();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const promise = createIbgeClient({ fetch }).listUfs({ signal: controller.signal });
    const reason = new Error('cancelado');
    controller.abort(reason);
    await expect(promise).rejects.toBe(reason);
  });
});

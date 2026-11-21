import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProviderUnavailableError } from '../../src/core/errors.js';
import type { FetchLike } from '../../src/core/http.js';
import { createBrasilDevKit } from '../../src/index.js';

const fixture = (path: string) =>
  readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');

const VIACEP = 'https://viacep.com.br/ws/01310100/json/';
const BRASILAPI = 'https://brasilapi.com.br/api/cep/v1/01310100';
const IBGE_UFS = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';

function routed(routes: Record<string, { body: string; status?: number }>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`URL não mapeada: ${url}`);
    return new Response(route.body, { status: route.status ?? 200 });
  };
  return { fetch, calls };
}

describe('createBrasilDevKit', () => {
  it('expõe os quatro módulos e é imutável', () => {
    const br = createBrasilDevKit({ fetch: routed({}).fetch });
    expect(Object.keys(br).sort()).toEqual(['cep', 'cnpj', 'feriados', 'ibge']);
    expect(Object.isFrozen(br)).toBe(true);
    expect(Object.isFrozen(br.cnpj)).toBe(true);
  });

  it('as opções comuns (fetch, cache) valem para CEP e IBGE', async () => {
    const { fetch, calls } = routed({
      [VIACEP]: { body: fixture('cep/viacep/01310100.json') },
      [IBGE_UFS]: { body: fixture('ibge/api/estados-orderby-nome.json') },
    });
    const br = createBrasilDevKit({ fetch, cacheTtlMs: 60_000 });

    expect((await br.cep.lookup('01310-100')).municipio).toBe('São Paulo');
    await br.cep.lookup('01310100');
    expect(await br.ibge.listUfs()).toHaveLength(27);
    await br.ibge.listUfs();

    expect(calls).toEqual([VIACEP, IBGE_UFS]);
  });

  it('opções do módulo sobrescrevem as comuns só naquele módulo', async () => {
    const { fetch, calls } = routed({
      [BRASILAPI]: { body: fixture('cep/brasilapi/01310100.json') },
      [IBGE_UFS]: { body: '', status: 500 },
    });
    const br = createBrasilDevKit({
      fetch,
      retry: { retries: 2, baseDelayMs: 0 },
      cep: { providers: ['brasilapi'] },
      ibge: { retry: false },
    });

    expect((await br.cep.lookup('01310100')).fonte.provedor).toBe('brasilapi');
    await expect(br.ibge.listUfs()).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls.filter((u) => u === IBGE_UFS)).toHaveLength(1);
  });

  it('retry comum vale para o IBGE quando o módulo não sobrescreve', async () => {
    const { fetch, calls } = routed({ [IBGE_UFS]: { body: '', status: 503 } });
    const br = createBrasilDevKit({ fetch, retry: { retries: 1, baseDelayMs: 0 } });
    await expect(br.ibge.listUfs()).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls).toHaveLength(2);
  });

  it('feriados e CNPJ funcionam sem rede', () => {
    const { fetch, calls } = routed({});
    const br = createBrasilDevKit({ fetch });

    expect(br.feriados.getNacionais(2026).origem).toBe('portaria');
    expect(br.feriados.isFeriado('2026-11-20')).toBe(true);
    expect(br.feriados.buscar('2026-02-18')).toMatchObject({ periodo: 'ate_14h' });

    expect(br.cnpj.validate('12.ABC.345/01DE-35')).toMatchObject({
      valid: true,
      kind: 'alphanumeric',
    });
    expect(br.cnpj.isValid('11222333000182')).toBe(false);
    expect(br.cnpj.format('11222333000181')).toBe('11.222.333/0001-81');
    expect(br.cnpj.normalize('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(br.cnpj.computeCheckDigits('12ABC34501DE')).toBe('35');

    expect(calls).toHaveLength(0);
  });
});

describe('createBrasilDevKit: etapas do CNPJ', () => {
  it('expõe sintaxe e DV separados', () => {
    const br = createBrasilDevKit({ fetch: async () => new Response('{}') });
    expect(br.cnpj.checkSyntax('12ABC34501DE36')).toMatchObject({ valid: true });
    expect(br.cnpj.hasValidCheckDigits('12ABC34501DE36')).toBe(false);
    expect(br.cnpj.format('12ABC34501DE36', { checkDigits: false })).toBe('12.ABC.345/01DE-36');
  });
});

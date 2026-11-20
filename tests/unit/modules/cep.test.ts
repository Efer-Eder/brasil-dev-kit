import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpError,
  NotFoundError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from '../../../src/core/errors.js';
import type { FetchLike } from '../../../src/core/http.js';
import {
  createCepClient,
  formatCep,
  isValidCepFormat,
  normalizeCep,
} from '../../../src/modules/cep/index.js';

const fixture = (path: string) =>
  readFileSync(new URL(`../../fixtures/cep/${path}`, import.meta.url), 'utf8');

interface Route {
  body: string;
  status?: number;
  headers?: Record<string, string>;
}

/** fetch falso que responde por URL a partir de fixtures gravadas e registra as chamadas. */
function routedFetch(routes: Record<string, Route | Error>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error(`URL não mapeada no teste: ${url}`);
    if (route instanceof Error) throw route;
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...route.headers },
    });
  };
  return { fetch, calls };
}

const VIACEP = (cep: string) => `https://viacep.com.br/ws/${cep}/json/`;
const BRASILAPI = (cep: string) => `https://brasilapi.com.br/api/cep/v1/${cep}`;

const viacepOk: Route = { body: fixture('viacep/01310100.json') };
const viacepNotFound: Route = { body: fixture('viacep/99999999-nao-encontrado.json') };
const brasilapiOk: Route = { body: fixture('brasilapi/01310100.json') };
const brasilapiNotFound: Route = {
  body: fixture('brasilapi/00000000-nao-encontrado.json'),
  status: 404,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('formato de CEP', () => {
  it.each(['01310-100', '01310100', ' 01.310-100 '])('aceita %j', (input) => {
    expect(isValidCepFormat(input)).toBe(true);
    expect(normalizeCep(input)).toBe('01310100');
    expect(formatCep(input)).toBe('01310-100');
  });

  // Exemplos de formato inválido citados na documentação do ViaCEP + outros limites.
  it.each(['950100100', '95010A10', '0131010', '', 'abcdefgh'])('rejeita %j', (input) => {
    expect(isValidCepFormat(input)).toBe(false);
    expect(() => formatCep(input)).toThrow(ValidationError);
  });
});

describe('createCepClient().lookup com ViaCEP (fixtures reais)', () => {
  it('normaliza o endereço e informa a procedência', async () => {
    const { fetch, calls } = routedFetch({ [VIACEP('01310100')]: viacepOk });
    const cep = createCepClient({ fetch, providers: ['viacep'] });

    await expect(cep.lookup('01310-100')).resolves.toEqual({
      cep: '01310100',
      uf: 'SP',
      municipio: 'São Paulo',
      bairro: 'Bela Vista',
      logradouro: 'Avenida Paulista',
      complemento: 'de 612 a 1510 - lado par',
      codigoIbgeMunicipio: '3550308',
      fonte: { provedor: 'viacep', servicoOrigem: null },
    });
    expect(calls).toEqual([VIACEP('01310100')]);
  });

  it('converte {"erro": "true"} em NotFoundError', async () => {
    const { fetch } = routedFetch({ [VIACEP('99999999')]: viacepNotFound });
    const cep = createCepClient({ fetch, providers: ['viacep'] });
    const error = await cep.lookup('99999-999').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ provider: 'viacep' });
  });

  it('aceita {"erro": true} booleano também', async () => {
    const { fetch } = routedFetch({ [VIACEP('99999999')]: { body: '{"erro": true}' } });
    const cep = createCepClient({ fetch, providers: ['viacep'] });
    await expect(cep.lookup('99999999')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('trata a página HTML de erro 400 como HttpError', async () => {
    // Não deveria acontecer (o formato é validado antes), mas o contrato fica coberto.
    const { fetch } = routedFetch({
      [VIACEP('01310100')]: { body: fixture('viacep/0131010-formato-invalido.html'), status: 400 },
    });
    const cep = createCepClient({ fetch, providers: ['viacep'] });
    const error = await cep.lookup('01310100').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
  });
});

describe('createCepClient().lookup com BrasilAPI (fixtures reais)', () => {
  it('normaliza o endereço e informa o serviço de origem', async () => {
    const { fetch } = routedFetch({ [BRASILAPI('01310100')]: brasilapiOk });
    const cep = createCepClient({ fetch, providers: ['brasilapi'] });

    await expect(cep.lookup('01310100')).resolves.toEqual({
      cep: '01310100',
      uf: 'SP',
      municipio: 'São Paulo',
      bairro: 'Bela Vista',
      logradouro: 'Avenida Paulista',
      complemento: null,
      codigoIbgeMunicipio: '3550308',
      fonte: { provedor: 'brasilapi', servicoOrigem: 'open-cep' },
    });
  });

  it('converte 404 em NotFoundError', async () => {
    const { fetch } = routedFetch({ [BRASILAPI('00000000')]: brasilapiNotFound });
    const cep = createCepClient({ fetch, providers: ['brasilapi'] });
    const error = await cep.lookup('00000-000').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ provider: 'brasilapi' });
  });

  it('converte 429 com corpo em texto em RateLimitError', async () => {
    const { fetch } = routedFetch({
      [BRASILAPI('01310100')]: {
        body: 'please stop abusing our public API',
        status: 429,
        headers: { 'content-type': 'text/plain', 'retry-after': '30' },
      },
    });
    const cep = createCepClient({ fetch, providers: ['brasilapi'] });
    const error = await cep.lookup('01310100').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(30_000);
  });
});

describe('respostas malformadas', () => {
  it.each([
    ['corpo não é objeto', '[]'],
    ['falta a UF', '{"cep":"01310-100","localidade":"São Paulo"}'],
    [
      'campo opcional com tipo errado',
      '{"cep":"01310-100","uf":"SP","localidade":"São Paulo","bairro":1}',
    ],
    ['CEP diferente do pedido', '{"cep":"01001-000","uf":"SP","localidade":"São Paulo"}'],
    ['JSON inválido', '<html>manutenção</html>'],
  ])('%s → ProviderUnavailableError', async (_label, body) => {
    const { fetch } = routedFetch({ [VIACEP('01310100')]: { body } });
    const cep = createCepClient({ fetch, providers: ['viacep'] });
    const error = await cep.lookup('01310100').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ provider: 'viacep' });
  });

  it('campos vazios viram null', async () => {
    const { fetch } = routedFetch({
      [VIACEP('13165000')]: {
        body: '{"cep":"13165-000","logradouro":"","complemento":"","bairro":"","localidade":"Engenheiro Coelho","uf":"SP","ibge":"3515152"}',
      },
    });
    const cep = createCepClient({ fetch, providers: ['viacep'] });
    await expect(cep.lookup('13165000')).resolves.toMatchObject({
      logradouro: null,
      bairro: null,
      complemento: null,
    });
  });
});

describe('fallback entre provedores', () => {
  it('usa o segundo provedor quando o primeiro está fora do ar (503)', async () => {
    const { fetch, calls } = routedFetch({
      [VIACEP('01310100')]: { body: '', status: 503 },
      [BRASILAPI('01310100')]: brasilapiOk,
    });
    const result = await createCepClient({ fetch }).lookup('01310100');
    expect(result.fonte.provedor).toBe('brasilapi');
    expect(calls).toEqual([VIACEP('01310100'), BRASILAPI('01310100')]);
  });

  it('usa o segundo provedor em falha de rede', async () => {
    const { fetch } = routedFetch({
      [VIACEP('01310100')]: new TypeError('fetch failed'),
      [BRASILAPI('01310100')]: brasilapiOk,
    });
    await expect(createCepClient({ fetch }).lookup('01310100')).resolves.toMatchObject({
      fonte: { provedor: 'brasilapi' },
    });
  });

  it('usa o segundo provedor quando o primeiro estoura o timeout', async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = (url, init) => {
      if (url === BRASILAPI('01310100')) return Promise.resolve(new Response(brasilapiOk.body));
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    };
    const promise = createCepClient({ fetch, timeoutMs: 1000 }).lookup('01310100');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ fonte: { provedor: 'brasilapi' } });
  });

  it('por padrão, NotFound do primeiro provedor encerra a busca', async () => {
    const { fetch, calls } = routedFetch({ [VIACEP('99999999')]: viacepNotFound });
    await expect(createCepClient({ fetch }).lookup('99999999')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(calls).toHaveLength(1);
  });

  it('com fallbackOnNotFound, consulta o próximo provedor', async () => {
    const { fetch } = routedFetch({
      [VIACEP('01310100')]: viacepNotFound,
      [BRASILAPI('01310100')]: brasilapiOk,
    });
    const cep = createCepClient({ fetch, fallbackOnNotFound: true });
    await expect(cep.lookup('01310100')).resolves.toMatchObject({
      fonte: { provedor: 'brasilapi' },
    });
  });

  it('NotFound em todos os provedores → NotFoundError com AggregateError', async () => {
    const { fetch } = routedFetch({
      [VIACEP('00000000')]: viacepNotFound,
      [BRASILAPI('00000000')]: brasilapiNotFound,
    });
    const error = await createCepClient({ fetch, fallbackOnNotFound: true })
      .lookup('00000000')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).cause).toBeInstanceOf(AggregateError);
  });

  it('falha em todos os provedores → ProviderUnavailableError com os erros de cada um', async () => {
    const { fetch } = routedFetch({
      [VIACEP('01310100')]: { body: '', status: 503 },
      [BRASILAPI('01310100')]: { body: '', status: 429 },
    });
    const error = await createCepClient({ fetch })
      .lookup('01310100')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    const cause = (error as Error).cause as AggregateError;
    expect(cause).toBeInstanceOf(AggregateError);
    expect(cause.errors[0]).toBeInstanceOf(ProviderUnavailableError);
    expect(cause.errors[1]).toBeInstanceOf(RateLimitError);
  });

  it('com um só provedor, propaga o erro original (TimeoutError)', async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const promise = createCepClient({ fetch, providers: ['viacep'], timeoutMs: 500 }).lookup(
      '01310100',
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });
});

describe('cancelamento e validação', () => {
  it('cancelamento pelo chamador interrompe sem tentar o próximo provedor', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const fetch: FetchLike = (url, init) => {
      calls.push(url);
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    };
    const promise = createCepClient({ fetch }).lookup('01310100', { signal: controller.signal });
    const reason = new Error('cancelado');
    controller.abort(reason);
    await expect(promise).rejects.toBe(reason);
    expect(calls).toHaveLength(1);
  });

  it('CEP com formato inválido não gera requisição', async () => {
    const { fetch, calls } = routedFetch({});
    await expect(createCepClient({ fetch }).lookup('123')).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('rejeita lista de provedores vazia ou desconhecida', () => {
    expect(() => createCepClient({ providers: [] })).toThrow(ValidationError);
    expect(() => createCepClient({ providers: ['correios' as unknown as 'viacep'] })).toThrow(
      ValidationError,
    );
  });
});

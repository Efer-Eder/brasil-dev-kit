import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpError,
  NotFoundError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from '../../../src/core/errors.js';
import {
  createHttpClient,
  DEFAULT_RETRY,
  type FetchLike,
  retryDelay,
} from '../../../src/core/http.js';
import { createCepClient } from '../../../src/modules/cep/index.js';
import { createIbgeClient } from '../../../src/modules/ibge/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Step = { status: number; body?: string; headers?: Record<string, string> } | Error;

/** fetch que responde a sequência dada, uma resposta por chamada. */
function scripted(steps: Step[]) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    if (!step) throw new Error('sem resposta');
    return new Response(step.body ?? '{"ok":true}', {
      status: step.status,
      ...(step.headers ? { headers: step.headers } : {}),
    });
  };
  return { fetch, calls };
}

const URL = 'https://api.example.test/x';

describe('retryDelay (quem repete e quanto espera)', () => {
  const r = { ...DEFAULT_RETRY };
  const half = () => 0.5;

  it('backoff exponencial com jitter e teto', () => {
    const err = new ProviderUnavailableError('x', { status: 503 });
    expect(retryDelay(err, 0, r, half)).toBe(100); // 0,5 × 200
    expect(retryDelay(err, 1, r, half)).toBe(200); // 0,5 × 400
    expect(retryDelay(err, 5, r, half)).toBe(1000); // 0,5 × teto de 2000
    expect(retryDelay(err, 0, r, () => 0.999)).toBeLessThan(200);
  });

  it('repete falha de rede, 5xx, timeout e 429', () => {
    expect(retryDelay(new ProviderUnavailableError('rede'), 0, r, half)).toBe(100);
    expect(retryDelay(new TimeoutError('t', { timeoutMs: 1 }), 0, r, half)).toBe(100);
    expect(retryDelay(new RateLimitError('429'), 0, r, half)).toBe(100);
  });

  it('respeita Retry-After até o limite e desiste acima dele', () => {
    expect(retryDelay(new RateLimitError('429', { retryAfterMs: 3000 }), 0, r, half)).toBe(3000);
    expect(
      retryDelay(new RateLimitError('429', { retryAfterMs: 30_000 }), 0, r, half),
    ).toBeUndefined();
  });

  it('não repete 404, outros 4xx, JSON inválido nem erros de validação', () => {
    expect(retryDelay(new NotFoundError('404'), 0, r, half)).toBeUndefined();
    expect(retryDelay(new HttpError('400', { status: 400 }), 0, r, half)).toBeUndefined();
    expect(
      retryDelay(new ProviderUnavailableError('json', { status: 200 }), 0, r, half),
    ).toBeUndefined();
    expect(retryDelay(new ValidationError('v'), 0, r, half)).toBeUndefined();
    expect(retryDelay(new Error('qualquer'), 0, r, half)).toBeUndefined();
  });
});

describe('createHttpClient com retries', () => {
  it('503, 503 e depois 200: devolve o 200 após duas novas tentativas', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { fetch, calls } = scripted([{ status: 503 }, { status: 503 }, { status: 200 }]);
    const promise = createHttpClient({ fetch }).getJson(URL);
    await vi.advanceTimersByTimeAsync(100 + 200);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it('esgota as tentativas e lança o último erro', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { fetch, calls } = scripted([{ status: 502 }]);
    const promise = createHttpClient({ fetch, retry: { retries: 3 } }).getJson(URL);
    const assertion = expect(promise).rejects.toMatchObject({ status: 502 });
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(calls).toHaveLength(4);
  });

  it('429 com Retry-After: espera o tempo pedido antes de repetir', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = scripted([
      { status: 429, headers: { 'retry-after': '2' } },
      { status: 200 },
    ]);
    const promise = createHttpClient({ fetch }).getJson(URL);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('429 pedindo espera longa demais: lança na hora, sem repetir', async () => {
    const { fetch, calls } = scripted([{ status: 429, headers: { 'retry-after': '60' } }]);
    await expect(createHttpClient({ fetch }).getJson(URL)).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(1);
  });

  it('404 e JSON inválido não são repetidos', async () => {
    const notFound = scripted([{ status: 404 }]);
    await expect(createHttpClient({ fetch: notFound.fetch }).getJson(URL)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(notFound.calls).toHaveLength(1);

    const badJson = scripted([{ status: 200, body: '<html>' }]);
    await expect(createHttpClient({ fetch: badJson.fetch }).getJson(URL)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(badJson.calls).toHaveLength(1);
  });

  it('falha de rede é repetida', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { fetch, calls } = scripted([new TypeError('fetch failed'), { status: 200 }]);
    await expect(createHttpClient({ fetch }).getJson(URL)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('cancelar durante a espera interrompe na hora, sem nova tentativa', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { fetch, calls } = scripted([{ status: 503 }, { status: 200 }]);
    const controller = new AbortController();
    const promise = createHttpClient({ fetch }).getJson(URL, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10);
    const reason = new Error('cancelado');
    controller.abort(reason);
    await expect(promise).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
  });

  it('retry: false faz uma tentativa só', async () => {
    const { fetch, calls } = scripted([{ status: 503 }, { status: 200 }]);
    await expect(createHttpClient({ fetch, retry: false }).getJson(URL)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(calls).toHaveLength(1);
  });

  it('rejeita configuração inválida', () => {
    expect(() => createHttpClient({ fetch: scripted([]).fetch, retry: { retries: -1 } })).toThrow(
      ValidationError,
    );
    expect(() => createHttpClient({ fetch: scripted([]).fetch, cache: { ttlMs: 0 } })).toThrow(
      ValidationError,
    );
  });
});

describe('createHttpClient com cache', () => {
  it('serve do cache dentro do TTL e consulta de novo depois', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = scripted([{ status: 200, body: '{"v":1}' }]);
    const http = createHttpClient({ fetch, cache: { ttlMs: 1000 } });
    expect(await http.getJson(URL)).toEqual({ v: 1 });
    expect(await http.getJson(URL)).toEqual({ v: 1 });
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    await http.getJson(URL);
    expect(calls).toHaveLength(2);
  });

  it('chaves diferentes por URL completa, inclusive query', async () => {
    const { fetch, calls } = scripted([{ status: 200 }]);
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000 } });
    await http.getJson(URL, { query: { uf: 'SP' } });
    await http.getJson(URL, { query: { uf: 'RJ' } });
    await http.getJson(URL, { query: { uf: 'SP' } });
    expect(calls).toHaveLength(2);
  });

  it('pedidos simultâneos da mesma URL fazem uma única ida à rede', async () => {
    const { fetch, calls } = scripted([{ status: 200 }]);
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000 } });
    const results = await Promise.all([http.getJson(URL), http.getJson(URL), http.getJson(URL)]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(calls).toHaveLength(1);
  });

  it('não guarda erros', async () => {
    const { fetch, calls } = scripted([{ status: 404 }, { status: 200 }]);
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000 } });
    await expect(http.getJson(URL)).rejects.toBeInstanceOf(NotFoundError);
    await expect(http.getJson(URL)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('devolve cópias: alterar o resultado não altera o cache', async () => {
    const { fetch } = scripted([{ status: 200, body: '{"lista":[1,2]}' }]);
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000 } });
    const first = (await http.getJson(URL)) as { lista: number[] };
    first.lista.push(99);
    expect(await http.getJson(URL)).toEqual({ lista: [1, 2] });
  });

  it('respeita o limite de entradas (sai a menos usada)', async () => {
    const { fetch, calls } = scripted([{ status: 200 }]);
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000, maxEntries: 2 } });
    await http.getJson(`${URL}/a`);
    await http.getJson(`${URL}/b`);
    await http.getJson(`${URL}/a`); // "a" vira a mais recente
    await http.getJson(`${URL}/c`); // sai "b"
    await http.getJson(`${URL}/a`);
    expect(calls).toHaveLength(3);
    await http.getJson(`${URL}/b`);
    expect(calls).toHaveLength(4);
  });

  it('cancelar um pedido não cancela os outros que esperam a mesma resposta', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fetch: FetchLike = async () => {
      await gate;
      return new Response('{"ok":true}');
    };
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000 } });
    const controller = new AbortController();
    const a = http.getJson(URL, { signal: controller.signal });
    const b = http.getJson(URL);
    controller.abort(new Error('a desistiu'));
    release();
    await expect(a).rejects.toThrow('a desistiu');
    await expect(b).resolves.toEqual({ ok: true });
  });
});

describe('opções nos clientes CEP e IBGE', () => {
  const VIACEP_BODY =
    '{"cep":"01310-100","logradouro":"Avenida Paulista","complemento":"","bairro":"Bela Vista","localidade":"São Paulo","uf":"SP","ibge":"3550308"}';

  it('CEP com vários provedores: sem retry por padrão, o fallback assume', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes('viacep')) return new Response('', { status: 503 });
      return new Response(
        '{"cep":"01310100","state":"SP","city":"São Paulo","neighborhood":"Bela Vista","street":"Avenida Paulista","service":"open-cep"}',
      );
    };
    await createCepClient({ fetch }).lookup('01310100');
    expect(calls.filter((u) => u.includes('viacep'))).toHaveLength(1);
  });

  it('CEP com um provedor só: repete por padrão', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { fetch, calls } = scripted([{ status: 503 }, { status: 200, body: VIACEP_BODY }]);
    const endereco = await createCepClient({ fetch, providers: ['viacep'] }).lookup('01310100');
    expect(endereco.municipio).toBe('São Paulo');
    expect(calls).toHaveLength(2);
  });

  it('CEP com cacheTtlMs: a segunda consulta não vai à rede', async () => {
    const { fetch, calls } = scripted([{ status: 200, body: VIACEP_BODY }]);
    const cep = createCepClient({ fetch, providers: ['viacep'], cacheTtlMs: 60_000 });
    await cep.lookup('01310-100');
    await cep.lookup('01310100');
    expect(calls).toHaveLength(1);
  });

  it('IBGE repete por padrão e aceita retry: false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ufs =
      '[{"id":35,"sigla":"SP","nome":"São Paulo","regiao":{"id":3,"sigla":"SE","nome":"Sudeste"}}]';
    const withRetry = scripted([{ status: 500 }, { status: 200, body: ufs }]);
    await expect(createIbgeClient({ fetch: withRetry.fetch }).listUfs()).resolves.toHaveLength(1);
    expect(withRetry.calls).toHaveLength(2);

    const noRetry = scripted([{ status: 500 }, { status: 200, body: ufs }]);
    await expect(
      createIbgeClient({ fetch: noRetry.fetch, retry: false }).listUfs(),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(noRetry.calls).toHaveLength(1);
  });
});

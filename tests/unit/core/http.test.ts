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
  buildUrl,
  createHttpClient,
  type FetchLike,
  parseRetryAfter,
} from '../../../src/core/http.js';

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function jsonFetch(body: unknown, init: ResponseInit = {}): FetchLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = async (url: string, requestInit: RequestInit) => {
    calls.push({ url, init: requestInit });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  };
  return Object.assign(fn, { calls });
}

/** fetch que nunca responde, mas respeita o AbortSignal (como o fetch nativo). */
const hangingFetch: FetchLike = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init.signal;
    if (!signal) return;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('createHttpClient().getJson', () => {
  it('devolve o JSON da resposta e monta URL, query e cabeçalhos', async () => {
    const fetch = jsonFetch({ ok: true });
    const client = createHttpClient({
      baseUrl: 'https://api.example.test/v1/',
      fetch,
      userAgent: 'brasil-dev-kit-tests',
      headers: { 'X-Default': 'a' },
    });

    const data = await client.getJson('/items', {
      query: { uf: 'SP', page: 2, ativo: true, ignorado: undefined },
      headers: { 'X-Extra': 'b' },
    });

    expect(data).toEqual({ ok: true });
    expect(fetch.calls).toHaveLength(1);
    const call = fetch.calls[0];
    expect(call?.url).toBe('https://api.example.test/v1/items?uf=SP&page=2&ativo=true');
    expect(call?.init.method).toBe('GET');
    expect(call?.init.headers).toEqual({
      accept: 'application/json',
      'x-default': 'a',
      'x-extra': 'b',
      'user-agent': 'brasil-dev-kit-tests',
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('não envia User-Agent quando não configurado', async () => {
    const fetch = jsonFetch({});
    await createHttpClient({ fetch }).getJson('https://api.example.test/x');
    expect(fetch.calls[0]?.init.headers).toEqual({ accept: 'application/json' });
  });

  it('mapeia 404 para NotFoundError com o provedor', async () => {
    const client = createHttpClient({
      fetch: jsonFetch({ erro: true }, { status: 404 }),
      baseUrl: 'https://api.example.test',
      provider: 'exemplo',
    });
    const error = await client.getJson('/nada').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ code: 'NOT_FOUND', provider: 'exemplo', name: 'NotFoundError' });
  });

  it('mapeia 429 para RateLimitError e lê Retry-After em segundos', async () => {
    const client = createHttpClient({
      fetch: jsonFetch('', { status: 429, headers: { 'retry-after': '2' } }),
      baseUrl: 'https://api.example.test',
    });
    const error = await client.getJson('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(2000);
  });

  it('mapeia 429 sem Retry-After com retryAfterMs indefinido', async () => {
    const client = createHttpClient({ fetch: jsonFetch('', { status: 429 }) });
    const error = await client.getJson('https://api.example.test/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBeUndefined();
  });

  it.each([500, 502, 503, 504])('mapeia %i para ProviderUnavailableError', async (status) => {
    const client = createHttpClient({ fetch: jsonFetch('', { status }) });
    const error = await client.getJson('https://api.example.test/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as ProviderUnavailableError).status).toBe(status);
  });

  it.each([400, 401, 403, 422])('mapeia %i para HttpError', async (status) => {
    const client = createHttpClient({ fetch: jsonFetch('', { status }) });
    const error = await client.getJson('https://api.example.test/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(status);
  });

  it('trata corpo que não é JSON como ProviderUnavailableError', async () => {
    const client = createHttpClient({ fetch: jsonFetch('<html>manutenção</html>') });
    const error = await client.getJson('https://api.example.test/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });

  it('converte falha de rede em ProviderUnavailableError preservando a causa', async () => {
    const networkError = new TypeError('fetch failed');
    const client = createHttpClient({
      fetch: async () => {
        throw networkError;
      },
    });
    const error = await client.getJson('https://api.example.test/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as Error).cause).toBe(networkError);
    expect((error as ProviderUnavailableError).status).toBeUndefined();
  });

  it('lança TimeoutError quando o tempo limite expira', async () => {
    vi.useFakeTimers();
    const client = createHttpClient({ fetch: hangingFetch, timeoutMs: 1000, retry: false });
    const assertion = expect(
      client.getJson('https://api.example.test/lento'),
    ).rejects.toMatchObject({ name: 'TimeoutError', code: 'TIMEOUT', timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('permite sobrescrever o timeout por requisição', async () => {
    vi.useFakeTimers();
    const client = createHttpClient({ fetch: hangingFetch, timeoutMs: 60_000, retry: false });
    const promise = client.getJson('https://api.example.test/lento', { timeoutMs: 50 });
    const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('propaga o motivo do cancelamento feito pelo chamador', async () => {
    const controller = new AbortController();
    const client = createHttpClient({ fetch: hangingFetch });
    const promise = client.getJson('https://api.example.test/x', { signal: controller.signal });
    const reason = new Error('usuário cancelou');
    controller.abort(reason);
    await expect(promise).rejects.toBe(reason);
  });

  it('não chama fetch se o sinal já estiver cancelado', async () => {
    const fetch = jsonFetch({});
    const client = createHttpClient({ fetch });
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.getJson('https://api.example.test/x', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch.calls).toHaveLength(0);
  });

  it('rejeita timeout inválido com ValidationError', async () => {
    expect(() => createHttpClient({ fetch: jsonFetch({}), timeoutMs: 0 })).toThrow(ValidationError);
    const client = createHttpClient({ fetch: jsonFetch({}) });
    await expect(
      client.getJson('https://api.example.test/x', { timeoutMs: Number.NaN }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('buildUrl', () => {
  it('junta baseUrl e caminho sem barras duplicadas', () => {
    expect(buildUrl('https://a.test/api/', '/v1/x')).toBe('https://a.test/api/v1/x');
    expect(buildUrl('https://a.test/api', 'v1/x')).toBe('https://a.test/api/v1/x');
  });

  it('usa caminhos absolutos como estão', () => {
    expect(buildUrl('https://a.test', 'https://b.test/y')).toBe('https://b.test/y');
  });

  it('codifica valores da query', () => {
    expect(buildUrl('https://a.test', '/x', { q: 'São Paulo' })).toBe(
      'https://a.test/x?q=S%C3%A3o+Paulo',
    );
  });

  it('exige baseUrl para caminhos relativos', () => {
    expect(() => buildUrl(undefined, '/x')).toThrow(ValidationError);
  });

  it('rejeita URL malformada', () => {
    expect(() => buildUrl('nao-e-uma-url', '/x')).toThrow(ValidationError);
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');

  it('aceita segundos', () => {
    expect(parseRetryAfter('120', now)).toBe(120_000);
  });

  it('aceita data HTTP', () => {
    expect(parseRetryAfter('Fri, 20 Nov 2026 12:00:30 GMT', now)).toBe(30_000);
  });

  it('não devolve valores negativos para datas passadas', () => {
    expect(parseRetryAfter('Fri, 20 Nov 2026 11:00:00 GMT', now)).toBe(0);
  });

  it.each([null, '', '   ', 'amanhã'])('ignora valor ausente ou inválido (%j)', (value) => {
    expect(parseRetryAfter(value, now)).toBeUndefined();
  });
});

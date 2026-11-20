import {
  BrasilDevKitError,
  HttpError,
  NotFoundError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from './errors.js';

/** Assinatura mínima de `fetch` aceita pelo cliente (compatível com o `fetch` nativo). */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type QueryValue = string | number | boolean | undefined;

/**
 * Política de novas tentativas. Só repete o que costuma ser passageiro: falha de
 * rede, resposta 5xx, timeout e 429. Nunca repete 404, outros 4xx, JSON inválido
 * ou cancelamento feito pelo chamador.
 */
export interface RetryOptions {
  /** Tentativas extras depois da primeira. Padrão: 2. Use 0 para desligar. */
  retries?: number;
  /** Base do backoff exponencial, em ms. Padrão: 200. */
  baseDelayMs?: number;
  /** Teto de cada espera entre tentativas, em ms. Padrão: 2000. */
  maxDelayMs?: number;
  /**
   * Maior `Retry-After` (429) que o cliente aceita esperar, em ms. Acima disso,
   * o `RateLimitError` é lançado na hora. Padrão: 5000.
   */
  maxRetryAfterMs?: number;
}

export interface CacheOptions {
  /** Tempo de vida de cada resposta em cache, em ms. */
  ttlMs: number;
  /** Máximo de respostas guardadas (as menos usadas saem primeiro). Padrão: 500. */
  maxEntries?: number;
}

export interface HttpClientOptions {
  /** URL base prefixada aos caminhos relativos. */
  baseUrl?: string;
  /** Tempo limite de cada tentativa, em ms. Padrão: 8000. */
  timeoutMs?: number;
  /** Implementação de `fetch` (útil para testes, proxies ou runtimes sem `fetch` global). */
  fetch?: FetchLike;
  /** Cabeçalhos enviados em toda requisição. */
  headers?: Record<string, string>;
  /**
   * Valor de `User-Agent`. Só é enviado se informado; navegadores podem ignorá-lo,
   * pois é um cabeçalho proibido para scripts no browser.
   */
  userAgent?: string;
  /** Nome do provedor, anexado aos erros para facilitar diagnóstico. */
  provider?: string;
  /** Novas tentativas com backoff. `false` desliga. Padrão: `{ retries: 2 }`. */
  retry?: RetryOptions | false;
  /** Cache em memória das respostas de sucesso. Desligado se omitido. */
  cache?: CacheOptions;
}

export interface RequestOptions {
  /** Sinal para cancelamento pelo chamador (vale também para as esperas entre tentativas). */
  signal?: AbortSignal;
  /** Sobrescreve o tempo limite de cada tentativa apenas nesta requisição. */
  timeoutMs?: number;
  /** Parâmetros de query string; valores `undefined` são ignorados. */
  query?: Record<string, QueryValue>;
  /** Cabeçalhos adicionais para esta requisição. */
  headers?: Record<string, string>;
}

export interface HttpClient {
  /**
   * Executa um GET e devolve o corpo JSON como `unknown`.
   * Quem chama é responsável por validar o formato antes de usar os dados.
   */
  getJson(path: string, options?: RequestOptions): Promise<unknown>;
}

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_RETRY: Required<RetryOptions> = Object.freeze({
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  maxRetryAfterMs: 5000,
});
const DEFAULT_CACHE_MAX_ENTRIES = 500;

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetch ?? resolveGlobalFetch();
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertValidTimeout(defaultTimeout);
  const provider = options.provider;
  const retry = resolveRetry(options.retry);
  const cache = options.cache ? new ResponseCache(options.cache) : undefined;
  const inFlight = new Map<string, Promise<unknown>>();

  async function attempt(
    url: string,
    timeoutMs: number,
    headers: Record<string, string>,
    callerSignal?: AbortSignal,
  ) {
    const timeoutController = new AbortController();
    const timeoutError = new TimeoutError(`A requisição excedeu ${timeoutMs} ms: GET ${url}`, {
      timeoutMs,
      ...withProvider(provider),
    });
    const timer = setTimeout(() => timeoutController.abort(timeoutError), timeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetchImpl(url, { method: 'GET', headers, signal });
      if (!response.ok) {
        throw await errorFromResponse(response, url, provider);
      }
      return await parseJsonBody(response, url, provider);
    } catch (error) {
      if (callerSignal?.aborted) throw callerSignal.reason;
      if (timeoutController.signal.aborted) throw timeoutError;
      if (error instanceof BrasilDevKitError) throw error;
      throw new ProviderUnavailableError(`Falha de rede ao acessar GET ${url}`, {
        cause: error,
        ...withProvider(provider),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function withRetries(
    url: string,
    timeoutMs: number,
    headers: Record<string, string>,
    callerSignal?: AbortSignal,
  ): Promise<unknown> {
    for (let n = 0; ; n++) {
      try {
        return await attempt(url, timeoutMs, headers, callerSignal);
      } catch (error) {
        if (callerSignal?.aborted) throw callerSignal.reason;
        const wait = n < retry.retries ? retryDelay(error, n, retry) : undefined;
        if (wait === undefined) throw error;
        await sleep(wait, callerSignal);
      }
    }
  }

  return {
    async getJson(path, requestOptions = {}) {
      const timeoutMs = requestOptions.timeoutMs ?? defaultTimeout;
      assertValidTimeout(timeoutMs);

      const callerSignal = requestOptions.signal;
      callerSignal?.throwIfAborted();

      const url = buildUrl(options.baseUrl, path, requestOptions.query);
      const headers: Record<string, string> = {
        accept: 'application/json',
        ...lowerCaseKeys(options.headers),
        ...lowerCaseKeys(requestOptions.headers),
      };
      if (options.userAgent) headers['user-agent'] = options.userAgent;

      if (!cache) return withRetries(url, timeoutMs, headers, callerSignal);

      const hit = cache.get(url);
      if (hit.found) return hit.value;

      // Pedidos simultâneos da mesma URL compartilham uma única ida à rede.
      let shared = inFlight.get(url);
      if (!shared) {
        shared = withRetries(url, timeoutMs, headers).finally(() => inFlight.delete(url));
        inFlight.set(url, shared);
        shared.then((value) => cache.set(url, value)).catch(() => undefined);
      }
      const value = await (callerSignal ? raceAbort(shared, callerSignal) : shared);
      return structuredClone(value);
    },
  };
}

function resolveRetry(retry: RetryOptions | false | undefined): Required<RetryOptions> {
  if (retry === false) return { ...DEFAULT_RETRY, retries: 0 };
  const merged = { ...DEFAULT_RETRY, ...retry };
  for (const [key, value] of Object.entries(merged)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new ValidationError(
        `retry.${key} deve ser um inteiro >= 0; recebido: ${String(value)}`,
      );
    }
  }
  return merged;
}

/**
 * Quanto esperar antes da próxima tentativa, ou `undefined` se o erro não deve
 * ser repetido. Backoff exponencial com "full jitter": um valor aleatório entre
 * 0 e min(maxDelayMs, baseDelayMs × 2^n), para clientes não voltarem juntos.
 */
export function retryDelay(
  error: unknown,
  attemptIndex: number,
  retry: Required<RetryOptions>,
  random: () => number = Math.random,
): number | undefined {
  if (error instanceof RateLimitError) {
    if (error.retryAfterMs !== undefined) {
      return error.retryAfterMs <= retry.maxRetryAfterMs ? error.retryAfterMs : undefined;
    }
  } else if (error instanceof ProviderUnavailableError) {
    // Corpo que não é JSON vem com status 2xx: não adianta repetir.
    if (error.status !== undefined && error.status < 500) return undefined;
  } else if (!(error instanceof TimeoutError)) {
    return undefined;
  }
  const ceiling = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** attemptIndex);
  return Math.floor(random() * ceiling);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Cache TTL + LRU das respostas de sucesso, guardando cópias independentes. */
class ResponseCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: CacheOptions) {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new ValidationError(
        `cache.ttlMs deve ser positivo; recebido: ${String(options.ttlMs)}`,
      );
    }
    const max = options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
    if (!Number.isInteger(max) || max < 1) {
      throw new ValidationError(
        `cache.maxEntries deve ser um inteiro >= 1; recebido: ${String(max)}`,
      );
    }
    this.ttlMs = options.ttlMs;
    this.maxEntries = max;
  }

  get(key: string): { found: true; value: unknown } | { found: false } {
    const entry = this.entries.get(key);
    if (!entry) return { found: false };
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return { found: false };
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { found: true, value: structuredClone(entry.value) };
  }

  set(key: string, value: unknown): void {
    this.entries.delete(key);
    this.entries.set(key, { value: structuredClone(value), expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

function resolveGlobalFetch(): FetchLike {
  if (typeof globalThis.fetch !== 'function') {
    throw new ValidationError(
      'Nenhuma implementação de fetch disponível. Use Node.js >= 22 ou informe a opção `fetch`.',
    );
  }
  return (input, init) => globalThis.fetch(input, init);
}

function assertValidTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ValidationError(`timeoutMs deve ser um número positivo; recebido: ${timeoutMs}`);
  }
}

function withProvider(provider: string | undefined): { provider?: string } {
  return provider === undefined ? {} : { provider };
}

function lowerCaseKeys(headers: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  for (const [key, value] of Object.entries(headers)) result[key.toLowerCase()] = value;
  return result;
}

/**
 * Monta a URL final. Caminhos absolutos (`http://`/`https://`) ignoram `baseUrl`.
 * Valores `undefined` na query são omitidos.
 */
export function buildUrl(
  baseUrl: string | undefined,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const isAbsolute = /^https?:\/\//i.test(path);
  if (!isAbsolute && !baseUrl) {
    throw new ValidationError(`Caminho relativo sem baseUrl configurada: ${path}`);
  }
  const raw = isAbsolute
    ? path
    : `${(baseUrl ?? '').replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new ValidationError(`URL inválida: ${raw}`, { cause: error });
  }
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

async function errorFromResponse(
  response: Response,
  url: string,
  provider: string | undefined,
): Promise<BrasilDevKitError> {
  // Descarta o corpo para liberar a conexão; o conteúdo não é exposto no erro
  // para evitar vazar dados inesperados em logs.
  await response.body?.cancel().catch(() => undefined);

  const status = response.status;
  const base = withProvider(provider);
  const where = `GET ${url}`;

  if (status === 404) return new NotFoundError(`Recurso não encontrado (404): ${where}`, base);
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    return new RateLimitError(`Limite de requisições atingido (429): ${where}`, {
      ...base,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }
  if (status >= 500) {
    return new ProviderUnavailableError(`Provedor indisponível (${status}): ${where}`, {
      ...base,
      status,
    });
  }
  return new HttpError(`Resposta HTTP inesperada (${status}): ${where}`, { ...base, status });
}

async function parseJsonBody(
  response: Response,
  url: string,
  provider: string | undefined,
): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderUnavailableError(`Resposta não é JSON válido: GET ${url}`, {
      cause: error,
      status: response.status,
      ...withProvider(provider),
    });
  }
}

/**
 * Converte o cabeçalho `Retry-After` (segundos ou data HTTP) em milissegundos.
 * Devolve `undefined` quando ausente ou inválido.
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

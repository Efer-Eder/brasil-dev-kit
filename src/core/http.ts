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

export interface HttpClientOptions {
  /** URL base prefixada aos caminhos relativos. */
  baseUrl?: string;
  /** Tempo limite padrão por requisição, em ms. Padrão: 8000. */
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
}

export interface RequestOptions {
  /** Sinal para cancelamento pelo chamador. */
  signal?: AbortSignal;
  /** Sobrescreve o tempo limite padrão apenas nesta requisição. */
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

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetch ?? resolveGlobalFetch();
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertValidTimeout(defaultTimeout);
  const provider = options.provider;

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
    },
  };
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

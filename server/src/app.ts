import type { IncomingMessage, ServerResponse } from 'node:http';
import openapi from '../../docs/openapi.json' with { type: 'json' };
import pkg from '../../package.json' with { type: 'json' };
import {
  type CepClient,
  createCepClient,
  createIbgeClient,
  type Endereco,
  type FetchLike,
  getFeriadosNacionais,
  HttpError,
  type IbgeClient,
  type Municipio,
  NotFoundError,
  normalizeCep,
  ProviderUnavailableError,
  RateLimitError,
  resolveUf,
  TimeoutError,
  type Uf,
  ValidationError,
  validateCnpj,
} from '../../src/index.js';
import { SingleFlight, TtlCache } from './cache.js';
import type { ServerConfig } from './config.js';
import { createGithubCache } from './github.js';
import { UpstreamBusyError, UpstreamGate } from './limiter.js';

/** Versão da API = versão do pacote (uma fonte só). */
export const API_VERSION: string = pkg.version;
const DOCS_URL = 'https://github.com/Efer-Eder/brasil-dev-kit/blob/main/docs/api.md';

type CepCacheValue = { found: true; endereco: Endereco } | { found: false };

interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface AppDeps {
  config: ServerConfig;
  /** `fetch` usado para os provedores (injetável nos testes). */
  fetch?: FetchLike;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
}

export interface App {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  stats(): Record<string, unknown>;
}

const CACHE_DAY = 'public, max-age=86400';
const CACHE_HOUR = 'public, max-age=3600';

function errorReply(
  status: number,
  codigo: string,
  mensagem: string,
  headers?: Record<string, string>,
): Reply {
  return { status, body: { erro: { codigo, mensagem } }, ...(headers ? { headers } : {}) };
}

export function createApp(deps: AppDeps): App {
  const { config } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => undefined);
  const baseFetch: FetchLike = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));

  // Um porteiro por host externo: limita ritmo e concorrência para não sobrecarregar
  // os provedores públicos (o ViaCEP bloqueia uso massivo).
  const gates = new Map<string, UpstreamGate>();
  const gateFor = (host: string) => {
    let gate = gates.get(host);
    if (!gate) {
      gate = new UpstreamGate({ name: host, ...config.upstream, now });
      gates.set(host, gate);
    }
    return gate;
  };
  const gatedFetch: FetchLike = (input, init) =>
    gateFor(new URL(input).host).run(() => baseFetch(input, init), init.signal ?? undefined);

  const clientOptions = {
    fetch: gatedFetch,
    timeoutMs: config.upstreamTimeoutMs,
    userAgent: `brasil-dev-kit-api/${API_VERSION} (+${DOCS_URL})`,
    // Sem novas tentativas aqui: fila, ritmo por provedor, fallback e cache já cobrem
    // falhas passageiras, e as contas de capacidade (docs/api.md) assumem uma tentativa.
    retry: false as const,
  };
  const cep: CepClient = createCepClient(clientOptions);
  const ibge: IbgeClient = createIbgeClient(clientOptions);

  const github = createGithubCache({
    repo: config.github.repo,
    ttlMs: config.github.ttlMs,
    fetch: gatedFetch,
    timeoutMs: config.upstreamTimeoutMs,
    userAgent: clientOptions.userAgent,
    now,
  });

  const cepCache = new TtlCache<CepCacheValue>(config.cep.maxEntries, now);
  const cepFlight = new SingleFlight<CepCacheValue>();
  const ibgeCache = new TtlCache<Uf[] | Municipio[]>(64, now);
  const ibgeFlight = new SingleFlight<Uf[] | Municipio[]>();

  let inFlight = 0;
  const counters = { requests: 0, rejectedBusy: 0, upstreamErrors: 0 };

  async function getCep(raw: string): Promise<Reply> {
    const normalized = normalizeCep(raw);
    if (!/^\d{8}$/.test(normalized)) {
      return errorReply(400, 'VALIDATION_ERROR', 'CEP deve ter 8 dígitos (ex.: 01310-100).');
    }
    let cacheStatus = 'HIT';
    let value = cepCache.get(normalized);
    if (value === undefined) {
      cacheStatus = 'MISS';
      value = await cepFlight.run(normalized, async () => {
        try {
          const endereco = await cep.lookup(normalized);
          const result: CepCacheValue = { found: true, endereco };
          cepCache.set(normalized, result, config.cep.ttlFoundMs);
          return result;
        } catch (error) {
          if (error instanceof NotFoundError) {
            const result: CepCacheValue = { found: false };
            cepCache.set(normalized, result, config.cep.ttlNotFoundMs);
            return result;
          }
          throw error;
        }
      });
    }
    if (!value.found) {
      return errorReply(404, 'NOT_FOUND', `CEP ${normalized} não encontrado.`, {
        'cache-control': CACHE_HOUR,
        'x-cache': cacheStatus,
      });
    }
    return {
      status: 200,
      body: value.endereco,
      headers: { 'cache-control': CACHE_DAY, 'x-cache': cacheStatus },
    };
  }

  async function cachedIbge(key: string, load: () => Promise<Uf[] | Municipio[]>): Promise<Reply> {
    let cacheStatus = 'HIT';
    let value = ibgeCache.get(key);
    if (value === undefined) {
      cacheStatus = 'MISS';
      value = await ibgeFlight.run(key, async () => {
        const loaded = await load();
        ibgeCache.set(key, loaded, config.ibge.ttlMs);
        return loaded;
      });
    }
    return {
      status: 200,
      body: value,
      headers: { 'cache-control': CACHE_DAY, 'x-cache': cacheStatus },
    };
  }

  function index(): Reply {
    return {
      status: 200,
      body: {
        nome: 'Brasil Dev Kit API',
        versao: API_VERSION,
        status: 'em desenvolvimento',
        documentacao: DOCS_URL,
        endpoints: {
          cep: '/v1/cep/{cep}',
          ufs: '/v1/ibge/ufs',
          municipios: '/v1/ibge/ufs/{uf}/municipios',
          cnpj: '/v1/cnpj/{cnpj}',
          feriados: '/v1/feriados/{ano}',
          github: '/v1/projeto/github',
          saude: '/v1/health',
          openapi: '/v1/openapi.json',
        },
        aviso:
          'Serviço gratuito, sem garantia de disponibilidade. Dados de CEP vêm do ViaCEP/BrasilAPI, de UFs/municípios do IBGE e de feriados das leis federais e portarias do governo federal, com cache.',
      },
      headers: { 'cache-control': CACHE_HOUR },
    };
  }

  async function route(method: string, path: string): Promise<Reply> {
    const segments = path
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
    const [version, resource, ...rest] = segments;

    if (segments.length === 0) return index();
    if (version !== 'v1') return errorReply(404, 'NOT_FOUND', 'Rota não encontrada. Veja /');
    if (method !== 'GET' && method !== 'HEAD') {
      return errorReply(405, 'METHOD_NOT_ALLOWED', 'Use GET.', { allow: 'GET, HEAD, OPTIONS' });
    }

    if (resource === 'openapi.json' && rest.length === 0) {
      return {
        status: 200,
        body: { ...openapi, info: { ...openapi.info, version: API_VERSION } },
        headers: { 'cache-control': CACHE_HOUR },
      };
    }
    if (resource === 'health' && rest.length === 0) {
      return {
        status: 200,
        body: { status: 'ok', versao: API_VERSION },
        headers: { 'cache-control': 'no-store' },
      };
    }
    if (resource === 'cep' && rest.length === 1 && rest[0] !== undefined) {
      return getCep(rest[0]);
    }
    if (resource === 'projeto' && rest.length === 1 && rest[0] === 'github') {
      const { value, cache } = await github.get();
      return {
        status: 200,
        body: value,
        headers: { 'cache-control': 'public, max-age=300', 'x-cache': cache },
      };
    }
    if (resource === 'feriados' && rest.length === 1 && rest[0] !== undefined) {
      if (!/^\d{4}$/.test(rest[0])) {
        return errorReply(400, 'VALIDATION_ERROR', 'Ano deve ter 4 dígitos (ex.: 2026).');
      }
      return {
        status: 200,
        body: getFeriadosNacionais(Number(rest[0])),
        headers: { 'cache-control': CACHE_DAY },
      };
    }
    if (resource === 'cnpj' && rest.length === 1 && rest[0] !== undefined) {
      const result = validateCnpj(rest[0]);
      const body = result.valid
        ? {
            ...result,
            aviso:
              'Validação só de formato e dígitos verificadores; não consulta a Receita Federal.',
          }
        : result;
      return { status: 200, body, headers: { 'cache-control': CACHE_DAY } };
    }
    if (resource === 'ibge' && rest[0] === 'ufs') {
      if (rest.length === 1) return cachedIbge('ufs', () => ibge.listUfs());
      if (rest.length === 3 && rest[2] === 'municipios' && rest[1] !== undefined) {
        const uf = resolveUf(rest[1]);
        return cachedIbge(`municipios:${uf.codigoIbge}`, () => ibge.listMunicipios(uf.codigoIbge));
      }
    }
    return errorReply(404, 'NOT_FOUND', 'Rota não encontrada. Veja /');
  }

  function mapError(error: unknown): Reply {
    if (error instanceof ValidationError) return errorReply(400, error.code, error.message);
    if (error instanceof NotFoundError) return errorReply(404, error.code, error.message);
    counters.upstreamErrors += 1;
    if (error instanceof TimeoutError || allCausesAre(error, (e) => e instanceof TimeoutError)) {
      return errorReply(
        504,
        'TIMEOUT',
        'O provedor de dados não respondeu a tempo. Tente de novo.',
      );
    }
    if (error instanceof RateLimitError || hasCause(error, (e) => e instanceof UpstreamBusyError)) {
      return errorReply(
        503,
        'BUSY',
        'Muitas consultas novas no momento. Tente em alguns segundos.',
        {
          'retry-after': '5',
        },
      );
    }
    if (error instanceof ProviderUnavailableError || error instanceof HttpError) {
      return errorReply(502, 'PROVIDER_UNAVAILABLE', 'Provedor de dados indisponível no momento.', {
        'retry-after': '30',
      });
    }
    log({ level: 'error', msg: 'erro inesperado', error: String(error) });
    return errorReply(500, 'INTERNAL_ERROR', 'Erro interno.');
  }

  function send(req: IncomingMessage, res: ServerResponse, reply: Reply): void {
    const payload = JSON.stringify(reply.body);
    res.writeHead(reply.status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      ...(reply.status >= 400 && !reply.headers?.['cache-control']
        ? { 'cache-control': 'no-store' }
        : {}),
      ...reply.headers,
    });
    res.end(req.method === 'HEAD' ? undefined : payload);
  }

  return {
    async handle(req, res) {
      counters.requests += 1;
      const method = req.method ?? 'GET';

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, HEAD, OPTIONS',
          'access-control-max-age': '86400',
        });
        res.end();
        return;
      }

      if (inFlight >= config.maxInFlight) {
        counters.rejectedBusy += 1;
        send(
          req,
          res,
          errorReply(503, 'BUSY', 'Servidor ocupado. Tente em alguns segundos.', {
            'retry-after': '2',
          }),
        );
        return;
      }

      inFlight += 1;
      try {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        let reply: Reply;
        try {
          reply = await route(method, path);
        } catch (error) {
          reply =
            error instanceof URIError
              ? errorReply(400, 'VALIDATION_ERROR', 'URL inválida.')
              : mapError(error);
        }
        if (!res.headersSent && !res.destroyed) send(req, res, reply);
      } finally {
        inFlight -= 1;
      }
    },
    stats() {
      return {
        inFlight,
        ...counters,
        cepCacheSize: cepCache.size,
        ibgeCacheSize: ibgeCache.size,
        upstream: Object.fromEntries([...gates].map(([host, gate]) => [host, gate.stats])),
      };
    },
  };
}

/** Procura na cadeia de `cause` (inclusive dentro de AggregateError) um erro que satisfaça o teste. */
function hasCause(error: unknown, test: (e: unknown) => boolean): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth++) {
    if (test(current)) return true;
    if (!(current instanceof Error)) return false;
    const cause: unknown = current.cause;
    if (cause instanceof AggregateError) {
      return cause.errors.some((inner: unknown) => hasCause(inner, test));
    }
    current = cause;
  }
  return false;
}

/** `true` se o erro agrega falhas de vários provedores e todas satisfazem o teste. */
function allCausesAre(error: unknown, test: (e: unknown) => boolean): boolean {
  if (!(error instanceof Error) || !(error.cause instanceof AggregateError)) return false;
  return error.cause.errors.length > 0 && error.cause.errors.every(test);
}

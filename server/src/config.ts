/**
 * Configuração da API. Todos os valores têm padrão seguro e podem ser
 * ajustados por variável de ambiente. A justificativa dos números está em
 * `docs/api.md` (seção "Capacidade").
 */
export interface ServerConfig {
  host: string;
  port: number;
  /** Requisições sendo atendidas ao mesmo tempo; acima disso responde 503 na hora. */
  maxInFlight: number;
  /** Prazo total de uma requisição HTTP no Node (cabeçalhos + resposta). */
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
  /** Timeout de cada chamada a um provedor externo (inclui espera na fila). */
  upstreamTimeoutMs: number;
  cep: {
    maxEntries: number;
    ttlFoundMs: number;
    ttlNotFoundMs: number;
  };
  ibge: {
    ttlMs: number;
  };
  github: {
    /** Repositório exibido no widget da página do projeto (`dono/nome`). */
    repo: string;
    ttlMs: number;
  };
  upstream: {
    maxConcurrent: number;
    maxQueue: number;
    ratePerSecond: number;
    burst: number;
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const DEFAULT_CONFIG: ServerConfig = {
  host: '127.0.0.1',
  port: 8795,
  maxInFlight: 256,
  requestTimeoutMs: 15_000,
  headersTimeoutMs: 10_000,
  keepAliveTimeoutMs: 5_000,
  upstreamTimeoutMs: 4_000,
  cep: { maxEntries: 50_000, ttlFoundMs: 7 * DAY, ttlNotFoundMs: 6 * HOUR },
  ibge: { ttlMs: DAY },
  github: { repo: 'Efer-Eder/brasil-dev-kit', ttlMs: 10 * 60 * 1000 },
  upstream: { maxConcurrent: 4, maxQueue: 16, ratePerSecond: 4, burst: 8 },
};

function readInt(env: NodeJS.ProcessEnv, key: string, fallback: number, min = 1): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Variável ${key} inválida: ${raw} (esperado inteiro >= ${min})`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const d = DEFAULT_CONFIG;
  return {
    host: env.HOST && env.HOST !== '' ? env.HOST : d.host,
    port: readInt(env, 'PORT', d.port),
    maxInFlight: readInt(env, 'MAX_IN_FLIGHT', d.maxInFlight),
    requestTimeoutMs: readInt(env, 'REQUEST_TIMEOUT_MS', d.requestTimeoutMs),
    headersTimeoutMs: readInt(env, 'HEADERS_TIMEOUT_MS', d.headersTimeoutMs),
    keepAliveTimeoutMs: readInt(env, 'KEEP_ALIVE_TIMEOUT_MS', d.keepAliveTimeoutMs),
    upstreamTimeoutMs: readInt(env, 'UPSTREAM_TIMEOUT_MS', d.upstreamTimeoutMs),
    cep: {
      maxEntries: readInt(env, 'CEP_CACHE_MAX_ENTRIES', d.cep.maxEntries),
      ttlFoundMs: readInt(env, 'CEP_CACHE_TTL_FOUND_MS', d.cep.ttlFoundMs),
      ttlNotFoundMs: readInt(env, 'CEP_CACHE_TTL_NOT_FOUND_MS', d.cep.ttlNotFoundMs),
    },
    ibge: { ttlMs: readInt(env, 'IBGE_CACHE_TTL_MS', d.ibge.ttlMs) },
    github: {
      repo: env.GITHUB_REPO && env.GITHUB_REPO !== '' ? env.GITHUB_REPO : d.github.repo,
      ttlMs: readInt(env, 'GITHUB_CACHE_TTL_MS', d.github.ttlMs),
    },
    upstream: {
      maxConcurrent: readInt(env, 'UPSTREAM_MAX_CONCURRENT', d.upstream.maxConcurrent),
      maxQueue: readInt(env, 'UPSTREAM_MAX_QUEUE', d.upstream.maxQueue, 0),
      ratePerSecond: readInt(env, 'UPSTREAM_RATE_PER_SECOND', d.upstream.ratePerSecond),
      burst: readInt(env, 'UPSTREAM_BURST', d.upstream.burst),
    },
  };
}

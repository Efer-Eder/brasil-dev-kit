import { ValidationError } from '../../core/errors.js';
import { createHttpClient, type FetchLike, type RetryOptions } from '../../core/http.js';
import { BCB_PROVIDER, listParticipantesStr } from '../../providers/bcb.js';
import type { Banco, BancosRequestOptions } from './types.js';

export type { Banco, BancosRequestOptions, FonteBanco } from './types.js';

/** Cache padrão: o Banco Central atualiza o arquivo uma vez por dia. */
export const BANCOS_DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

export interface BancosClientOptions {
  /** Tempo limite por requisição, em ms. Padrão do core: 8000. */
  timeoutMs?: number;
  /** `fetch` customizado (testes, proxy, runtimes sem `fetch` global). */
  fetch?: FetchLike;
  /** `User-Agent` opcional (ignorado por navegadores). */
  userAgent?: string;
  /** Novas tentativas com backoff; `false` desliga. Padrão: 2 tentativas extras. */
  retry?: RetryOptions | false;
  /**
   * Tempo de vida da lista em memória, em ms. Padrão: 1 hora (a lista inteira vem
   * num arquivo só, então as consultas por código e ISPB reaproveitam a mesma
   * leitura). `0` desliga o cache.
   */
  cacheTtlMs?: number;
}

export interface BancosClient {
  /** Lista todos os participantes do STR, na ordem do arquivo oficial (por ISPB). */
  list(options?: BancosRequestOptions): Promise<Banco[]>;
  /**
   * Busca pelo código de compensação (COMPE). Aceita `'1'`, `'001'` ou `1`.
   * Devolve `null` se nenhum participante usa o código.
   *
   * @throws ValidationError se o código não tiver de 1 a 3 dígitos (sem rede).
   */
  getByCodigo(codigo: string | number, options?: BancosRequestOptions): Promise<Banco | null>;
  /**
   * Busca pelo ISPB (8 dígitos; zeros à esquerda podem faltar: `'0'` = Banco do Brasil).
   * Devolve `null` se o ISPB não está na lista.
   *
   * @throws ValidationError se o ISPB não tiver de 1 a 8 dígitos (sem rede).
   */
  getByIspb(ispb: string | number, options?: BancosRequestOptions): Promise<Banco | null>;
}

export function createBancosClient(options: BancosClientOptions = {}): BancosClient {
  const ttl = options.cacheTtlMs ?? BANCOS_DEFAULT_CACHE_TTL_MS;
  if (!Number.isFinite(ttl) || ttl < 0) {
    throw new ValidationError(`cacheTtlMs deve ser >= 0; recebido: ${String(ttl)}`);
  }
  const http = createHttpClient({
    provider: BCB_PROVIDER,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(ttl > 0 ? { cache: { ttlMs: ttl, maxEntries: 1 } } : {}),
  });

  const list = (requestOptions: BancosRequestOptions = {}) =>
    listParticipantesStr(http, requestOptions);

  return {
    list,
    async getByCodigo(codigo, requestOptions = {}) {
      const wanted = normalizeCodigoBanco(codigo);
      return (await list(requestOptions)).find((b) => b.codigo === wanted) ?? null;
    },
    async getByIspb(ispb, requestOptions = {}) {
      const wanted = normalizeIspb(ispb);
      return (await list(requestOptions)).find((b) => b.ispb === wanted) ?? null;
    },
  };
}

/** `'1'`, `1` ou `'001'` → `'001'`. @throws ValidationError fora de 1 a 3 dígitos. */
export function normalizeCodigoBanco(codigo: string | number): string {
  const text = String(codigo).trim();
  if (!/^\d{1,3}$/.test(text) || Number(text) === 0) {
    throw new ValidationError(
      `Código de banco deve ter de 1 a 3 dígitos (ex.: 001); recebido: ${text.slice(0, 20)}`,
    );
  }
  return text.padStart(3, '0');
}

/** `'0'` ou `0` → `'00000000'`. @throws ValidationError fora de 1 a 8 dígitos. */
export function normalizeIspb(ispb: string | number): string {
  const text = String(ispb).trim();
  if (!/^\d{1,8}$/.test(text)) {
    throw new ValidationError(
      `ISPB deve ter de 1 a 8 dígitos (ex.: 00000000); recebido: ${text.slice(0, 20)}`,
    );
  }
  return text.padStart(8, '0');
}

import {
  createHttpClient,
  type FetchLike,
  type HttpClientOptions,
  type RetryOptions,
} from '../../core/http.js';
import {
  IBGE_LOCALIDADES_BASE_URL,
  IBGE_PROVIDER,
  listMunicipiosIbge,
  listUfsIbge,
} from '../../providers/ibge.js';
import type { IbgeRequestOptions, Municipio, Uf } from './types.js';
import { resolveUf } from './ufs.js';

export type { DivisaoIbge, IbgeRequestOptions, Municipio, Regiao, Uf } from './types.js';
export { resolveUf, UF_CODES } from './ufs.js';

export interface IbgeClientOptions {
  /** Tempo limite por requisição, em ms. Padrão do core: 8000. */
  timeoutMs?: number;
  /** `fetch` customizado (testes, proxy, runtimes sem `fetch` global). */
  fetch?: FetchLike;
  /** `User-Agent` opcional (ignorado por navegadores). */
  userAgent?: string;
  /**
   * Novas tentativas com backoff exponencial e jitter (ver `RetryOptions`); `false` desliga.
   * Padrão: 2 tentativas extras (fonte única).
   */
  retry?: RetryOptions | false;
  /** Liga o cache em memória das respostas, com este tempo de vida (ms). Desligado se omitido. */
  cacheTtlMs?: number;
  /** Máximo de respostas em cache. Padrão: 500. */
  cacheMaxEntries?: number;
}

export interface IbgeClient {
  /** Lista as 27 UFs, ordenadas pelo nome. Fonte: API de Localidades do IBGE. */
  listUfs(options?: IbgeRequestOptions): Promise<Uf[]>;
  /**
   * Lista os municípios de uma UF, ordenados pelo nome.
   * Aceita sigla (`'SP'`) ou código IBGE (`35`).
   *
   * @throws ValidationError se a UF não existir (nenhuma requisição é feita).
   */
  listMunicipios(uf: string | number, options?: IbgeRequestOptions): Promise<Municipio[]>;
}

export function createIbgeClient(options: IbgeClientOptions = {}): IbgeClient {
  const http = createHttpClient({
    baseUrl: IBGE_LOCALIDADES_BASE_URL,
    provider: IBGE_PROVIDER,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
    ...httpExtras(options, options.retry),
  });

  return {
    listUfs: (requestOptions = {}) => listUfsIbge(http, requestOptions),
    listMunicipios: async (uf, requestOptions = {}) =>
      listMunicipiosIbge(http, resolveUf(uf), requestOptions),
  };
}

function httpExtras(
  options: { cacheTtlMs?: number; cacheMaxEntries?: number },
  retry: RetryOptions | false | undefined,
): Pick<HttpClientOptions, 'retry' | 'cache'> {
  return {
    ...(retry === undefined ? {} : { retry }),
    ...(options.cacheTtlMs === undefined
      ? {}
      : {
          cache: {
            ttlMs: options.cacheTtlMs,
            ...(options.cacheMaxEntries === undefined
              ? {}
              : { maxEntries: options.cacheMaxEntries }),
          },
        }),
  };
}

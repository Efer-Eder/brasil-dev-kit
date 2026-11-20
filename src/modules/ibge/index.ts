import { createHttpClient, type FetchLike } from '../../core/http.js';
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
  });

  return {
    listUfs: (requestOptions = {}) => listUfsIbge(http, requestOptions),
    listMunicipios: async (uf, requestOptions = {}) =>
      listMunicipiosIbge(http, resolveUf(uf), requestOptions),
  };
}

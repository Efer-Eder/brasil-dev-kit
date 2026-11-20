import {
  BrasilDevKitError,
  NotFoundError,
  ProviderUnavailableError,
  ValidationError,
} from '../../core/errors.js';
import { createHttpClient, type FetchLike, type HttpClient } from '../../core/http.js';
import {
  BRASILAPI_CEP_BASE_URL,
  BRASILAPI_PROVIDER,
  lookupCepBrasilApi,
} from '../../providers/brasilapi.js';
import { lookupCepViaCep, VIACEP_BASE_URL, VIACEP_PROVIDER } from '../../providers/viacep.js';
import { assertCep } from './format.js';
import type { CepLookupOptions, CepProviderId, Endereco } from './types.js';

export { assertCep, formatCep, isValidCepFormat, normalizeCep } from './format.js';
export type { CepLookupOptions, CepProviderId, Endereco } from './types.js';

export interface CepClientOptions {
  /**
   * Provedores consultados, em ordem. Padrão: `['viacep', 'brasilapi']`.
   * Os seguintes só são usados se o anterior falhar (ver `fallbackOnNotFound`).
   */
  providers?: readonly CepProviderId[];
  /**
   * Se `true`, um "CEP não encontrado" também passa para o próximo provedor.
   * Padrão: `false` (só indisponibilidade, timeout e limite de taxa geram fallback).
   * As bases dos provedores divergem; ative se preferir cobertura a menos requisições.
   */
  fallbackOnNotFound?: boolean;
  /** Tempo limite por provedor, em ms. Padrão do core: 8000. */
  timeoutMs?: number;
  /** `fetch` customizado (testes, proxy, runtimes sem `fetch` global). */
  fetch?: FetchLike;
  /** `User-Agent` opcional (ignorado por navegadores). */
  userAgent?: string;
}

export interface CepClient {
  /**
   * Consulta um CEP e devolve o endereço normalizado, com a procedência em `fonte`.
   *
   * @throws ValidationError se o CEP não tiver 8 dígitos (nenhuma requisição é feita).
   * @throws NotFoundError se o CEP não for encontrado.
   * @throws TimeoutError, RateLimitError, ProviderUnavailableError ou HttpError
   *   se só havia um provedor e ele falhou; com vários, `ProviderUnavailableError`
   *   cuja `cause` é um `AggregateError` com o erro de cada provedor.
   */
  lookup(cep: string, options?: CepLookupOptions): Promise<Endereco>;
}

type ProviderFn = (http: HttpClient, cep: string, options: CepLookupOptions) => Promise<Endereco>;

const REGISTRY: Record<CepProviderId, { baseUrl: string; name: string; lookup: ProviderFn }> = {
  viacep: { baseUrl: VIACEP_BASE_URL, name: VIACEP_PROVIDER, lookup: lookupCepViaCep },
  brasilapi: {
    baseUrl: BRASILAPI_CEP_BASE_URL,
    name: BRASILAPI_PROVIDER,
    lookup: lookupCepBrasilApi,
  },
};

export const DEFAULT_CEP_PROVIDERS: readonly CepProviderId[] = ['viacep', 'brasilapi'];

export function createCepClient(options: CepClientOptions = {}): CepClient {
  const providerIds = options.providers ?? DEFAULT_CEP_PROVIDERS;
  if (providerIds.length === 0) {
    throw new ValidationError('Informe ao menos um provedor de CEP.');
  }
  const unknown = providerIds.filter((id) => !(id in REGISTRY));
  if (unknown.length > 0) {
    throw new ValidationError(`Provedor(es) de CEP desconhecido(s): ${unknown.join(', ')}`);
  }

  const chain = providerIds.map((id) => {
    const entry = REGISTRY[id];
    const http = createHttpClient({
      baseUrl: entry.baseUrl,
      provider: entry.name,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
    });
    return { id, http, lookup: entry.lookup };
  });

  return {
    async lookup(input, lookupOptions = {}) {
      const cep = assertCep(input);
      const errors: unknown[] = [];

      for (const provider of chain) {
        lookupOptions.signal?.throwIfAborted();
        try {
          return await provider.lookup(provider.http, cep, lookupOptions);
        } catch (error) {
          if (lookupOptions.signal?.aborted) throw lookupOptions.signal.reason;
          // Erros que não são do SDK (bugs, cancelamento) não devem ser mascarados.
          if (!(error instanceof BrasilDevKitError)) throw error;
          errors.push(error);
          if (error instanceof NotFoundError && !options.fallbackOnNotFound) throw error;
        }
      }

      if (errors.length === 1) throw errors[0];
      if (errors.every((e) => e instanceof NotFoundError)) {
        throw new NotFoundError(`CEP ${cep} não encontrado em nenhum provedor.`, {
          cause: new AggregateError(errors),
        });
      }
      throw new ProviderUnavailableError(`Nenhum provedor de CEP respondeu para ${cep}.`, {
        cause: new AggregateError(errors),
      });
    },
  };
}

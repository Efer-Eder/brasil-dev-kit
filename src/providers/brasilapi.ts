import type { HttpClient } from '../core/http.js';
import type { CepLookupOptions, Endereco } from '../modules/cep/types.js';
import { isObject, optionalString, requiredString, unexpectedFormat } from './shared.js';

/**
 * BrasilAPI CEP v1 — especificação OpenAPI em
 * https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/docs/doc/cep.json (MIT, consultada em 20/11/2026).
 *
 * - `GET https://brasilapi.com.br/api/cep/v1/{cep}` → 200 ou 404;
 * - agrega várias fontes (OpenCep como principal e outras como fallback) e
 *   informa qual respondeu no campo `service`;
 * - 404 significa que **nenhuma** das fontes encontrou o CEP — o que inclui o
 *   caso de todas estarem fora do ar. Não dá para distinguir pela resposta.
 */
export const BRASILAPI_PROVIDER = 'brasilapi';
export const BRASILAPI_CEP_BASE_URL = 'https://brasilapi.com.br/api/cep/v1/';

export async function lookupCepBrasilApi(
  http: HttpClient,
  cep: string,
  options: CepLookupOptions = {},
): Promise<Endereco> {
  const body = await http.getJson(
    cep,
    options.signal === undefined ? {} : { signal: options.signal },
  );
  if (!isObject(body)) throw unexpectedFormat(BRASILAPI_PROVIDER, 'corpo não é um objeto');

  const responseCep = requiredString(body, 'cep', BRASILAPI_PROVIDER).replace('-', '');
  if (responseCep !== cep) {
    throw unexpectedFormat(BRASILAPI_PROVIDER, `CEP da resposta (${responseCep}) difere do pedido`);
  }

  let codigoIbgeMunicipio: string | null = null;
  if (isObject(body.ibge)) {
    codigoIbgeMunicipio = optionalString(body.ibge, 'city', BRASILAPI_PROVIDER);
  }

  return {
    cep,
    uf: requiredString(body, 'state', BRASILAPI_PROVIDER),
    municipio: requiredString(body, 'city', BRASILAPI_PROVIDER),
    bairro: optionalString(body, 'neighborhood', BRASILAPI_PROVIDER),
    logradouro: optionalString(body, 'street', BRASILAPI_PROVIDER),
    complemento: null,
    codigoIbgeMunicipio,
    fonte: {
      provedor: 'brasilapi',
      servicoOrigem: optionalString(body, 'service', BRASILAPI_PROVIDER),
    },
  };
}

import { NotFoundError } from '../core/errors.js';
import type { HttpClient } from '../core/http.js';
import type { CepLookupOptions, Endereco } from '../modules/cep/types.js';
import { isObject, optionalString, requiredString, unexpectedFormat } from './shared.js';

/**
 * ViaCEP — https://viacep.com.br/ (documentação na própria página, consultada em 20/11/2026).
 *
 * - `GET https://viacep.com.br/ws/{cep}/json/` com 8 dígitos;
 * - formato inválido → HTTP 400;
 * - CEP inexistente com formato válido → HTTP 200 com `"erro": "true"`
 *   (a gravação de 20/11/2026 veio como string; aceitamos também boolean);
 * - a página avisa que uso massivo para validar bases locais pode bloquear o acesso.
 */
export const VIACEP_PROVIDER = 'viacep';
export const VIACEP_BASE_URL = 'https://viacep.com.br/ws/';

export async function lookupCepViaCep(
  http: HttpClient,
  cep: string,
  options: CepLookupOptions = {},
): Promise<Endereco> {
  const body = await http.getJson(
    `${cep}/json/`,
    options.signal === undefined ? {} : { signal: options.signal },
  );
  if (!isObject(body)) throw unexpectedFormat(VIACEP_PROVIDER, 'corpo não é um objeto');

  if (body.erro === true || body.erro === 'true') {
    throw new NotFoundError(`CEP ${cep} não encontrado no ViaCEP.`, { provider: VIACEP_PROVIDER });
  }

  const responseCep = requiredString(body, 'cep', VIACEP_PROVIDER).replace('-', '');
  if (responseCep !== cep) {
    throw unexpectedFormat(VIACEP_PROVIDER, `CEP da resposta (${responseCep}) difere do pedido`);
  }

  return {
    cep,
    uf: requiredString(body, 'uf', VIACEP_PROVIDER),
    municipio: requiredString(body, 'localidade', VIACEP_PROVIDER),
    bairro: optionalString(body, 'bairro', VIACEP_PROVIDER),
    logradouro: optionalString(body, 'logradouro', VIACEP_PROVIDER),
    complemento: optionalString(body, 'complemento', VIACEP_PROVIDER),
    codigoIbgeMunicipio: optionalString(body, 'ibge', VIACEP_PROVIDER),
    fonte: { provedor: 'viacep', servicoOrigem: null },
  };
}

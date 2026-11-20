import type { HttpClient } from '../core/http.js';
import type {
  DivisaoIbge,
  IbgeRequestOptions,
  Municipio,
  Regiao,
  Uf,
} from '../modules/ibge/types.js';
import { isObject, type JsonObject, requiredString, unexpectedFormat } from './shared.js';

/**
 * API de Localidades do IBGE (v1) — documentação oficial em
 * https://servicodados.ibge.gov.br/api/docs/localidades (consultada em 20/11/2026).
 *
 * - `GET /api/v1/localidades/estados?orderBy=nome`
 * - `GET /api/v1/localidades/estados/{UF}/municipios?orderBy=nome` (UF = código)
 * - UF inexistente → HTTP 200 com `[]` (verificado; não documentado).
 */
export const IBGE_PROVIDER = 'ibge';
export const IBGE_LOCALIDADES_BASE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/';

function requestOptions(options: IbgeRequestOptions) {
  return {
    query: { orderBy: 'nome' },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}

function requiredId(obj: JsonObject, key = 'id'): string {
  const value = obj[key];
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  throw unexpectedFormat(IBGE_PROVIDER, `campo "${key}" ausente ou inválido`);
}

function divisao(value: unknown): DivisaoIbge | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw unexpectedFormat(IBGE_PROVIDER, 'divisão regional não é objeto');
  return { codigoIbge: requiredId(value), nome: requiredString(value, 'nome', IBGE_PROVIDER) };
}

function regiao(value: unknown): Regiao {
  if (!isObject(value)) throw unexpectedFormat(IBGE_PROVIDER, 'campo "regiao" ausente');
  return {
    codigoIbge: requiredId(value),
    sigla: requiredString(value, 'sigla', IBGE_PROVIDER),
    nome: requiredString(value, 'nome', IBGE_PROVIDER),
  };
}

function asArray(body: unknown): unknown[] {
  if (!Array.isArray(body)) throw unexpectedFormat(IBGE_PROVIDER, 'corpo não é uma lista');
  return body;
}

export async function listUfsIbge(
  http: HttpClient,
  options: IbgeRequestOptions = {},
): Promise<Uf[]> {
  const body = asArray(await http.getJson('estados', requestOptions(options)));
  if (body.length === 0) throw unexpectedFormat(IBGE_PROVIDER, 'lista de UFs vazia');
  return body.map((item) => {
    if (!isObject(item)) throw unexpectedFormat(IBGE_PROVIDER, 'UF não é objeto');
    return {
      codigoIbge: requiredId(item),
      sigla: requiredString(item, 'sigla', IBGE_PROVIDER),
      nome: requiredString(item, 'nome', IBGE_PROVIDER),
      regiao: regiao(item.regiao),
    };
  });
}

export async function listMunicipiosIbge(
  http: HttpClient,
  uf: { sigla: string; codigoIbge: string },
  options: IbgeRequestOptions = {},
): Promise<Municipio[]> {
  const body = asArray(
    await http.getJson(`estados/${uf.codigoIbge}/municipios`, requestOptions(options)),
  );
  // Toda UF válida tem municípios; lista vazia aqui indica resposta anômala.
  if (body.length === 0) {
    throw unexpectedFormat(IBGE_PROVIDER, `nenhum município retornado para a UF ${uf.sigla}`);
  }

  return body.map((item) => {
    if (!isObject(item)) throw unexpectedFormat(IBGE_PROVIDER, 'município não é objeto');
    const codigoIbge = requiredId(item);
    // Pela codificação do IBGE, os 2 primeiros dígitos do município são a UF.
    if (!codigoIbge.startsWith(uf.codigoIbge)) {
      throw unexpectedFormat(
        IBGE_PROVIDER,
        `município ${codigoIbge} não pertence à UF ${uf.sigla}`,
      );
    }

    const micro = isObject(item.microrregiao) ? item.microrregiao : null;
    const imediata = isObject(item['regiao-imediata']) ? item['regiao-imediata'] : null;

    return {
      codigoIbge,
      nome: requiredString(item, 'nome', IBGE_PROVIDER),
      uf: uf.sigla,
      microrregiao: divisao(item.microrregiao),
      mesorregiao: divisao(micro?.mesorregiao),
      regiaoImediata: divisao(item['regiao-imediata']),
      regiaoIntermediaria: divisao(imediata?.['regiao-intermediaria']),
    };
  });
}

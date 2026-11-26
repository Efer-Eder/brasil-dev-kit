import type { FetchLike, RetryOptions } from './core/http.js';
import {
  type BancosClient,
  type BancosClientOptions,
  createBancosClient,
} from './modules/bancos/index.js';
import { type CepClient, type CepClientOptions, createCepClient } from './modules/cep/index.js';
import {
  type CnpjSyntaxResult,
  type CnpjValidationResult,
  computeCnpjCheckDigits,
  type FormatCnpjOptions,
  formatCnpj,
  hasValidCnpjCheckDigits,
  isValidCnpj,
  normalizeCnpj,
  validateCnpj,
  validateCnpjSyntax,
} from './modules/cnpj/index.js';
import {
  type Ddd,
  type DddDoMunicipio,
  type DddResumo,
  getDdd,
  getDddPorMunicipio,
  isDddValido,
  listDdds,
  normalizeDdd,
} from './modules/ddd/index.js';
import {
  buscarDataNacional,
  type CalendarioFeriados,
  type DataCalendario,
  getFeriadosNacionais,
  isFeriadoNacional,
} from './modules/feriados/index.js';
import { createIbgeClient, type IbgeClient, type IbgeClientOptions } from './modules/ibge/index.js';

/** Opções que valem para todos os módulos com rede (CEP, IBGE e bancos). */
export interface BrasilDevKitSharedOptions {
  /** Tempo limite de cada tentativa, em ms. Padrão: 8000. */
  timeoutMs?: number;
  /** Novas tentativas com backoff; `false` desliga. Padrão: o de cada módulo. */
  retry?: RetryOptions | false;
  /** Liga o cache em memória com este tempo de vida (ms). Cada módulo tem o seu cache. */
  cacheTtlMs?: number;
  /** Máximo de respostas em cache por módulo. Padrão: 500. */
  cacheMaxEntries?: number;
  /** `fetch` customizado (testes, proxy, runtimes sem `fetch` global). */
  fetch?: FetchLike;
  /** `User-Agent` opcional (ignorado por navegadores). */
  userAgent?: string;
}

export interface BrasilDevKitOptions extends BrasilDevKitSharedOptions {
  /** Opções só do CEP (provedores, fallback). Sobrescrevem as comuns. */
  cep?: CepClientOptions;
  /** Opções só do IBGE. Sobrescrevem as comuns. */
  ibge?: IbgeClientOptions;
  /** Opções só de bancos. Sobrescrevem as comuns (cache padrão do módulo: 1 hora). */
  bancos?: BancosClientOptions;
}

export interface BrasilDevKit {
  /** Consulta de CEP (ViaCEP com fallback para BrasilAPI). Usa a rede. */
  readonly cep: CepClient;
  /** UFs e municípios da API de Localidades do IBGE. Usa a rede. */
  readonly ibge: IbgeClient;
  /** Feriados nacionais e pontos facultativos federais. Não usa a rede. */
  readonly feriados: {
    /** Calendário do ano (portaria federal quando disponível, senão só a lei). */
    getNacionais(ano: number): CalendarioFeriados;
    /** `true` se a data (`AAAA-MM-DD` ou `Date`) é feriado nacional. */
    isFeriado(data: string | Date): boolean;
    /** Feriado ou ponto facultativo da data, ou `null`. */
    buscar(data: string | Date): DataCalendario | null;
  };
  /** Participantes do STR (código COMPE e ISPB), do Banco Central. Usa a rede. */
  readonly bancos: BancosClient;
  /** DDDs (Códigos Nacionais da Anatel), tabela embutida. Não usa a rede. */
  readonly ddd: {
    /** Municípios e UFs do DDD, ou `null` se o código não está em uso. */
    get(ddd: string | number): Ddd | null;
    /** DDDs em uso, opcionalmente filtrados por UF. */
    list(options?: { uf?: string }): DddResumo[];
    /** DDD de um município pelo código IBGE de 7 dígitos. */
    getPorMunicipio(codigoIbge: string | number): DddDoMunicipio | null;
    isValido(ddd: string | number): boolean;
    normalize(ddd: string | number): string;
  };
  /** Validação estrutural de CNPJ numérico e alfanumérico. Não usa a rede. */
  readonly cnpj: {
    /** Sintaxe + dígitos verificadores. Não consulta a Receita Federal. */
    validate(cnpj: string): CnpjValidationResult;
    isValid(cnpj: string): boolean;
    /** Só a sintaxe (tamanho, caracteres, repetição). */
    checkSyntax(cnpj: string): CnpjSyntaxResult;
    /** Só os dígitos verificadores. */
    hasValidCheckDigits(cnpj: string): boolean;
    format(cnpj: string, options?: FormatCnpjOptions): string;
    normalize(cnpj: string): string;
    computeCheckDigits(base12: string): string;
  };
}

/** Copia só as chaves definidas, para não sobrescrever com `undefined`. */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Cria o kit com todos os módulos e opções em comum.
 *
 * ```ts
 * const br = createBrasilDevKit({ timeoutMs: 8000, cacheTtlMs: 60_000 });
 * await br.cep.lookup('01310-100');
 * await br.ibge.listMunicipios('SP');
 * br.feriados.getNacionais(2026);
 * br.cnpj.validate('12.ABC.345/01DE-35');
 * await br.bancos.getByCodigo('260');
 * br.ddd.get('61');
 * ```
 *
 * As opções comuns valem para CEP, IBGE e bancos; `cep`, `ibge` e `bancos`
 * sobrescrevem só o módulo correspondente. Feriados, DDD e CNPJ funcionam sem rede.
 */
export function createBrasilDevKit(options: BrasilDevKitOptions = {}): BrasilDevKit {
  const { cep: cepOptions, ibge: ibgeOptions, bancos: bancosOptions, ...shared } = options;
  const common = defined(shared);

  const kit: BrasilDevKit = {
    cep: createCepClient({ ...common, ...defined(cepOptions ?? {}) }),
    ibge: createIbgeClient({ ...common, ...defined(ibgeOptions ?? {}) }),
    bancos: createBancosClient({ ...common, ...defined(bancosOptions ?? {}) }),
    ddd: Object.freeze({
      get: getDdd,
      list: listDdds,
      getPorMunicipio: getDddPorMunicipio,
      isValido: isDddValido,
      normalize: normalizeDdd,
    }),
    feriados: Object.freeze({
      getNacionais: getFeriadosNacionais,
      isFeriado: isFeriadoNacional,
      buscar: buscarDataNacional,
    }),
    cnpj: Object.freeze({
      validate: validateCnpj,
      isValid: isValidCnpj,
      checkSyntax: validateCnpjSyntax,
      hasValidCheckDigits: hasValidCnpjCheckDigits,
      format: formatCnpj,
      normalize: normalizeCnpj,
      computeCheckDigits: computeCnpjCheckDigits,
    }),
  };
  return Object.freeze(kit);
}

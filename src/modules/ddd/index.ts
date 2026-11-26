import { ValidationError } from '../../core/errors.js';
import { DDD_MUNICIPIOS, PGCN_VERSAO } from './dados.js';

export { PGCN_VERSAO } from './dados.js';

/** Município atendido por um DDD (Código Nacional da Anatel). */
export interface MunicipioDdd {
  /** Código IBGE de 7 dígitos, como texto. */
  codigoIbge: string;
  nome: string;
  /** Sigla da UF (derivada dos 2 primeiros dígitos do código IBGE). */
  uf: string;
}

/** Procedência dos dados de DDD. */
export interface FonteDdd {
  provedor: 'anatel';
  servicoOrigem: 'pgcn';
  /** Data do arquivo oficial usado na tabela embutida, `AAAA-MM-DD`. */
  atualizadoEm: string;
  url: string;
}

export interface Ddd {
  /** DDD de 2 dígitos, como texto (`'11'`). */
  ddd: string;
  /** UFs atendidas, em ordem alfabética. Alguns DDDs cruzam a divisa (ex.: 61 = DF e GO). */
  ufs: string[];
  /** Municípios com o DDD vigente, em ordem alfabética. */
  municipios: MunicipioDdd[];
  fonte: FonteDdd;
}

export interface DddResumo {
  ddd: string;
  ufs: string[];
  /** Quantidade de municípios com este DDD. */
  totalMunicipios: number;
}

export interface DddDoMunicipio {
  ddd: string;
  municipio: MunicipioDdd;
  fonte: FonteDdd;
}

const FONTE: FonteDdd = Object.freeze({
  provedor: 'anatel',
  servicoOrigem: 'pgcn',
  atualizadoEm: PGCN_VERSAO.atualizadoEm,
  url: PGCN_VERSAO.url,
});

const UF_POR_CODIGO: Readonly<Record<string, string>> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}; // biome-ignore format: tabela

const collator = new Intl.Collator('pt-BR');
let indice: Map<string, MunicipioDdd[]> | undefined;
let porMunicipio: Map<string, string> | undefined;

/** Monta os índices na primeira consulta (a tabela embutida fica como texto até lá). */
function carregar(): { indice: Map<string, MunicipioDdd[]>; porMunicipio: Map<string, string> } {
  if (indice && porMunicipio) return { indice, porMunicipio };
  indice = new Map();
  porMunicipio = new Map();
  for (const [ddd, texto] of Object.entries(DDD_MUNICIPIOS)) {
    const municipios = texto.split(';').map((item) => {
      const sep = item.indexOf(':');
      const codigoIbge = item.slice(0, sep);
      const uf = UF_POR_CODIGO[codigoIbge.slice(0, 2)];
      if (uf === undefined) throw new Error(`tabela de DDD corrompida: ${codigoIbge}`);
      return { codigoIbge, nome: item.slice(sep + 1), uf };
    });
    municipios.sort((a, b) => collator.compare(a.nome, b.nome) || a.uf.localeCompare(b.uf));
    indice.set(ddd, municipios);
    for (const m of municipios) porMunicipio.set(m.codigoIbge, ddd);
  }
  return { indice, porMunicipio };
}

/**
 * Normaliza um DDD: aceita `'11'`, `11`, `'(11)'` e `'011'` (com o zero de discagem).
 *
 * @throws ValidationError se não for um Código Nacional geográfico (2 dígitos, de 11 a 99, sem zero).
 */
export function normalizeDdd(ddd: string | number): string {
  const text = String(ddd).trim();
  const match = /^\(?0?([1-9][1-9])\)?$/.exec(text);
  if (!match?.[1]) {
    throw new ValidationError(
      `DDD deve ter 2 dígitos de 1 a 9 (ex.: 11); recebido: ${text.slice(0, 20)}`,
    );
  }
  return match[1];
}

/** `true` se o DDD está em uso por algum município (tabela vigente da Anatel). */
export function isDddValido(ddd: string | number): boolean {
  try {
    return carregar().indice.has(normalizeDdd(ddd));
  } catch {
    return false;
  }
}

/**
 * Municípios e UFs de um DDD. Devolve `null` se o código tem formato válido mas não
 * está em uso (ex.: `'23'`, `'29'`, `'52'`).
 *
 * @throws ValidationError se o formato for inválido.
 */
export function getDdd(ddd: string | number): Ddd | null {
  const codigo = normalizeDdd(ddd);
  const municipios = carregar().indice.get(codigo);
  if (!municipios) return null;
  return {
    ddd: codigo,
    ufs: [...new Set(municipios.map((m) => m.uf))].sort(),
    municipios: municipios.map((m) => ({ ...m })),
    fonte: { ...FONTE },
  };
}

/** Todos os DDDs em uso, em ordem crescente. Com `uf`, só os que atendem a UF. */
export function listDdds(options: { uf?: string } = {}): DddResumo[] {
  const uf = options.uf?.trim().toUpperCase();
  if (uf !== undefined && !Object.values(UF_POR_CODIGO).includes(uf)) {
    throw new ValidationError(`UF inexistente: ${uf.slice(0, 20)}`);
  }
  const resumo: DddResumo[] = [];
  for (const [ddd, municipios] of carregar().indice) {
    const ufs = [...new Set(municipios.map((m) => m.uf))].sort();
    if (uf !== undefined && !ufs.includes(uf)) continue;
    resumo.push({ ddd, ufs, totalMunicipios: municipios.length });
  }
  return resumo.sort((a, b) => a.ddd.localeCompare(b.ddd));
}

/**
 * DDD de um município pelo código IBGE de 7 dígitos. Devolve `null` se o código não
 * existe na tabela.
 *
 * @throws ValidationError se o código não tiver 7 dígitos.
 */
export function getDddPorMunicipio(codigoIbge: string | number): DddDoMunicipio | null {
  const codigo = String(codigoIbge).trim();
  if (!/^\d{7}$/.test(codigo)) {
    throw new ValidationError(
      `Código IBGE de município deve ter 7 dígitos (ex.: 3550308); recebido: ${codigo.slice(0, 20)}`,
    );
  }
  const { indice: idx, porMunicipio: mapa } = carregar();
  const ddd = mapa.get(codigo);
  if (ddd === undefined) return null;
  const municipio = idx.get(ddd)?.find((m) => m.codigoIbge === codigo);
  if (!municipio) return null;
  return { ddd, municipio: { ...municipio }, fonte: { ...FONTE } };
}

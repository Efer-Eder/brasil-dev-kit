import { parseCsv } from '../core/csv.js';
import type { HttpClient } from '../core/http.js';
import type { Banco, BancosRequestOptions } from '../modules/bancos/types.js';
import { unexpectedFormat } from './shared.js';

/**
 * Relação de participantes do STR, publicada pelo Banco Central do Brasil:
 * https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv
 * Conjunto oficial: https://dadosabertos.bcb.gov.br/dataset/lista-de-participantes-do-str
 * (licença ODbL; o dicionário de dados diz que a lista é "atualizada diariamente").
 *
 * Formato verificado em 26/11/2026: UTF-8 com BOM, separador vírgula, campos com
 * vírgula entre aspas, quebra `\n`, 473 linhas de dados. Colunas:
 * `ISPB,Nome_Reduzido,Número_Código,Participa_da_Compe,Acesso_Principal,Nome_Extenso,Início_da_Operação`.
 * Sem código: `n/a` (Selic, Bacen, CIP...) ou `0` (sistemas da B3).
 */
export const BCB_PROVIDER = 'bcb';
export const BCB_STR_URL =
  'https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv';

const EXPECTED_HEADER = [
  'ISPB',
  'Nome_Reduzido',
  'Número_Código',
  'Participa_da_Compe',
  'Acesso_Principal',
  'Nome_Extenso',
  'Início_da_Operação',
];

export async function listParticipantesStr(
  http: HttpClient,
  options: BancosRequestOptions = {},
): Promise<Banco[]> {
  const text = await http.getText(
    BCB_STR_URL,
    options.signal === undefined ? {} : { signal: options.signal },
  );
  return parseParticipantesStr(text);
}

/** Converte o CSV oficial em `Banco[]`, validando cabeçalho e cada linha. */
export function parseParticipantesStr(text: string): Banco[] {
  let rows: string[][];
  try {
    rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw unexpectedFormat(BCB_PROVIDER, (error as Error).message);
  }

  const header = rows[0]?.map((h) => h.trim().normalize('NFC'));
  if (!header || EXPECTED_HEADER.some((name, i) => header[i] !== name)) {
    throw unexpectedFormat(BCB_PROVIDER, 'cabeçalho do CSV de participantes do STR mudou');
  }
  if (rows.length < 2) throw unexpectedFormat(BCB_PROVIDER, 'lista de participantes vazia');

  return rows.slice(1).map((cols, index) => parseRow(cols, index + 2));
}

function parseRow(cols: string[], line: number): Banco {
  if (cols.length !== EXPECTED_HEADER.length) {
    throw unexpectedFormat(BCB_PROVIDER, `linha ${line} com ${cols.length} colunas`);
  }
  const [ispb, nomeReduzido, codigo, compe, acesso, nome, inicio] = cols.map((c) => c.trim()) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  if (!/^\d{8}$/.test(ispb)) throw unexpectedFormat(BCB_PROVIDER, `ISPB inválido na linha ${line}`);
  if (codigo !== 'n/a' && !/^\d{1,3}$/.test(codigo)) {
    throw unexpectedFormat(BCB_PROVIDER, `código inválido na linha ${line}`);
  }
  if (compe !== 'Sim' && compe !== 'Não') {
    throw unexpectedFormat(BCB_PROVIDER, `Participa_da_Compe inválido na linha ${line}`);
  }
  const data = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(inicio);
  if (!data) throw unexpectedFormat(BCB_PROVIDER, `data inválida na linha ${line}`);
  if (nomeReduzido === '' || nome === '' || acesso === '') {
    throw unexpectedFormat(BCB_PROVIDER, `campo vazio na linha ${line}`);
  }

  return {
    ispb,
    // `0` e `n/a` marcam participantes sem código de compensação.
    codigo: codigo === 'n/a' || Number(codigo) === 0 ? null : codigo.padStart(3, '0'),
    nomeReduzido,
    nome,
    participaCompe: compe === 'Sim',
    acessoPrincipal: acesso,
    inicioOperacao: `${data[3]}-${data[2]}-${data[1]}`,
    fonte: { provedor: 'bcb', servicoOrigem: 'participantes-str', url: BCB_STR_URL },
  };
}

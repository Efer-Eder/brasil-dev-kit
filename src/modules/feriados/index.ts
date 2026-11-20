import { ValidationError } from '../../core/errors.js';
import { FERIADOS_FIXOS, LEIS, PORTARIAS } from './dados.js';
import type { CalendarioFeriados, DataCalendario } from './types.js';

export type {
  CalendarioFeriados,
  DataCalendario,
  FonteCalendario,
  Periodo,
  TipoData,
} from './types.js';

/**
 * Anos aceitos. Começa em 2024, primeiro ano com o 20 de novembro como feriado
 * nacional (Lei nº 14.759/2023, em vigor desde 22/12/2023).
 */
export const ANO_MINIMO = 2024;
export const ANO_MAXIMO = 2099;

/** Anos com calendário oficial completo (portaria federal transcrita e conferida). */
export const ANOS_COM_PORTARIA: readonly number[] = Object.keys(PORTARIAS)
  .map(Number)
  .sort((a, b) => a - b);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

function assertAno(ano: number): void {
  if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > ANO_MAXIMO) {
    throw new ValidationError(
      `Ano deve ser inteiro entre ${ANO_MINIMO} e ${ANO_MAXIMO}; recebido: ${String(ano)}`,
    );
  }
}

/**
 * Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus/Jones/Butcher).
 * Devolve `AAAA-MM-DD`.
 */
export function calcularPascoa(ano: number): string {
  if (!Number.isInteger(ano) || ano < 1583) {
    throw new ValidationError(`Ano inválido para o cálculo da Páscoa: ${String(ano)}`);
  }
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

function somarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function calendarioPorLei(ano: number): CalendarioFeriados {
  const paixao: DataCalendario = {
    data: somarDias(calcularPascoa(ano), -2),
    nome: 'Paixão de Cristo',
    tipo: 'feriado_nacional',
    periodo: 'dia_inteiro',
    baseLegal: LEIS.lei9093.descricao,
    observacao:
      'Data calculada pela Páscoa. Pela Lei nº 9.093/1995 é feriado religioso declarado em lei municipal; as portarias federais de 2025 e 2026 a listam como feriado nacional.',
  };
  const fixos: DataCalendario[] = FERIADOS_FIXOS.map((f) => ({
    data: iso(ano, f.mes, f.dia),
    nome: f.nome,
    tipo: 'feriado_nacional',
    periodo: 'dia_inteiro',
    baseLegal: f.baseLegal,
    observacao: null,
  }));
  return {
    ano,
    origem: 'lei',
    fontes: Object.values(LEIS).map((l) => ({ ...l })),
    datas: [...fixos, paixao].sort((x, y) => x.data.localeCompare(y.data)),
    avisos: [
      `A portaria federal com os feriados e pontos facultativos de ${ano} não está na base. A lista traz só os feriados nacionais previstos em lei; pontos facultativos (Carnaval, Corpus Christi etc.) não estão incluídos.`,
    ],
  };
}

/**
 * Calendário de feriados nacionais do ano.
 *
 * - Com portaria federal na base (`ANOS_COM_PORTARIA`): calendário oficial
 *   completo, com feriados e pontos facultativos da administração federal.
 * - Sem portaria: só feriados nacionais previstos em lei, com aviso.
 *
 * Não inclui feriados estaduais nem municipais.
 *
 * @throws ValidationError se o ano estiver fora de `ANO_MINIMO`–`ANO_MAXIMO`.
 */
export function getFeriadosNacionais(ano: number): CalendarioFeriados {
  assertAno(ano);
  const portaria = PORTARIAS[ano];
  if (!portaria) return calendarioPorLei(ano);
  return {
    ano,
    origem: 'portaria',
    fontes: [{ ...portaria.fonte }],
    datas: portaria.datas.map((d) => ({ ...d })),
    avisos: [
      'Pontos facultativos valem para a administração pública federal; empresas privadas e outros entes podem adotar regras próprias.',
    ],
  };
}

function parseData(data: string | Date): { iso: string; ano: number } {
  if (data instanceof Date) {
    if (Number.isNaN(data.getTime())) throw new ValidationError('Data inválida.');
    const value = iso(data.getFullYear(), data.getMonth() + 1, data.getDate());
    return { iso: value, ano: data.getFullYear() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!match) throw new ValidationError(`Data deve estar no formato AAAA-MM-DD; recebido: ${data}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new ValidationError(`Data inexistente: ${data}`);
  }
  return { iso: data, ano: y };
}

/**
 * Procura a data no calendário nacional do ano. Devolve o item (feriado ou
 * ponto facultativo) ou `null`. `Date` é lido no fuso local.
 */
export function buscarDataNacional(data: string | Date): DataCalendario | null {
  const { iso: value, ano } = parseData(data);
  return getFeriadosNacionais(ano).datas.find((d) => d.data === value) ?? null;
}

/** `true` se a data é feriado nacional (pontos facultativos não contam). */
export function isFeriadoNacional(data: string | Date): boolean {
  return buscarDataNacional(data)?.tipo === 'feriado_nacional';
}

import type { DataCalendario, FonteCalendario } from './types.js';

/**
 * Fontes consultadas em 20/11/2026.
 *
 * Feriados nacionais por lei (texto no Planalto):
 * - Lei nº 662/1949, art. 1º, com redação da Lei nº 10.607/2002: 1/1, 21/4, 1/5, 7/9, 2/11, 15/11 e 25/12.
 * - Lei nº 6.802/1980: 12/10 (Nossa Senhora Aparecida).
 * - Lei nº 14.759/2023 (DOU 22/12/2023): 20/11 (Dia Nacional de Zumbi e da Consciência Negra).
 * - Lei nº 9.093/1995, art. 2º: a Sexta-Feira da Paixão é feriado religioso declarado em lei
 *   municipal; as portarias federais anuais a listam como feriado nacional.
 */
export const LEIS = {
  lei662: {
    descricao: 'Lei nº 662/1949, com redação da Lei nº 10.607/2002',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l0662.htm',
  },
  lei6802: {
    descricao: 'Lei nº 6.802/1980',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l6802.htm',
  },
  lei14759: {
    descricao: 'Lei nº 14.759/2023',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm',
  },
  lei9093: {
    descricao: 'Lei nº 9.093/1995',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l9093.htm',
  },
} as const satisfies Record<string, FonteCalendario>;

export interface FeriadoFixo {
  mes: number;
  dia: number;
  nome: string;
  baseLegal: string;
}

/** Feriados nacionais de data fixa, com o nome usado nas portarias federais. */
export const FERIADOS_FIXOS: readonly FeriadoFixo[] = [
  { mes: 1, dia: 1, nome: 'Confraternização Universal', baseLegal: LEIS.lei662.descricao },
  { mes: 4, dia: 21, nome: 'Tiradentes', baseLegal: LEIS.lei662.descricao },
  { mes: 5, dia: 1, nome: 'Dia Mundial do Trabalho', baseLegal: LEIS.lei662.descricao },
  { mes: 9, dia: 7, nome: 'Independência do Brasil', baseLegal: LEIS.lei662.descricao },
  { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida', baseLegal: LEIS.lei6802.descricao },
  { mes: 11, dia: 2, nome: 'Finados', baseLegal: LEIS.lei662.descricao },
  { mes: 11, dia: 15, nome: 'Proclamação da República', baseLegal: LEIS.lei662.descricao },
  {
    mes: 11,
    dia: 20,
    nome: 'Dia Nacional de Zumbi e da Consciência Negra',
    baseLegal: LEIS.lei14759.descricao,
  },
  { mes: 12, dia: 25, nome: 'Natal', baseLegal: LEIS.lei662.descricao },
];

export interface PortariaAnual {
  fonte: FonteCalendario;
  datas: readonly DataCalendario[];
}

const feriado = (data: string, nome: string, baseLegal: string): DataCalendario => ({
  data,
  nome,
  tipo: 'feriado_nacional',
  periodo: 'dia_inteiro',
  baseLegal,
  observacao: null,
});

const ponto = (
  data: string,
  nome: string,
  baseLegal: string,
  periodo: DataCalendario['periodo'] = 'dia_inteiro',
  observacao: string | null = null,
): DataCalendario => ({ data, nome, tipo: 'ponto_facultativo', periodo, baseLegal, observacao });

const PAIXAO_OBS =
  'Listada como feriado nacional na portaria federal; pela Lei nº 9.093/1995 é feriado religioso declarado em lei municipal.';

const P2025 = 'Portaria MGI nº 9.783/2024';
const P2026 = 'Portaria MGI nº 11.460/2025';

/**
 * Calendários oficiais transcritos das portarias do Ministério da Gestão e da
 * Inovação em Serviços Públicos (administração pública federal). A lista e os
 * textos são os da publicação oficial no gov.br.
 */
export const PORTARIAS: Readonly<Record<number, PortariaAnual>> = {
  2025: {
    fonte: {
      descricao: `${P2025}, de 27/12/2024 (DOU de 30/12/2024)`,
      url: 'https://www.gov.br/gestao/pt-br/assuntos/noticias/2024/dezembro/gestao-divulga-calendario-de-feriados-e-pontos-facultativos-em-2025',
    },
    datas: [
      feriado('2025-01-01', 'Confraternização Universal', P2025),
      ponto('2025-03-03', 'Carnaval', P2025),
      ponto('2025-03-04', 'Carnaval', P2025),
      ponto('2025-03-05', 'Quarta-Feira de Cinzas', P2025, 'ate_14h'),
      { ...feriado('2025-04-18', 'Paixão de Cristo', P2025), observacao: PAIXAO_OBS },
      feriado('2025-04-21', 'Tiradentes', P2025),
      feriado('2025-05-01', 'Dia Mundial do Trabalho', P2025),
      ponto('2025-06-19', 'Corpus Christi', P2025),
      ponto('2025-06-20', 'Ponto facultativo', P2025),
      feriado('2025-09-07', 'Independência do Brasil', P2025),
      feriado('2025-10-12', 'Nossa Senhora Aparecida', P2025),
      ponto(
        '2025-10-27',
        'Dia do Servidor Público federal',
        P2025,
        'dia_inteiro',
        'A portaria fixa o Dia do Servidor em 28 de outubro, a ser comemorado no dia 27.',
      ),
      feriado('2025-11-02', 'Finados', P2025),
      feriado('2025-11-15', 'Proclamação da República', P2025),
      feriado('2025-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', P2025),
      ponto('2025-12-24', 'Véspera do Natal', P2025, 'apos_13h'),
      feriado('2025-12-25', 'Natal', P2025),
      ponto('2025-12-31', 'Véspera do Ano Novo', P2025, 'apos_13h'),
    ],
  },
  2026: {
    fonte: {
      descricao: `${P2026}, de 29/12/2025 (DOU de 30/12/2025)`,
      url: 'https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026',
    },
    datas: [
      feriado('2026-01-01', 'Confraternização Universal', P2026),
      ponto('2026-02-16', 'Carnaval', P2026),
      ponto('2026-02-17', 'Carnaval', P2026),
      ponto('2026-02-18', 'Quarta-Feira de Cinzas', P2026, 'ate_14h'),
      { ...feriado('2026-04-03', 'Paixão de Cristo', P2026), observacao: PAIXAO_OBS },
      ponto('2026-04-20', 'Ponto facultativo', P2026),
      feriado('2026-04-21', 'Tiradentes', P2026),
      feriado('2026-05-01', 'Dia Mundial do Trabalho', P2026),
      ponto('2026-06-04', 'Corpus Christi', P2026),
      ponto('2026-06-05', 'Ponto facultativo', P2026),
      feriado('2026-09-07', 'Independência do Brasil', P2026),
      feriado('2026-10-12', 'Nossa Senhora Aparecida', P2026),
      ponto('2026-10-28', 'Dia do Servidor Público federal', P2026),
      feriado('2026-11-02', 'Finados', P2026),
      feriado('2026-11-15', 'Proclamação da República', P2026),
      feriado('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', P2026),
      ponto('2026-12-24', 'Véspera do Natal', P2026, 'apos_13h'),
      feriado('2026-12-25', 'Natal', P2026),
      ponto('2026-12-31', 'Véspera do Ano Novo', P2026, 'apos_13h'),
    ],
  },
};

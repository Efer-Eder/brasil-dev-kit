/** `feriado_nacional` ou `ponto_facultativo` (este último só vale para a administração pública federal). */
export type TipoData = 'feriado_nacional' | 'ponto_facultativo';

/** Parte do dia em que vale o ponto facultativo. Feriados são sempre `dia_inteiro`. */
export type Periodo = 'dia_inteiro' | 'ate_14h' | 'apos_13h';

export interface DataCalendario {
  /** Data no formato `AAAA-MM-DD`. */
  data: string;
  nome: string;
  tipo: TipoData;
  periodo: Periodo;
  /** Ato que fundamenta a data (lei ou portaria). */
  baseLegal: string;
  /** Esclarecimentos (ex.: data calculada, diferença entre lei e portaria). */
  observacao: string | null;
}

export interface FonteCalendario {
  descricao: string;
  url: string;
}

export interface CalendarioFeriados {
  ano: number;
  /**
   * `portaria`: calendário oficial do governo federal para o ano (feriados e pontos facultativos).
   * `lei`: só feriados nacionais previstos em lei, porque a portaria do ano não está na base.
   */
  origem: 'portaria' | 'lei';
  fontes: FonteCalendario[];
  datas: DataCalendario[];
  avisos: string[];
}

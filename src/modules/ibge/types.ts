/** Referência a uma divisão territorial do IBGE (código + nome). */
export interface DivisaoIbge {
  /** Código IBGE, como texto (preserva zeros e evita aritmética acidental). */
  codigoIbge: string;
  nome: string;
}

export interface Regiao extends DivisaoIbge {
  /** Sigla da grande região: `N`, `NE`, `SE`, `S` ou `CO`. */
  sigla: string;
}

/** Unidade da Federação, conforme a API de Localidades do IBGE. */
export interface Uf extends DivisaoIbge {
  /** Sigla da UF (ex.: `SP`). */
  sigla: string;
  regiao: Regiao;
}

/** Município, conforme a API de Localidades do IBGE. */
export interface Municipio extends DivisaoIbge {
  /** Sigla da UF do município. */
  uf: string;
  /**
   * Divisão regional de 1989–2017. Pode ser `null`: municípios criados depois
   * (ex.: Boa Esperança do Norte/MT) não têm microrregião.
   */
  microrregiao: DivisaoIbge | null;
  mesorregiao: DivisaoIbge | null;
  /** Divisão regional vigente desde 2017. */
  regiaoImediata: DivisaoIbge | null;
  regiaoIntermediaria: DivisaoIbge | null;
}

export interface IbgeRequestOptions {
  signal?: AbortSignal;
}

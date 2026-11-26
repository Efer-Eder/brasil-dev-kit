/** Participante do STR (Sistema de Transferência de Reservas), conforme o Banco Central. */
export interface Banco {
  /** ISPB: 8 dígitos, como texto (preserva zeros à esquerda). Identificador único. */
  ispb: string;
  /**
   * Código de compensação (COMPE), 3 dígitos, como texto (`'001'`, `'260'`).
   * `null` para participantes sem código (o arquivo traz `n/a` ou `0`: Selic,
   * câmaras e sistemas de liquidação).
   */
  codigo: string | null;
  /** Nome reduzido, como publicado (`'BCO DO BRASIL S.A.'`). */
  nomeReduzido: string;
  /** Nome extenso (razão social), como publicado. */
  nome: string;
  /** Participa da Compe (compensação de cheques e outros papéis). */
  participaCompe: boolean;
  /** Acesso principal ao STR: `'RSFN'` ou `'Internet'`, como publicado. */
  acessoPrincipal: string;
  /** Início da operação no STR, `AAAA-MM-DD`. */
  inicioOperacao: string;
  fonte: FonteBanco;
}

export interface FonteBanco {
  /** Sempre `'bcb'` (Banco Central do Brasil). */
  provedor: 'bcb';
  /** Arquivo de origem. */
  servicoOrigem: 'participantes-str';
  /** URL do arquivo oficial lido. */
  url: string;
}

export interface BancosRequestOptions {
  /** Cancela a requisição (inclusive durante as novas tentativas). */
  signal?: AbortSignal;
}

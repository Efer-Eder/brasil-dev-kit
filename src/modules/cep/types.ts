/** Identificadores dos provedores de CEP suportados. */
export type CepProviderId = 'viacep' | 'brasilapi';

/** Endereço normalizado, independente do provedor que respondeu. */
export interface Endereco {
  /** CEP com 8 dígitos, sem hífen. */
  cep: string;
  /** Sigla da unidade federativa (ex.: `SP`). */
  uf: string;
  /** Nome do município. */
  municipio: string;
  /** Bairro; `null` quando o provedor não informa (comum em CEPs gerais de município). */
  bairro: string | null;
  /** Logradouro; `null` quando o provedor não informa. */
  logradouro: string | null;
  /** Complemento do CEP (ex.: faixa de numeração); `null` se ausente. Só o ViaCEP informa. */
  complemento: string | null;
  /** Código IBGE do município (7 dígitos); `null` se ausente. */
  codigoIbgeMunicipio: string | null;
  /** Procedência dos dados. */
  fonte: {
    /** Provedor consultado pelo SDK. */
    provedor: CepProviderId;
    /**
     * Serviço de origem informado pelo provedor, quando houver. O BrasilAPI agrega
     * várias fontes e indica qual respondeu (ex.: `open-cep`, `correios`).
     */
    servicoOrigem: string | null;
  };
}

export interface CepLookupOptions {
  /** Cancela a consulta (inclusive o fallback para os próximos provedores). */
  signal?: AbortSignal;
}

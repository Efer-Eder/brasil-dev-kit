/**
 * Erros tipados do Brasil Dev Kit.
 *
 * Todos herdam de `BrasilDevKitError` e expõem um `code` estável, que pode ser
 * usado em `switch`/comparações sem depender da mensagem (que pode mudar).
 */

export type BrasilDevKitErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'HTTP_ERROR';

export interface BrasilDevKitErrorOptions {
  /** Erro original que provocou este erro, quando houver. */
  cause?: unknown;
  /** Identificador do provedor/fonte de dados envolvida, quando houver. */
  provider?: string;
}

export class BrasilDevKitError extends Error {
  readonly code: BrasilDevKitErrorCode;
  readonly provider: string | undefined;

  constructor(
    code: BrasilDevKitErrorCode,
    message: string,
    options: BrasilDevKitErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.provider = options.provider;
  }
}

/** Entrada inválida fornecida pelo chamador (formato, dígitos verificadores etc.). */
export class ValidationError extends BrasilDevKitError {
  constructor(message: string, options?: BrasilDevKitErrorOptions) {
    super('VALIDATION_ERROR', message, options);
  }
}

/** O recurso consultado não existe no provedor (ex.: HTTP 404). */
export class NotFoundError extends BrasilDevKitError {
  constructor(message: string, options?: BrasilDevKitErrorOptions) {
    super('NOT_FOUND', message, options);
  }
}

export interface RateLimitErrorOptions extends BrasilDevKitErrorOptions {
  /** Tempo sugerido pelo provedor (cabeçalho `Retry-After`), em milissegundos. */
  retryAfterMs?: number;
}

/** O provedor recusou a requisição por limite de taxa (ex.: HTTP 429). */
export class RateLimitError extends BrasilDevKitError {
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: RateLimitErrorOptions = {}) {
    super('RATE_LIMIT', message, options);
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface TimeoutErrorOptions extends BrasilDevKitErrorOptions {
  timeoutMs: number;
}

/** A requisição excedeu o tempo limite configurado. */
export class TimeoutError extends BrasilDevKitError {
  readonly timeoutMs: number;

  constructor(message: string, options: TimeoutErrorOptions) {
    super('TIMEOUT', message, options);
    this.timeoutMs = options.timeoutMs;
  }
}

export interface ProviderUnavailableErrorOptions extends BrasilDevKitErrorOptions {
  /** Status HTTP, quando a falha veio de uma resposta (ex.: 503). */
  status?: number;
}

/**
 * O provedor não pôde ser usado: falha de rede, resposta 5xx ou corpo
 * que não é o JSON esperado.
 */
export class ProviderUnavailableError extends BrasilDevKitError {
  readonly status: number | undefined;

  constructor(message: string, options: ProviderUnavailableErrorOptions = {}) {
    super('PROVIDER_UNAVAILABLE', message, options);
    this.status = options.status;
  }
}

export interface HttpErrorOptions extends BrasilDevKitErrorOptions {
  status: number;
}

/** Resposta HTTP com status inesperado que não se encaixa nas classes acima (ex.: 400, 403). */
export class HttpError extends BrasilDevKitError {
  readonly status: number;

  constructor(message: string, options: HttpErrorOptions) {
    super('HTTP_ERROR', message, options);
    this.status = options.status;
  }
}

export function isBrasilDevKitError(value: unknown): value is BrasilDevKitError {
  return value instanceof BrasilDevKitError;
}

export {
  BrasilDevKitError,
  type BrasilDevKitErrorCode,
  type BrasilDevKitErrorOptions,
  HttpError,
  isBrasilDevKitError,
  NotFoundError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from './core/errors.js';
export {
  createHttpClient,
  DEFAULT_TIMEOUT_MS,
  type FetchLike,
  type HttpClient,
  type HttpClientOptions,
  type QueryValue,
  type RequestOptions,
} from './core/http.js';
export {
  type CnpjInvalidReason,
  type CnpjValidationResult,
  computeCnpjCheckDigits,
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
  validateCnpj,
} from './modules/cnpj/index.js';

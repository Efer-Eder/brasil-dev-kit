import { ProviderUnavailableError } from '../core/errors.js';

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lê um campo de texto obrigatório; lança `ProviderUnavailableError` se ausente. */
export function requiredString(obj: JsonObject, key: string, provider: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw unexpectedFormat(provider, `campo "${key}" ausente ou inválido`);
  }
  return value.trim();
}

/** Lê um campo de texto opcional; strings vazias, `null` e ausência viram `null`. */
export function optionalString(obj: JsonObject, key: string, provider: string): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw unexpectedFormat(provider, `campo "${key}" não é texto`);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function unexpectedFormat(provider: string, detail: string): ProviderUnavailableError {
  return new ProviderUnavailableError(
    `Resposta do provedor ${provider} em formato inesperado: ${detail}`,
    {
      provider,
    },
  );
}

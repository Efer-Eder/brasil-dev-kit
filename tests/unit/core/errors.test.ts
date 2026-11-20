import { describe, expect, it } from 'vitest';
import {
  BrasilDevKitError,
  HttpError,
  isBrasilDevKitError,
  NotFoundError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from '../../../src/core/errors.js';

describe('erros tipados', () => {
  const cases = [
    [new ValidationError('x'), 'VALIDATION_ERROR', 'ValidationError'],
    [new NotFoundError('x'), 'NOT_FOUND', 'NotFoundError'],
    [new RateLimitError('x'), 'RATE_LIMIT', 'RateLimitError'],
    [new TimeoutError('x', { timeoutMs: 1 }), 'TIMEOUT', 'TimeoutError'],
    [new ProviderUnavailableError('x'), 'PROVIDER_UNAVAILABLE', 'ProviderUnavailableError'],
    [new HttpError('x', { status: 400 }), 'HTTP_ERROR', 'HttpError'],
  ] as const;

  it.each(cases)('%o tem code e name corretos', (error, code, name) => {
    expect(error).toBeInstanceOf(BrasilDevKitError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
    expect(isBrasilDevKitError(error)).toBe(true);
  });

  it('preserva cause e provider', () => {
    const cause = new Error('raiz');
    const error = new ProviderUnavailableError('falhou', { cause, provider: 'ibge', status: 503 });
    expect(error.cause).toBe(cause);
    expect(error.provider).toBe('ibge');
    expect(error.status).toBe(503);
  });

  it('isBrasilDevKitError rejeita erros comuns', () => {
    expect(isBrasilDevKitError(new Error('x'))).toBe(false);
    expect(isBrasilDevKitError('x')).toBe(false);
  });
});

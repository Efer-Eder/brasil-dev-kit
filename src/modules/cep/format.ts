import { ValidationError } from '../../core/errors.js';

const SEPARATORS = /[.\-\s]/g;

/** Remove hífen, pontos e espaços. Não valida o resultado. */
export function normalizeCep(input: string): string {
  return input.replace(SEPARATORS, '');
}

/** `true` se, após a normalização, o CEP tiver exatamente 8 dígitos. Não consulta provedores. */
export function isValidCepFormat(input: string): boolean {
  return typeof input === 'string' && /^\d{8}$/.test(normalizeCep(input));
}

/**
 * Normaliza e confere o formato (8 dígitos). Lança `ValidationError` se inválido.
 * Validar antes de consultar evita requisições inúteis, como pede a documentação do ViaCEP.
 */
export function assertCep(input: string): string {
  if (!isValidCepFormat(input)) {
    throw new ValidationError(
      `CEP deve ter 8 dígitos (ex.: 01310-100); recebido: ${String(input)}`,
    );
  }
  return normalizeCep(input);
}

/** Formata como `00000-000`. Lança `ValidationError` se o formato for inválido. */
export function formatCep(input: string): string {
  const cep = assertCep(input);
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}

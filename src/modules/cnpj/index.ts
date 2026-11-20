import { ValidationError } from '../../core/errors.js';

/**
 * Validação estrutural de CNPJ (numérico e alfanumérico).
 *
 * Regras conforme o manual "Cálculo dos dígitos verificadores de CNPJ alfanumérico"
 * (Serpro/Receita Federal), referente à IN RFB nº 2.229/2024:
 * - 14 caracteres: 12 primeiros alfanuméricos (0-9, A-Z maiúsculas) e 2 DVs numéricos;
 * - valor de cada caractere = código ASCII − 48 (0→0 … 9→9, A→17 … Z→42);
 * - pesos de 2 a 9 distribuídos da direita para a esquerda, recomeçando após o 8º;
 * - DV = 0 se o resto da soma por 11 for 0 ou 1; caso contrário, 11 − resto.
 *
 * CNPJs numéricos existentes continuam válidos e passam pelo mesmo cálculo.
 *
 * IMPORTANTE: validar o formato NÃO atesta que o CNPJ existe, está ativo ou
 * regular perante a Receita Federal.
 */

export type CnpjInvalidReason =
  | 'empty'
  | 'invalid_length'
  | 'invalid_characters'
  | 'repeated_characters'
  | 'invalid_check_digits';

export type CnpjValidationResult =
  | {
      valid: true;
      /** 14 caracteres, sem pontuação, letras em maiúsculas. */
      normalized: string;
      /** Formato `XX.XXX.XXX/XXXX-XX`. */
      formatted: string;
      /** `numeric` para CNPJs só com dígitos, `alphanumeric` se houver letras. */
      kind: 'numeric' | 'alphanumeric';
    }
  | {
      valid: false;
      reason: CnpjInvalidReason;
      message: string;
    };

const CNPJ_LENGTH = 14;
const BASE_LENGTH = 12;
/** Pontuação aceita e removida na normalização: ponto, barra, hífen e espaços. */
const SEPARATORS = /[.\-/\s]/g;
const STRUCTURE = /^[0-9A-Z]{12}[0-9]{2}$/;
const ASCII_ZERO = 48;

/**
 * Remove pontuação (`.`, `/`, `-`, espaços) e converte letras para maiúsculas.
 * Não valida o resultado.
 */
export function normalizeCnpj(input: string): string {
  return input.replace(SEPARATORS, '').toUpperCase();
}

function charValue(char: string): number {
  return char.charCodeAt(0) - ASCII_ZERO;
}

function checkDigit(chars: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = chars.length - 1; i >= 0; i--) {
    sum += charValue(chars.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * Calcula os dois dígitos verificadores a partir dos 12 primeiros caracteres
 * (com ou sem pontuação). Lança `ValidationError` se a base for inválida.
 */
export function computeCnpjCheckDigits(base: string): string {
  const normalized = normalizeCnpj(base);
  if (!/^[0-9A-Z]{12}$/.test(normalized)) {
    throw new ValidationError(
      'A base do CNPJ deve ter 12 caracteres alfanuméricos (0-9, A-Z), sem os dígitos verificadores.',
    );
  }
  const first = checkDigit(normalized);
  const second = checkDigit(`${normalized}${first}`);
  return `${first}${second}`;
}

/** Valida um CNPJ (numérico ou alfanumérico) e devolve o motivo em caso de falha. */
export function validateCnpj(input: string): CnpjValidationResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return invalid('empty', 'CNPJ vazio.');
  }
  const normalized = normalizeCnpj(input);

  if (normalized.length !== CNPJ_LENGTH) {
    return invalid(
      'invalid_length',
      `CNPJ deve ter ${CNPJ_LENGTH} caracteres sem pontuação; recebido: ${normalized.length}.`,
    );
  }
  if (!STRUCTURE.test(normalized)) {
    return invalid(
      'invalid_characters',
      'Os 12 primeiros caracteres devem ser 0-9 ou A-Z e os 2 últimos (DV) devem ser dígitos.',
    );
  }
  // Convenção desta biblioteca (não consta do manual de cálculo): sequências com
  // todos os caracteres iguais, como 00000000000000, passam no cálculo do DV,
  // mas são rejeitadas por serem tipicamente valores de preenchimento.
  if (/^(.)\1+$/.test(normalized)) {
    return invalid('repeated_characters', 'CNPJ com todos os caracteres iguais não é aceito.');
  }

  const expected = computeCnpjCheckDigits(normalized.slice(0, BASE_LENGTH));
  if (normalized.slice(BASE_LENGTH) !== expected) {
    return invalid('invalid_check_digits', 'Dígitos verificadores não conferem.');
  }

  return {
    valid: true,
    normalized,
    formatted: format(normalized),
    kind: /^\d+$/.test(normalized) ? 'numeric' : 'alphanumeric',
  };
}

/** Atalho booleano para `validateCnpj(input).valid`. */
export function isValidCnpj(input: string): boolean {
  return validateCnpj(input).valid;
}

/**
 * Formata um CNPJ válido como `XX.XXX.XXX/XXXX-XX`.
 * Lança `ValidationError` se o CNPJ for inválido.
 */
export function formatCnpj(input: string): string {
  const result = validateCnpj(input);
  if (!result.valid) throw new ValidationError(result.message);
  return result.formatted;
}

function format(normalized: string): string {
  return `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 8)}/${normalized.slice(8, 12)}-${normalized.slice(12)}`;
}

function invalid(reason: CnpjInvalidReason, message: string): CnpjValidationResult {
  return { valid: false, reason, message };
}

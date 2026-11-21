import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/core/errors.js';
import {
  computeCnpjCheckDigits,
  formatCnpj,
  hasValidCnpjCheckDigits,
  isValidCnpj,
  normalizeCnpj,
  validateCnpj,
  validateCnpjSyntax,
} from '../../../src/modules/cnpj/index.js';
import fixtures from '../../fixtures/cnpj/cases.json' with { type: 'json' };

/**
 * Implementação de referência independente do cálculo numérico tradicional
 * (pesos explícitos), usada para conferir a implementação genérica.
 */
function legacyNumericDv(base12: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv = (digits: number[], weights: number[]) => {
    const r = digits.reduce((acc, d, i) => acc + d * (weights[i] ?? 0), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const digits = [...base12].map(Number);
  const d1 = dv(digits, w1);
  const d2 = dv([...digits, d1], w2);
  return `${d1}${d2}`;
}

describe('exemplo oficial do manual Serpro (12.ABC.345/01DE-35)', () => {
  it('calcula os DVs 3 e 5', () => {
    expect(computeCnpjCheckDigits('12ABC34501DE')).toBe('35');
  });

  it('valida e formata', () => {
    expect(validateCnpj('12.ABC.345/01DE-35')).toEqual({
      valid: true,
      normalized: '12ABC34501DE35',
      formatted: '12.ABC.345/01DE-35',
      kind: 'alphanumeric',
    });
  });
});

describe('validateCnpj com fixtures', () => {
  it.each(fixtures.valid)('aceita $input ($note)', ({ input, normalized, kind }) => {
    const result = validateCnpj(input);
    expect(result).toMatchObject({ valid: true, normalized, kind });
  });

  it.each(fixtures.invalid)('rejeita $input com $reason', ({ input, reason }) => {
    const result = validateCnpj(input);
    expect(result).toMatchObject({ valid: false, reason });
  });
});

describe('equivalência com o cálculo numérico tradicional', () => {
  it('coincide em 2000 bases numéricas pseudoaleatórias', () => {
    let seed = 20261120;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed;
    };
    for (let i = 0; i < 2000; i++) {
      const base =
        String(next() % 10 ** 8).padStart(8, '0') + String(next() % 10 ** 4).padStart(4, '0');
      expect(computeCnpjCheckDigits(base)).toBe(legacyNumericDv(base));
    }
  });
});

describe('normalizeCnpj', () => {
  it('remove pontuação e espaços e converte para maiúsculas', () => {
    expect(normalizeCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
  });
});

describe('computeCnpjCheckDigits', () => {
  it('aceita base com pontuação', () => {
    expect(computeCnpjCheckDigits('11.222.333/0001')).toBe('81');
  });

  it.each(['', '123', '1234567890123', '12ABC34501D!'])(
    'lança ValidationError para base inválida %j',
    (base) => {
      expect(() => computeCnpjCheckDigits(base)).toThrow(ValidationError);
    },
  );
});

describe('isValidCnpj e formatCnpj', () => {
  it('isValidCnpj devolve booleano', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
  });

  it('formatCnpj formata CNPJ válido', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('formatCnpj lança ValidationError para CNPJ inválido', () => {
    expect(() => formatCnpj('11222333000182')).toThrow(ValidationError);
  });
});

describe('etapas separadas: sintaxe, dígitos verificadores, normalização e formatação', () => {
  it('validateCnpjSyntax aceita sintaxe correta mesmo com DV errado', () => {
    expect(validateCnpjSyntax('12.ABC.345/01DE-36')).toEqual({
      valid: true,
      normalized: '12ABC34501DE36',
      kind: 'alphanumeric',
    });
    expect(validateCnpjSyntax('11222333000182')).toMatchObject({ valid: true, kind: 'numeric' });
  });

  it.each([
    ['', 'empty'],
    ['123', 'invalid_length'],
    ['12ABC34501DE3A', 'invalid_characters'],
    ['00000000000000', 'repeated_characters'],
  ])('validateCnpjSyntax(%j) → %s', (input, reason) => {
    expect(validateCnpjSyntax(input)).toMatchObject({ valid: false, reason });
  });

  it('hasValidCnpjCheckDigits só olha os dígitos verificadores', () => {
    expect(hasValidCnpjCheckDigits('12.ABC.345/01DE-35')).toBe(true);
    expect(hasValidCnpjCheckDigits('12ABC34501DE36')).toBe(false);
    expect(hasValidCnpjCheckDigits('11222333000181')).toBe(true);
    // sintaxe inválida nunca tem DV válido
    expect(hasValidCnpjCheckDigits('123')).toBe(false);
  });

  it('validateCnpj continua combinando as duas etapas', () => {
    expect(validateCnpj('12ABC34501DE36')).toMatchObject({
      valid: false,
      reason: 'invalid_check_digits',
    });
    expect(validateCnpj('123')).toMatchObject({ valid: false, reason: 'invalid_length' });
  });

  it('formatCnpj com checkDigits: false formata quem tem só a sintaxe certa', () => {
    expect(formatCnpj('12abc34501de36', { checkDigits: false })).toBe('12.ABC.345/01DE-36');
    expect(() => formatCnpj('12abc34501de36')).toThrow(ValidationError);
    expect(() => formatCnpj('123', { checkDigits: false })).toThrow(ValidationError);
  });
});

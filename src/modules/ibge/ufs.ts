import { ValidationError } from '../../core/errors.js';

/**
 * Siglas → códigos IBGE das 27 UFs. Usado só para validar a entrada e montar a
 * URL com o código numérico (formato dos exemplos da documentação oficial).
 * Um teste compara esta tabela com a resposta real gravada de `/estados`.
 */
export const UF_CODES: Readonly<Record<string, string>> = Object.freeze({
  RO: '11',
  AC: '12',
  AM: '13',
  RR: '14',
  PA: '15',
  AP: '16',
  TO: '17',
  MA: '21',
  PI: '22',
  CE: '23',
  RN: '24',
  PB: '25',
  PE: '26',
  AL: '27',
  SE: '28',
  BA: '29',
  MG: '31',
  ES: '32',
  RJ: '33',
  SP: '35',
  PR: '41',
  SC: '42',
  RS: '43',
  MS: '50',
  MT: '51',
  GO: '52',
  DF: '53',
});

const CODE_TO_SIGLA: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(UF_CODES).map(([sigla, code]) => [code, sigla])),
);

/**
 * Aceita sigla (`'sp'`, `'SP'`) ou código IBGE (`35`, `'35'`) e devolve ambos.
 * Lança `ValidationError` se a UF não existir.
 */
export function resolveUf(input: string | number): { sigla: string; codigoIbge: string } {
  const value = String(input).trim().toUpperCase();
  const fromSigla = UF_CODES[value];
  if (fromSigla !== undefined) return { sigla: value, codigoIbge: fromSigla };
  const fromCode = CODE_TO_SIGLA[value];
  if (fromCode !== undefined) return { sigla: fromCode, codigoIbge: value };
  throw new ValidationError(
    `UF inválida: ${String(input).slice(0, 20)}. Use a sigla (ex.: SP) ou o código IBGE (ex.: 35).`,
  );
}

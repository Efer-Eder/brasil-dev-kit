import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProviderUnavailableError, ValidationError } from '../../../src/core/errors.js';
import type { FetchLike } from '../../../src/core/http.js';
import {
  createBancosClient,
  normalizeCodigoBanco,
  normalizeIspb,
} from '../../../src/modules/bancos/index.js';
import { BCB_STR_URL, parseParticipantesStr } from '../../../src/providers/bcb.js';

const CSV = readFileSync(
  new URL('../../fixtures/bancos/bcb/ParticipantesSTR.csv', import.meta.url),
  'utf8',
);
const HEADER =
  'ISPB,Nome_Reduzido,Número_Código,Participa_da_Compe,Acesso_Principal,Nome_Extenso,Início_da_Operação';

function csvFetch(body: string, status = 200) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    return new Response(body, { status, headers: { 'content-type': 'application/octet-stream' } });
  };
  return { fetch, calls };
}

describe('parseParticipantesStr (arquivo real gravado em 26/11/2026)', () => {
  const bancos = parseParticipantesStr(CSV);

  it('lê todas as 473 linhas, com ISPB único', () => {
    expect(bancos).toHaveLength(473);
    expect(new Set(bancos.map((b) => b.ispb)).size).toBe(473);
  });

  it('códigos são únicos e têm 3 dígitos', () => {
    const codigos = bancos.flatMap((b) => (b.codigo === null ? [] : [b.codigo]));
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos.every((c) => /^\d{3}$/.test(c))).toBe(true);
  });

  it('normaliza uma linha simples', () => {
    expect(bancos.find((b) => b.codigo === '001')).toEqual({
      ispb: '00000000',
      codigo: '001',
      nomeReduzido: 'BCO DO BRASIL S.A.',
      nome: 'Banco do Brasil S.A.',
      participaCompe: true,
      acessoPrincipal: 'RSFN',
      inicioOperacao: '2002-04-22',
      fonte: { provedor: 'bcb', servicoOrigem: 'participantes-str', url: BCB_STR_URL },
    });
  });

  it('lê campo entre aspas com vírgula', () => {
    expect(bancos.find((b) => b.ispb === '00122327')?.nome).toBe(
      'SANTINVEST S.A. - CREDITO, FINANCIAMENTO E INVESTIMENTOS',
    );
  });

  it('n/a e 0 viram codigo null (Selic, câmaras da B3)', () => {
    expect(bancos.find((b) => b.ispb === '00038121')?.codigo).toBeNull();
    expect(bancos.find((b) => b.ispb === '28719664')?.codigo).toBeNull();
    expect(bancos.filter((b) => b.codigo === null)).toHaveLength(10);
  });

  it('aceita CRLF e arquivo sem BOM', () => {
    const crlf = `${HEADER}\r\n00000000,BCO DO BRASIL S.A.,001,Sim,RSFN,Banco do Brasil S.A.,22/04/2002\r\n`;
    expect(parseParticipantesStr(crlf)).toHaveLength(1);
  });

  it.each([
    ['cabeçalho mudou', 'ISPB,Nome\n00000000,X'],
    ['só cabeçalho', HEADER],
    ['coluna a menos', `${HEADER}\n00000000,X,001,Sim,RSFN,Y`],
    ['ISPB inválido', `${HEADER}\n123,X,001,Sim,RSFN,Y,22/04/2002`],
    ['código inválido', `${HEADER}\n00000000,X,ABC,Sim,RSFN,Y,22/04/2002`],
    ['Compe inválido', `${HEADER}\n00000000,X,001,Talvez,RSFN,Y,22/04/2002`],
    ['data inválida', `${HEADER}\n00000000,X,001,Sim,RSFN,Y,2002-04-22`],
    ['aspas sem fechar', `${HEADER}\n00000000,"X,001,Sim,RSFN,Y,22/04/2002`],
    ['HTML no lugar do CSV', '<html><body>Objeto não encontrado</body></html>'],
  ])('formato inesperado (%s) vira ProviderUnavailableError', (_name, body) => {
    expect(() => parseParticipantesStr(body)).toThrow(ProviderUnavailableError);
  });
});

describe('normalizeCodigoBanco / normalizeIspb', () => {
  it.each([
    ['1', '001'],
    [1, '001'],
    [' 260 ', '260'],
    ['001', '001'],
  ] as const)('código %j → %s', (input, expected) => {
    expect(normalizeCodigoBanco(input)).toBe(expected);
  });

  it.each(['', '0', '000', '1234', 'abc', -1, 1.5])('rejeita código %j', (input) => {
    expect(() => normalizeCodigoBanco(input)).toThrow(ValidationError);
  });

  it.each([
    ['0', '00000000'],
    [360305, '00360305'],
    ['18236120', '18236120'],
  ] as const)('ISPB %j → %s', (input, expected) => {
    expect(normalizeIspb(input)).toBe(expected);
  });

  it.each(['', '123456789', 'x', -1])('rejeita ISPB %j', (input) => {
    expect(() => normalizeIspb(input)).toThrow(ValidationError);
  });

  it('limita a entrada repetida na mensagem', () => {
    expect(() => normalizeCodigoBanco('9'.repeat(500))).toThrow(/recebido: 9{20}$/);
  });
});

describe('createBancosClient', () => {
  it('consulta por código e por ISPB com uma leitura só (cache padrão)', async () => {
    const { fetch, calls } = csvFetch(CSV);
    const bancos = createBancosClient({ fetch });

    expect((await bancos.getByCodigo(260))?.nomeReduzido).toBe('NU PAGAMENTOS - IP');
    expect((await bancos.getByIspb('60701190'))?.codigo).toBe('341');
    expect(await bancos.getByCodigo('999')).toBeNull();
    expect(await bancos.getByIspb(99999999)).toBeNull();
    expect(await bancos.list()).toHaveLength(473);
    expect(calls).toEqual([BCB_STR_URL]);
  });

  it('cacheTtlMs: 0 desliga o cache', async () => {
    const { fetch, calls } = csvFetch(CSV);
    const bancos = createBancosClient({ fetch, cacheTtlMs: 0 });
    await bancos.list();
    await bancos.list();
    expect(calls).toHaveLength(2);
  });

  it('rejeita cacheTtlMs negativo', () => {
    expect(() => createBancosClient({ cacheTtlMs: -1 })).toThrow(ValidationError);
  });

  it('valida a entrada antes de usar a rede', async () => {
    const { fetch, calls } = csvFetch(CSV);
    const bancos = createBancosClient({ fetch });
    await expect(bancos.getByCodigo('abc')).rejects.toThrow(ValidationError);
    await expect(bancos.getByIspb('123456789')).rejects.toThrow(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('404 do Banco Central vira erro com provider bcb', async () => {
    const { fetch } = csvFetch('<html>Objeto não encontrado</html>', 404);
    const bancos = createBancosClient({ fetch, retry: false });
    await expect(bancos.list()).rejects.toMatchObject({ provider: 'bcb' });
  });

  it('cópias independentes: alterar o resultado não afeta a próxima consulta', async () => {
    const { fetch } = csvFetch(CSV);
    const bancos = createBancosClient({ fetch });
    const primeiro = await bancos.getByCodigo('001');
    if (primeiro) primeiro.nome = 'alterado';
    expect((await bancos.getByCodigo('001'))?.nome).toBe('Banco do Brasil S.A.');
  });
});

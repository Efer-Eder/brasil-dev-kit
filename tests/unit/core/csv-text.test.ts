import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../src/core/csv.js';
import { ProviderUnavailableError } from '../../../src/core/errors.js';
import { createHttpClient, type FetchLike } from '../../../src/core/http.js';

describe('parseCsv', () => {
  it('lê campos simples, entre aspas e com aspas duplicadas', () => {
    expect(parseCsv('a,b,c\n1,"x, y","diz ""oi"""\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'diz "oi"'],
    ]);
  });

  it('aceita CRLF, separador customizado e ignora linhas vazias', () => {
    expect(parseCsv('a;b\r\n\r\n1;2\r\n', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('mantém campos vazios e a última linha sem quebra', () => {
    expect(parseCsv('a,,c\n,2,')).toEqual([
      ['a', '', 'c'],
      ['', '2', ''],
    ]);
  });

  it('aceita quebra de linha dentro de aspas', () => {
    expect(parseCsv('"linha 1\nlinha 2",x')).toEqual([['linha 1\nlinha 2', 'x']]);
  });

  it('falha com aspas sem fechamento', () => {
    expect(() => parseCsv('"aberta,x')).toThrow(/aspas/);
  });
});

describe('createHttpClient().getText', () => {
  const textFetch = (body: string, status = 200): FetchLike & { accept: string[] } => {
    const accept: string[] = [];
    const fetch = (async (_url, init) => {
      accept.push(String((init.headers as Record<string, string>).accept));
      return new Response(body, { status });
    }) as FetchLike & { accept: string[] };
    fetch.accept = accept;
    return fetch;
  };

  it('devolve o texto sem BOM e pede CSV/texto', async () => {
    const fetch = textFetch(`${String.fromCharCode(0xfeff)}a,b\n1,2\n`);
    const http = createHttpClient({ fetch });
    expect(await http.getText('https://exemplo.test/x.csv')).toBe('a,b\n1,2\n');
    expect(fetch.accept[0]).toMatch(/^text\/csv/);
  });

  it('erros HTTP seguem o mapeamento do getJson', async () => {
    const http = createHttpClient({ fetch: textFetch('falhou', 503), retry: false, provider: 'p' });
    await expect(http.getText('https://exemplo.test/x.csv')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('cache separa texto de JSON para a mesma URL', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls++;
      return new Response('{"a":1}');
    };
    const http = createHttpClient({ fetch, cache: { ttlMs: 60_000 } });
    expect(await http.getText('https://exemplo.test/d')).toBe('{"a":1}');
    expect(await http.getJson('https://exemplo.test/d')).toEqual({ a: 1 });
    expect(await http.getText('https://exemplo.test/d')).toBe('{"a":1}');
    expect(calls).toBe(2);
  });
});

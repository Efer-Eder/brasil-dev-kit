import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { DEFAULT_CONFIG, loadConfig, type ServerConfig } from '../../../server/src/config.js';
import type { FetchLike } from '../../../src/core/http.js';

const fixture = (path: string) =>
  readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8');

const VIACEP = (cep: string) => `https://viacep.com.br/ws/${cep}/json/`;
const BRASILAPI = (cep: string) => `https://brasilapi.com.br/api/cep/v1/${cep}`;
const IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades/';

type Route = { body: string; status?: number } | ((init: RequestInit) => Promise<Response>);

function routedFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error(`URL não mapeada: ${url}`);
    if (typeof route === 'function') return route(init);
    return new Response(route.body, { status: route.status ?? 200 });
  };
  return { fetch, calls };
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function start(fetch: FetchLike, overrides: Partial<ServerConfig> = {}) {
  const app = createApp({ config: { ...DEFAULT_CONFIG, ...overrides }, fetch });
  const server = createServer((req, res) => void app.handle(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const get = async (path: string, init?: RequestInit) => {
    const res = await globalThis.fetch(`http://127.0.0.1:${port}${path}`, init);
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
  };
  return { app, get };
}

describe('API — CEP', () => {
  it('consulta, normaliza e depois serve do cache (sem nova chamada externa)', async () => {
    const { fetch, calls } = routedFetch({
      [VIACEP('01310100')]: { body: fixture('cep/viacep/01310100.json') },
    });
    const { get } = await start(fetch);

    const first = await get('/v1/cep/01310-100');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(first.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(first.headers.get('access-control-allow-origin')).toBe('*');
    expect(first.body).toMatchObject({ cep: '01310100', uf: 'SP', fonte: { provedor: 'viacep' } });

    const second = await get('/v1/cep/01310100');
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(second.body).toEqual(first.body);
    expect(calls).toHaveLength(1);
  });

  it('CEP inexistente → 404 e também fica em cache (cache negativo)', async () => {
    const { fetch, calls } = routedFetch({
      [VIACEP('99999999')]: { body: fixture('cep/viacep/99999999-nao-encontrado.json') },
    });
    const { get } = await start(fetch);
    expect((await get('/v1/cep/99999999')).status).toBe(404);
    const again = await get('/v1/cep/99999999');
    expect(again.status).toBe(404);
    expect(again.headers.get('x-cache')).toBe('HIT');
    expect(again.body).toEqual({
      erro: { codigo: 'NOT_FOUND', mensagem: 'CEP 99999999 não encontrado.' },
    });
    expect(calls).toHaveLength(1);
  });

  it('formato inválido → 400 sem chamada externa', async () => {
    const { fetch, calls } = routedFetch({});
    const { get } = await start(fetch);
    const res = await get('/v1/cep/123');
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(calls).toHaveLength(0);
  });

  it('pedidos simultâneos do mesmo CEP geram uma única consulta externa', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { fetch, calls } = routedFetch({
      [VIACEP('01310100')]: async () => {
        await gate;
        return new Response(fixture('cep/viacep/01310100.json'));
      },
    });
    const { get } = await start(fetch);
    const pending = Promise.all([1, 2, 3, 4, 5].map(() => get('/v1/cep/01310100')));
    setTimeout(release, 20);
    const results = await pending;
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(calls).toHaveLength(1);
  });

  it('provedores fora do ar → 502 com Retry-After, e o erro não fica em cache', async () => {
    const { fetch, calls } = routedFetch({
      [VIACEP('01310100')]: { body: '', status: 503 },
      [BRASILAPI('01310100')]: { body: '', status: 500 },
    });
    const { get } = await start(fetch);
    const res = await get('/v1/cep/01310100');
    expect(res.status).toBe(502);
    expect(res.headers.get('retry-after')).toBe('30');
    await get('/v1/cep/01310100');
    expect(calls).toHaveLength(4);
  });

  it('provedor lento → 504 depois do timeout configurado', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_r, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const { fetch } = routedFetch({ [VIACEP('01310100')]: hang, [BRASILAPI('01310100')]: hang });
    const { get } = await start(fetch, { upstreamTimeoutMs: 50 });
    const res = await get('/v1/cep/01310100');
    // Todos os provedores estouraram o tempo → 504.
    expect(res.status).toBe(504);
  });

  it('fila do provedor cheia → 503 BUSY com Retry-After', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_r, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const routes: Record<string, Route> = {};
    for (const cep of ['01000001', '01000002', '01000003']) {
      routes[VIACEP(cep)] = hang;
      routes[BRASILAPI(cep)] = hang;
    }
    const { fetch } = routedFetch(routes);
    const { get } = await start(fetch, {
      upstreamTimeoutMs: 300,
      upstream: { maxConcurrent: 1, maxQueue: 0, ratePerSecond: 100, burst: 100 },
    });
    const [, busy] = await Promise.all([
      get('/v1/cep/01000001'),
      (async () => {
        await new Promise((r) => setTimeout(r, 30));
        return get('/v1/cep/01000002');
      })(),
    ]);
    expect(busy.status).toBe(503);
    expect(busy.body).toMatchObject({ erro: { codigo: 'BUSY' } });
    expect(busy.headers.get('retry-after')).toBe('5');
  });
});

describe('API — IBGE', () => {
  it('lista UFs e municípios, com cache', async () => {
    const { fetch, calls } = routedFetch({
      [`${IBGE}estados?orderBy=nome`]: { body: fixture('ibge/api/estados-orderby-nome.json') },
      [`${IBGE}estados/14/municipios?orderBy=nome`]: {
        body: fixture('ibge/api/municipios-14-orderby-nome.json'),
      },
    });
    const { get } = await start(fetch);

    const ufs = await get('/v1/ibge/ufs');
    expect(ufs.status).toBe(200);
    expect(ufs.body).toHaveLength(27);

    const rr = await get('/v1/ibge/ufs/rr/municipios');
    const rrByCode = await get('/v1/ibge/ufs/14/municipios');
    expect(rr.body).toHaveLength(15);
    expect(rrByCode.headers.get('x-cache')).toBe('HIT');
    expect(calls).toHaveLength(2);
  });

  it('UF inválida → 400', async () => {
    const { get } = await start(routedFetch({}).fetch);
    expect((await get('/v1/ibge/ufs/XX/municipios')).status).toBe(400);
  });
});

describe('API — CNPJ, rotas e protocolo', () => {
  it('valida CNPJ localmente', async () => {
    const { get } = await start(routedFetch({}).fetch);
    const ok = await get('/v1/cnpj/12ABC34501DE35');
    expect(ok.body).toMatchObject({
      valid: true,
      formatted: '12.ABC.345/01DE-35',
      kind: 'alphanumeric',
    });
    const bad = await get('/v1/cnpj/11222333000182');
    expect(bad.body).toMatchObject({ valid: false, reason: 'invalid_check_digits' });
  });

  it('índice, health, 404, 405, OPTIONS e HEAD', async () => {
    const { get } = await start(routedFetch({}).fetch);
    expect((await get('/')).body).toMatchObject({ nome: 'Brasil Dev Kit API' });
    expect((await get('/v1/health')).body).toEqual({ status: 'ok', versao: '0.1.0' });
    expect((await get('/v1/nada')).status).toBe(404);
    expect((await get('/v2/cep/01310100')).status).toBe(404);
    const post = await get('/v1/cnpj/11222333000181', { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    const options = await get('/v1/cep/01310100', { method: 'OPTIONS' });
    expect(options.status).toBe(204);
    const head = await get('/v1/health', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });

  it('URL com codificação inválida → 400', async () => {
    const { get } = await start(routedFetch({}).fetch);
    expect((await get('/v1/cep/%E0%A4%A')).status).toBe(400);
  });

  it('acima do limite de requisições simultâneas → 503 imediato', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { fetch } = routedFetch({
      [VIACEP('01310100')]: async () => {
        await gate;
        return new Response(fixture('cep/viacep/01310100.json'));
      },
    });
    const { get } = await start(fetch, { maxInFlight: 1 });
    const slow = get('/v1/cep/01310100');
    await new Promise((r) => setTimeout(r, 20));
    const rejected = await get('/v1/health');
    expect(rejected.status).toBe(503);
    expect(rejected.headers.get('retry-after')).toBe('2');
    release();
    expect((await slow).status).toBe(200);
  });
});

describe('loadConfig', () => {
  it('usa os padrões e aceita ajustes por ambiente', () => {
    expect(loadConfig({})).toEqual(DEFAULT_CONFIG);
    const config = loadConfig({ PORT: '9000', HOST: '0.0.0.0', UPSTREAM_MAX_QUEUE: '0' });
    expect(config.port).toBe(9000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.upstream.maxQueue).toBe(0);
  });

  it('rejeita valores inválidos', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ MAX_IN_FLIGHT: '0' })).toThrow(/MAX_IN_FLIGHT/);
  });
});

describe('API — feriados', () => {
  it('2026 vem da portaria, sem chamada externa', async () => {
    const { fetch, calls } = routedFetch({});
    const { get } = await start(fetch);
    const res = await get('/v1/feriados/2026');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(res.body).toMatchObject({ ano: 2026, origem: 'portaria' });
    expect((res.body as { datas: unknown[] }).datas).toHaveLength(19);
    expect(calls).toHaveLength(0);
  });

  it('ano sem portaria vem da lei, com aviso', async () => {
    const { get } = await start(routedFetch({}).fetch);
    const res = await get('/v1/feriados/2027');
    expect(res.body).toMatchObject({ ano: 2027, origem: 'lei' });
  });

  it.each(['abc', '20266', '2023', '2100'])('ano inválido %j → 400', async (ano) => {
    const { get } = await start(routedFetch({}).fetch);
    const res = await get(`/v1/feriados/${ano}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ erro: { codigo: 'VALIDATION_ERROR' } });
  });
});

describe('API — resumo do GitHub', () => {
  const GH = 'https://api.github.com/repos/Efer-Eder/brasil-dev-kit';
  const ghRoutes = (repoStatus = 200): Record<string, Route> => ({
    [GH]: {
      status: repoStatus,
      body: JSON.stringify({
        full_name: 'Efer-Eder/brasil-dev-kit',
        html_url: 'https://github.com/Efer-Eder/brasil-dev-kit',
        description: 'SDK',
        license: { spdx_id: 'MIT' },
        language: 'TypeScript',
        created_at: '2026-11-20T21:41:45Z',
        pushed_at: '2026-11-20T22:33:00Z',
        stargazers_count: 3,
        forks_count: 1,
        subscribers_count: 2,
        open_issues_count: 3,
      }),
    },
    [`${GH}/contributors?per_page=20`]: {
      body: JSON.stringify([
        {
          login: 'Efer-Eder',
          html_url: 'https://github.com/Efer-Eder',
          contributions: 36,
          type: 'User',
        },
        {
          login: 'dependabot[bot]',
          html_url: 'https://github.com/apps/dependabot',
          contributions: 2,
          type: 'Bot',
        },
      ]),
    },
    [`${GH}/commits?per_page=5`]: {
      body: JSON.stringify([
        {
          sha: 'caa854c951b53ec846c4798251bcc83b8edff51e',
          html_url: 'https://github.com/Efer-Eder/brasil-dev-kit/commit/caa854c',
          commit: {
            message: 'docs(feriados): document sources\n\ncorpo',
            author: { name: 'Efer', date: '2026-11-20T22:32:56Z' },
          },
          author: { login: 'Efer-Eder' },
        },
      ]),
    },
    [`${GH}/issues?state=open&per_page=100`]: {
      body: JSON.stringify([
        { number: 3 },
        { number: 2, pull_request: {} },
        { number: 1, pull_request: {} },
      ]),
    },
    [`${GH}/actions/workflows/ci.yml/runs?branch=main&per_page=1`]: {
      body: JSON.stringify({
        workflow_runs: [
          {
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com/x/runs/1',
            created_at: '2026-11-20T22:33:02Z',
            head_sha: 'caa854c951b',
          },
        ],
      }),
    },
  });

  it('resume repositório, separa issues de PRs, ignora bots e faz cache', async () => {
    const { fetch, calls } = routedFetch(ghRoutes());
    const { get } = await start(fetch);
    const first = await get('/v1/projeto/github');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(first.body).toMatchObject({
      repositorio: { estrelas: 3, forks: 1, issuesAbertas: 1, prsAbertos: 2, licenca: 'MIT' },
      ci: { conclusao: 'success', commit: 'caa854c' },
      contribuidores: [{ login: 'Efer-Eder', contribuicoes: 36 }],
      totalCommits: 36,
      commits: [
        { sha: 'caa854c', mensagem: 'docs(feriados): document sources', autor: 'Efer-Eder' },
      ],
      desatualizado: false,
    });
    const second = await get('/v1/projeto/github');
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(calls).toHaveLength(5);
  });

  it('GitHub fora do ar sem dado anterior → 502', async () => {
    const { fetch } = routedFetch(ghRoutes(503));
    const { get } = await start(fetch);
    expect((await get('/v1/projeto/github')).status).toBe(502);
  });

  it('GitHub fora do ar com dado anterior → serve o último, marcado como desatualizado', async () => {
    let now = 0;
    const routes = ghRoutes();
    const { fetch } = routedFetch(routes);
    const app = createApp({ config: DEFAULT_CONFIG, fetch, now: () => now });
    const server = createServer((req, res) => void app.handle(req, res));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/v1/projeto/github`;
    expect((await globalThis.fetch(url)).status).toBe(200);
    now = DEFAULT_CONFIG.github.ttlMs + 1;
    routes[GH] = { status: 500, body: '' };
    const stale = await globalThis.fetch(url);
    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-cache')).toBe('STALE');
    expect(await stale.json()).toMatchObject({ desatualizado: true, repositorio: { estrelas: 3 } });
  });
});

describe('API — OpenAPI', () => {
  it('serve a especificação com todas as rotas do índice', async () => {
    const { get } = await start(routedFetch({}).fetch);
    const spec = (await get('/v1/openapi.json')) as {
      status: number;
      body: { openapi: string; info: { version: string }; paths: Record<string, unknown> };
    };
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    const index = (await get('/')).body as { endpoints: Record<string, string>; versao: string };
    expect(spec.body.info.version).toBe(index.versao);
    for (const route of Object.values(index.endpoints)) {
      expect(spec.body.paths, `rota ${route} documentada`).toHaveProperty([route]);
    }
  });

  it('mensagem de erro não repete entrada longa', async () => {
    const { get } = await start(routedFetch({}).fetch);
    const res = await get(`/v1/ibge/ufs/${'x'.repeat(500)}/municipios`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body).length).toBeLessThan(200);
  });
});

describe('API — bancos', () => {
  const STR = 'https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv';

  it('lista, busca por código e ISPB com uma leitura do arquivo do BC', async () => {
    const { fetch, calls } = routedFetch({
      [STR]: { body: fixture('bancos/bcb/ParticipantesSTR.csv') },
    });
    const { get } = await start(fetch);

    const lista = await get('/v1/bancos');
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(473);

    const nu = await get('/v1/bancos/260');
    expect(nu.body).toMatchObject({ ispb: '18236120', codigo: '260', fonte: { provedor: 'bcb' } });
    expect((await get('/v1/bancos/1')).body).toMatchObject({ codigo: '001' });
    expect((await get('/v1/bancos/ispb/60701190')).body).toMatchObject({ codigo: '341' });
    expect(calls).toEqual([STR]);
  });

  it('não encontrado → 404; formato inválido → 400 sem rede', async () => {
    const { fetch, calls } = routedFetch({
      [STR]: { body: fixture('bancos/bcb/ParticipantesSTR.csv') },
    });
    const { get } = await start(fetch);
    expect((await get('/v1/bancos/999')).status).toBe(404);
    expect((await get('/v1/bancos/ispb/99999999')).status).toBe(404);
    expect(calls).toHaveLength(1);

    const sem = await start(routedFetch({}).fetch);
    expect((await sem.get('/v1/bancos/abcd')).status).toBe(400);
    expect((await sem.get('/v1/bancos/ispb/123456789')).status).toBe(400);
    expect((await sem.get('/v1/bancos/ispb/1/x')).status).toBe(404);
  });

  it('Banco Central fora do ar → 502', async () => {
    const { get } = await start(routedFetch({ [STR]: { body: 'erro', status: 503 } }).fetch);
    expect((await get('/v1/bancos/001')).status).toBe(502);
  });
});

describe('API — DDD', () => {
  it('lista, consulta DDD e município sem chamada externa', async () => {
    const { fetch, calls } = routedFetch({});
    const { get } = await start(fetch);

    const lista = await get('/v1/ddd');
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(67);

    const df = await get('/v1/ddd/61');
    expect(df.body).toMatchObject({ ddd: '61', ufs: ['DF', 'GO'], fonte: { provedor: 'anatel' } });
    expect((await get('/v1/ddd/municipio/3550308')).body).toMatchObject({ ddd: '11' });
    expect(calls).toHaveLength(0);
  });

  it('sem uso → 404; formato inválido → 400', async () => {
    const { get } = await start(routedFetch({}).fetch);
    expect((await get('/v1/ddd/29')).status).toBe(404);
    expect((await get('/v1/ddd/municipio/9999999')).status).toBe(404);
    expect((await get('/v1/ddd/10')).status).toBe(400);
    expect((await get('/v1/ddd/municipio/123')).status).toBe(400);
  });
});

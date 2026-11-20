import {
  createHttpClient,
  type FetchLike,
  type HttpClient,
  ProviderUnavailableError,
} from '../../src/index.js';

/**
 * Resumo público do repositório no GitHub para o widget da página do projeto.
 *
 * Usa a API REST do GitHub sem token (limite de 60 req/h por IP). Cada
 * atualização faz 5 chamadas; com cache de 10 minutos são 30 por hora. Se o
 * GitHub falhar, o último resumo bom continua sendo servido com
 * `desatualizado: true`.
 */

export interface ResumoGithub {
  repositorio: {
    nome: string;
    url: string;
    descricao: string | null;
    licenca: string | null;
    linguagem: string | null;
    criadoEm: string;
    ultimoPush: string;
    estrelas: number;
    forks: number;
    observadores: number;
    issuesAbertas: number;
    prsAbertos: number;
  };
  ci: { status: string; conclusao: string | null; url: string; em: string; commit: string } | null;
  contribuidores: { login: string; url: string; contribuicoes: number }[];
  totalCommits: number;
  commits: { sha: string; mensagem: string; autor: string; data: string; url: string }[];
  atualizadoEm: string;
  desatualizado: boolean;
  fonte: 'api.github.com';
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function req(v: unknown, what: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new ProviderUnavailableError(`Resposta do GitHub sem ${what}`, { provider: 'github' });
  }
  return v;
}

function list(v: unknown): Json[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

export async function fetchResumoGithub(
  http: HttpClient,
  repo: string,
  now: () => number = Date.now,
): Promise<ResumoGithub> {
  const base = `repos/${repo}`;
  const [info, contributors, commits, issues, runs] = await Promise.all([
    http.getJson(base),
    http.getJson(`${base}/contributors`, { query: { per_page: 20 } }),
    http.getJson(`${base}/commits`, { query: { per_page: 5 } }),
    http.getJson(`${base}/issues`, { query: { state: 'open', per_page: 100 } }),
    http.getJson(`${base}/actions/workflows/ci.yml/runs`, {
      query: { branch: 'main', per_page: 1 },
    }),
  ]);
  if (!isObj(info)) {
    throw new ProviderUnavailableError('Resposta do GitHub para o repositório não é objeto', {
      provider: 'github',
    });
  }

  // A lista de issues do GitHub inclui pull requests (campo `pull_request`).
  const openItems = list(issues);
  const prsAbertos = openItems.filter((i) => i.pull_request !== undefined).length;
  const contribuidores = list(contributors)
    .filter((c) => c.type !== 'Bot')
    .map((c) => ({
      login: req(c.login, 'login'),
      url: req(c.html_url, 'url do contribuidor'),
      contribuicoes: num(c.contributions),
    }));

  const run = isObj(runs) ? list(runs.workflow_runs)[0] : undefined;
  const license = isObj(info.license) ? str(info.license.spdx_id) : null;

  return {
    repositorio: {
      nome: req(info.full_name, 'nome'),
      url: req(info.html_url, 'url'),
      descricao: str(info.description),
      licenca: license,
      linguagem: str(info.language),
      criadoEm: req(info.created_at, 'data de criação'),
      ultimoPush: req(info.pushed_at, 'data do último push'),
      estrelas: num(info.stargazers_count),
      forks: num(info.forks_count),
      observadores: num(info.subscribers_count),
      issuesAbertas: openItems.length - prsAbertos,
      prsAbertos,
    },
    ci: run
      ? {
          status: req(run.status, 'status do CI'),
          conclusao: str(run.conclusion),
          url: req(run.html_url, 'url do CI'),
          em: req(run.created_at, 'data do CI'),
          commit: req(run.head_sha, 'commit do CI').slice(0, 7),
        }
      : null,
    contribuidores,
    totalCommits: contribuidores.reduce((total, c) => total + c.contribuicoes, 0),
    commits: list(commits).map((c) => {
      const commit = isObj(c.commit) ? c.commit : {};
      const author = isObj(commit.author) ? commit.author : {};
      const login = isObj(c.author) ? str(c.author.login) : null;
      return {
        sha: req(c.sha, 'sha').slice(0, 7),
        mensagem: req(commit.message, 'mensagem').split('\n')[0] ?? '',
        autor: login ?? str(author.name) ?? 'desconhecido',
        data: req(author.date, 'data do commit'),
        url: req(c.html_url, 'url do commit'),
      };
    }),
    atualizadoEm: new Date(now()).toISOString(),
    desatualizado: false,
    fonte: 'api.github.com',
  };
}

export interface GithubCacheOptions {
  repo: string;
  ttlMs: number;
  fetch: FetchLike;
  userAgent: string;
  timeoutMs: number;
  now?: () => number;
}

/**
 * Cache com uma única atualização por vez e fallback para o último dado bom.
 */
export function createGithubCache(options: GithubCacheOptions) {
  const now = options.now ?? Date.now;
  const http = createHttpClient({
    baseUrl: 'https://api.github.com/',
    provider: 'github',
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    userAgent: options.userAgent,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    // O fallback para o último dado bom já cobre falhas; repetir gastaria a cota sem token.
    retry: false,
  });
  let last: { value: ResumoGithub; at: number } | undefined;
  let inFlight: Promise<ResumoGithub> | undefined;

  return {
    async get(): Promise<{ value: ResumoGithub; cache: 'HIT' | 'MISS' | 'STALE' }> {
      if (last && now() - last.at < options.ttlMs) return { value: last.value, cache: 'HIT' };
      inFlight ??= fetchResumoGithub(http, options.repo, now).finally(() => {
        inFlight = undefined;
      });
      try {
        const value = await inFlight;
        last = { value, at: now() };
        return { value, cache: 'MISS' };
      } catch (error) {
        if (last) {
          // Evita martelar o GitHub: tenta de novo só depois de mais um TTL.
          last = { value: { ...last.value, desatualizado: true }, at: now() };
          return { value: last.value, cache: 'STALE' };
        }
        throw error;
      }
    },
  };
}

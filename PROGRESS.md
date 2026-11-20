# Progresso

## 2026-11-20 — Etapa 7: README novo e GIFs

- README pt-BR e en-US redesenhados: banner animado, badges (CI, status da API,
  licença, TypeScript, Node, estrelas), navegação, demos em GIF, tabela de
  módulos com a fonte de cada dado, API, erros tipados e como rodar.
- GIFs (banner, terminal e SDK, um por idioma) gerados por
  `scripts/readme-gifs/make_gifs.py` (Pillow + ffmpeg) com saídas reais da API e
  do SDK; 548 KB no total. Conferidos renderizando no GitHub.
- Site do repositório no GitHub aponta para a página do projeto.

## 2026-11-20 — Etapa 6: página do projeto em efer.online

**Status:** publicada em https://efer.online/projeto/brasil-dev-kit/.

### Feito

- `site/index.html`: página no design system do efer.online (Studio Graphite),
  com o mascote Ponto, playground ao vivo da API (CEP, municípios, feriados,
  CNPJ), fontes de cada dado, limites medidos, estado do projeto e FAQ.
- Widget do GitHub (estrelas, forks, issues, PRs, commits, contribuidores, CI e
  últimos commits) via `GET /v1/projeto/github`: a API consulta o GitHub com
  cache de 10 minutos, então a página se atualiza sozinha, sem deploy.
- Nginx: `/projeto/brasil-dev-kit/` servido de `/var/www/brasil-dev-kit/`
  pelo snippet do projeto; deploy instala a página com backup.

### Verificação

- 198 testes; lint (inclusive acessibilidade do HTML) sem avisos.
- Preview local em 1440 px e 375 px sem rolagem horizontal; público com console
  limpo, playground 200 e widget refletindo o push mais recente.
- Rotas dos outros projetos da VPS iguais antes e depois.

### Próximo passo objetivo

Retries com backoff e cache na biblioteca; depois a fachada `createBrasilDevKit()`.

## 2026-11-20 — Etapa 5: feriados nacionais

**Status:** implementado (biblioteca e API).

### Feito

- Fontes conferidas: Leis nº 662/1949 (red. 10.607/2002), 6.802/1980, 14.759/2023 e
  9.093/1995 no Planalto; Portarias MGI nº 9.783/2024 (calendário 2025) e
  nº 11.460/2025 (calendário 2026) na divulgação oficial do gov.br.
- `src/modules/feriados`: calendário por portaria (2025, 2026) ou por lei (2024 e
  2027–2099, com aviso), Páscoa pelo algoritmo de Meeus, `isFeriadoNacional` e
  `buscarDataNacional`. Rota `GET /v1/feriados/{ano}` na API.
- Testes cruzam lei × portaria × Páscoa calculada; `docs/feriados.md`;
  `examples/node/feriados.mjs`.

### Decisões

- Paixão de Cristo segue a portaria (feriado nacional) e explica em `observacao`
  que a Lei nº 9.093/1995 a trata como feriado religioso municipal.
- Pontos facultativos só entram com portaria publicada e conferida; nada é
  projetado para anos sem portaria.

### Próximo passo objetivo

Página do projeto em efer.online e, depois, retries/cache na biblioteca e a
fachada `createBrasilDevKit()`.

## 2026-11-20 — Etapa 4: API pública em efer.online

**Status:** publicada e validada em `https://efer.online/api/brasil-dev-kit/`
(em desenvolvimento, sem SLA).

### Feito

- `server/`: API HTTP sem dependências (`node:http`) usando a própria biblioteca.
  Rotas `/v1/cep/{cep}`, `/v1/ibge/ufs`, `/v1/ibge/ufs/{uf}/municipios`,
  `/v1/cnpj/{cnpj}` e `/v1/health`. Cache TTL+LRU, junção de consultas
  simultâneas, porteiro por provedor (ritmo, concorrência e fila), limite de
  requisições simultâneas e erros JSON padronizados.
- `deploy/`: Dockerfile (node 24 alpine por digest, usuário sem privilégio),
  Compose com limites (0,5 vCPU, 256 MB, 64 pids, disco só leitura), Nginx com
  IP real via faixas oficiais do Cloudflare e 10 req/s por IP (rajada 30),
  `remote-install.sh` com backup/rollback e `deploy.ps1`.
- Documentação: `docs/api.md` (rotas, erros, cache e as contas de capacidade) e
  `docs/deploy.md` (publicar, reverter, operar).

### Verificação

- `pnpm run check`: 156 testes (25 novos do servidor), lint, typecheck e build OK.
- Na VPS (loopback, 0,5 vCPU): ~880 req/s com cache quente, p50 6 ms, sem erros;
  memória estável em ~83 MB.
- Público: todas as rotas responderam como esperado; 120 requisições em rajada de
  um IP → 72 × 200 e 48 × 429 (JSON com `Retry-After`); outro IP seguiu com 200.
- As 11 rotas públicas dos outros projetos da VPS responderam igual antes e depois.

### Incidente durante o deploy (corrigido)

A primeira tentativa de instalar a rota falhou num `sed` (barras no caminho) e
parou antes de alterar o site; nada foi recarregado. O script passou a usar
`awk` e a restaurar automaticamente em qualquer erro.

### Próximo passo objetivo

**Feriados nacionais** na biblioteca e na API, com fonte verificada e distinção
entre feriados oficiais e pontos facultativos.

## 2026-11-20 — Etapa 3: UFs e municípios (IBGE)

**Status:** implementado (IBGE). Feriados ainda não existem.

### Feito

- Documentação oficial lida em <https://servicodados.ibge.gov.br/api/docs/localidades>
  (a página bloqueia `curl`/fetch automatizado com 403; foi lida em navegador).
- Respostas reais gravadas em `tests/fixtures/ibge/api/`: 27 UFs; municípios de
  RR (15), MT (142) e DF (1); UF inexistente (`[]`).
- `src/providers/ibge.ts` e `src/modules/ibge`: `createIbgeClient()` com
  `listUfs()` e `listMunicipios(uf)`, ordenados por nome; `resolveUf` e
  `UF_CODES` (tabela fixa, conferida por teste contra a resposta real).
- Testes de integração para IBGE; exemplo `examples/node/ibge.mjs`; `docs/ibge.md`.

### Verificação local

- `pnpm run check` — lint, typecheck, 131 testes unitários e build OK.
- `pnpm test:integration` — 6 testes OK (CEP + IBGE) contra as APIs reais.

### Decisões

- Chamamos a API com o código numérico da UF (formato dos exemplos oficiais);
  a sigla é convertida localmente e UFs inválidas falham sem requisição.
- `codigoIbge` como `string`, igual ao `codigoIbgeMunicipio` do módulo de CEP.
- `microrregiao`/`mesorregiao` podem ser `null` (caso real: Boa Esperança do
  Norte/MT); `regiaoImediata`/`regiaoIntermediaria` vieram em todos os municípios.

### Próximo passo objetivo

**Feriados nacionais:** escolher fonte verificada (legislação federal ou provedor
documentado), separar feriados oficiais de pontos facultativos e registrar
origem/licença e ano de referência.

## 2026-11-20 — Etapa 2: consulta de CEP

**Status:** implementado (CEP); IBGE e feriados ainda não existem.

### Feito

- Contratos verificados: ViaCEP pela documentação em <https://viacep.com.br/>;
  BrasilAPI pela especificação OpenAPI no repositório oficial (MIT). Respostas
  reais gravadas em `tests/fixtures/cep/` (200, não encontrado e 400 de cada).
- `src/providers/viacep.ts` e `src/providers/brasilapi.ts`: validação manual do
  formato da resposta (sem dependências) e conversão para `Endereco`.
- `src/modules/cep`: `createCepClient().lookup()` com fallback por
  indisponibilidade, `fallbackOnNotFound` opcional, cancelamento, erros
  agregados; utilitários de formato que não fazem requisições.
- Testes de integração opcionais (`pnpm test:integration`, 4 testes contra as
  APIs reais, passando) e workflow semanal/manual separado do CI obrigatório.
- Exemplo `examples/node/cep.mjs` e documentação em `docs/cep.md`.

### Verificação local

- `pnpm run check` — lint, typecheck, 107 testes unitários e build OK.
- `pnpm test:integration` — 4 testes OK contra ViaCEP e BrasilAPI.
- `node examples/node/cep.mjs 01310-100` — endereço real retornado pelo ViaCEP.

### Decisões

- Ordem padrão `viacep` → `brasilapi`: o ViaCEP tem documentação pública
  direta e devolve `complemento`; o BrasilAPI já agrega fontes e serve de reserva.
- "Não encontrado" não gera fallback por padrão (evita requisições extras);
  as bases divergem, então `fallbackOnNotFound` existe como opção.
- Fixtures gravadas ficam fora do Biome e com `-text` no `.gitattributes`,
  para que formatador e Git não alterem os bytes recebidos.
- Campos do `Endereco` em português, alinhados ao domínio.

### Próximo passo objetivo

Módulo **IBGE**: ler a documentação oficial da API de Localidades
(`servicodados.ibge.gov.br`), gravar fixtures de UFs e municípios de uma UF,
implementar `listUfs()` e `listMunicipios({ uf })` com validação de resposta e
testes de contrato.

## 2026-11-20 — Etapa 1: fundação

**Status:** parcial (fundação pronta; adaptadores de dados ainda não existem).

### Feito

- Repositório Git (`main`) e estrutura `src/{core,providers,modules}`,
  `tests/{unit,integration,fixtures}`, `examples/node`, `docs/adr`.
- Tooling: TypeScript 5.9 strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), tsup (ESM + CJS + `.d.ts`), Vitest, Biome
  (ver [ADR 0001](docs/adr/0001-biome-para-lint-e-formatacao.md)).
  `packageManager: pnpm@12.21.0` (inicialmente 10.34.9 via `npx`; atualizado
  quando o pnpm 12 foi instalado globalmente na máquina do mantenedor).
  O pnpm 12 aplica `minimumReleaseAge` (1 dia): o lockfile foi refeito e o
  `cac` ficou em 7.1.0, pois a 7.1.1 tinha sido publicada no mesmo dia.
  Scripts de instalação permitidos: só `esbuild` (`pnpm-workspace.yaml`).
- `src/core/errors.ts`: erros tipados com `code` estável e `provider`.
- `src/core/http.ts`: `createHttpClient().getJson()` com timeout próprio +
  `AbortSignal` do chamador, query string, cabeçalhos, `User-Agent` opcional,
  mapeamento 404/429/5xx/outros e JSON inválido; `parseRetryAfter`.
- `src/modules/cnpj`: validação numérica e alfanumérica conforme o manual
  oficial do Serpro/Receita (exemplo oficial `12.ABC.345/01DE-35` coberto por
  teste; equivalência com o cálculo numérico tradicional em 2000 bases).
- Documentos padrão (README pt/en, LICENSE MIT, CONTRIBUTING, CODE_OF_CONDUCT,
  SECURITY, CHANGELOG, ROADMAP), docs de arquitetura e de CNPJ.
- CI: lint, typecheck, testes e build em `windows-latest` e `ubuntu-latest`
  (Node 22 e 24) + varredura de segredos com gitleaks.

### Verificação local (Windows 11, Node 24.16)

- `pnpm run lint` — sem erros nem avisos.
- `pnpm run typecheck` — sem erros.
- `pnpm test` — 3 arquivos, 75 testes passando.
- `pnpm run build` — `dist/` com ESM, CJS e tipos; import via ESM e `require`
  conferidos; `node examples/node/cnpj.mjs` roda.

### Repositório e CI

- Repositório público: <https://github.com/Efer-Eder/brasil-dev-kit>.
- CI verde nas 4 combinações (Windows/Ubuntu × Node 22/24); gitleaks sem
  vazamentos no histórico completo (execução manual, 14 commits).
- A primeira execução do gitleaks no push inicial falhou por limitação da action
  com o commit raiz (`<raiz>^` não existe); as seguintes passaram.
- Dependabot ativo; majors de `typescript` e `@types/node` ignorados de propósito.
  PRs abertos pelo Dependabot (`actions/checkout` e `actions/setup-node` v7)
  passaram no CI e aguardam revisão.

### Decisões

- Biome em vez de ESLint + Prettier (ADR 0001).
- TypeScript 5.9 em vez do 7.x: o build de tipos do tsup usa a API JS do
  compilador; migrar quando houver suporte confirmado.
- `"private": true` no `package.json` para impedir publicação acidental no npm.
- CNPJ com todos os caracteres iguais é rejeitado (convenção da biblioteca,
  documentada; não vem do manual).

### Pendências

- Retries/backoff e cache TTL no core.
- Nenhum adaptador de dados (CEP, IBGE, feriados) ainda.

### Próximo passo objetivo

Adaptador de **CEP**: escolher e documentar um provedor público (verificar
documentação oficial e termos de uso), gravar fixtures reais em
`tests/fixtures/cep/`, implementar `lookupCep()` usando o `HttpClient`, validar
o formato da resposta e normalizar o endereço, com testes de 404, timeout e
resposta malformada.

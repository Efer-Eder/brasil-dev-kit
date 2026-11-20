# Progresso

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

# Development report

Diagnóstico e evolução do Brasil Dev Kit rumo à primeira publicação no npm.
Legenda de estado, usada em todo o documento:

- **Implementado**: existe código funcional.
- **Testado**: validado por testes executados (com o resultado registrado aqui).
- **Preparado**: configurado, mas depende de uma etapa externa (aprovação, segredo, conta).
- **Pendente**: ainda não implementado.

## 1. Diagnóstico inicial (2026-11-21)

Ambiente: Windows 11, Node 24.16, pnpm 12.21.0. Branch `main` em `98283c9`.

### Evidências coletadas

| Verificação                           | Comando                                             | Resultado                                                      |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Lint (Biome, avisos contam como erro) | `pnpm run lint`                                     | 73 arquivos, sem problemas                                     |
| Tipos                                 | `pnpm run typecheck`                                | sem erros                                                      |
| Testes unitários                      | `pnpm test`                                         | 10 arquivos, 227 testes passando                               |
| Build                                 | `pnpm run build`                                    | ESM, CJS e `.d.ts` gerados                                     |
| Cobertura (`src/`)                    | `vitest run --coverage`                             | 95,88% instruções, 93,39% ramos, 96,03% funções, 98,14% linhas |
| Validação do pacote                   | `publint --pack npm --strict`                       | "All good!"                                                    |
| Resolução de tipos                    | `@arethetypeswrong/cli --pack`                      | sem problemas em node10, node16 (CJS e ESM) e bundler          |
| Conteúdo do pacote                    | `npm pack --dry-run`                                | 10 arquivos, 86,6 kB compactado, 332,9 kB descompactado        |
| Vulnerabilidades                      | `pnpm audit` e `pnpm audit --prod`                  | nenhuma conhecida                                              |
| Dependências de runtime               | `package.json`                                      | nenhuma                                                        |
| Nome no npm                           | `npm view brasil-dev-kit`                           | E404: nome livre no registro                                   |
| API pública (só GET)                  | `curl` em `https://efer.online/api/brasil-dev-kit/` | ver seção API                                                  |

### API pública: auditoria só com GET

- Validação de entrada: CEP com 3.000 caracteres → 400 JSON; ano `0000` e
  `99999` → 400 JSON; CNPJ com 500 dígitos → 200 com `valid: false,
  invalid_length`; path traversal codificado (`..%2F..%2Fetc%2Fpasswd`) → 404 JSON.
- Cabeçalhos: `Content-Type: application/json; charset=utf-8`,
  `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *` (API
  pública, só GET, sem credenciais), `Cache-Control` por rota, `X-Cache`.
- Limite por IP (10 req/s, rajada 30) e limites por provedor: validados em
  20/11/2026 (ver `docs/api.md`).
- Sem especificação OpenAPI.
- A mensagem de erro de UF repete a entrada (`UF inválida: <script>`). Risco
  baixo (JSON com `nosniff`), mas desnecessário.
- `%00` no caminho é rejeitado pelo Nginx com página HTML, não JSON.

### Classificação

**P0 (falha crítica, segurança ou perda de dados):** nenhum encontrado.
Sem segredos versionados (gitleaks no CI), sem vulnerabilidades conhecidas,
testes e build verdes, API validando entrada.

**P1 (funcionalidade principal quebrada):** nenhum encontrado. CEP, IBGE,
feriados e CNPJ funcionam no SDK e na API (verificado com chamadas reais em
20/11/2026 e pelo exemplo `examples/node/kit.mjs`).

**P2 (qualidade importante, bloqueia a primeira publicação):**

1. CNPJ: `validateCnpj` mistura sintaxe e dígitos verificadores num passo só;
   não há função pública separada para cada etapa (spec 3.5).
2. Pacote: versão `0.0.0`, `CHANGELOG.md` fora do tarball, sem export
   `./package.json`, sem pipeline de release preparado nem roteiro de publicação.
3. README no npm: as imagens usam caminho relativo (`docs/assets/...`), que não
   aparece na página do pacote no npmjs.com.
4. Instalação real não testada: falta validar o `.tgz` num projeto consumidor
   isolado (ESM, CommonJS e tipos), e isso não roda no CI.
5. Documentação em inglês limitada ao README; guias por módulo só em português.
6. API sem especificação OpenAPI.
7. Sem templates de issue e de pull request no GitHub.
8. Compatibilidade de ambiente não documentada (o SDK usa `fetch`,
   `AbortSignal.any` e `structuredClone`; só Node 22 e 24 são testados).

**P3 (melhorias incrementais):**

1. API: mensagens de erro repetem a entrada do usuário sem limite de tamanho.
2. API: `%00` recebe 400 em HTML do Nginx em vez de JSON.
3. Cobertura medida só localmente (sem relatório no CI).
4. Versão da API (`0.1.0` fixa no código) desacoplada da versão do pacote.

### Mapa dos testes pedidos (spec 3.6)

| Caso                         | Onde                                                                 | Estado                           |
| ---------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| CEP válido                   | `tests/unit/modules/cep.test.ts` (fixtures reais ViaCEP e BrasilAPI) | Testado                          |
| CEP inválido                 | idem, "formato de CEP"                                               | Testado                          |
| CEP inexistente              | idem (`{"erro":"true"}` e 404)                                       | Testado                          |
| Serviço indisponível         | idem (503, rede) e `server/app.test.ts`                              | Testado                          |
| Timeout                      | `core/http.test.ts`, `cep.test.ts`, `server/app.test.ts`             | Testado                          |
| Fallback                     | `cep.test.ts`, "fallback entre provedores"                           | Testado                          |
| Cache                        | `core/retry-cache.test.ts`, `server/app.test.ts`, `kit.test.ts`      | Testado                          |
| Respostas malformadas        | `cep.test.ts`, `ibge.test.ts`                                        | Testado                          |
| CNPJ numérico e alfanumérico | `modules/cnpj.test.ts` (exemplo oficial do Serpro)                   | Testado                          |
| Municípios e estados         | `modules/ibge.test.ts` (fixtures reais)                              | Testado                          |
| Feriados                     | `modules/feriados.test.ts` (lei × portaria × Páscoa)                 | Testado                          |
| Erros de integração          | `core/http.test.ts`, `core/retry-cache.test.ts`                      | Testado                          |
| Integração real              | `tests/integration/` (fora do CI obrigatório, workflow semanal)      | Testado localmente em 20/11/2026 |

### Riscos de regressão

- Mudar a API pública do CNPJ quebraria quem já usa `validateCnpj`: as funções
  novas precisam ser adicionais, sem alterar as existentes.
- Imagens absolutas no README dependem do caminho no GitHub continuar o mesmo.

## 2. Alterações implementadas (branch `chore/release-readiness`, local)

| Item                                                                                                                                                                                     | Prioridade | Estado                        | Evidência                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| CNPJ em etapas: `validateCnpjSyntax`, `hasValidCnpjCheckDigits`, `formatCnpj(..., { checkDigits: false })`; fachada com `checkSyntax` e `hasValidCheckDigits`; `validateCnpj` inalterado | P2.1       | Implementado e testado        | 9 testes novos em `cnpj.test.ts` e `kit.test.ts`; testes antigos de CNPJ passam sem mudança   |
| Metadados para o npm: versão `0.1.0`, `CHANGELOG.md` no pacote, export `./package.json`, `homepage`, `bugs`, `publishConfig` (público, proveniência)                                     | P2.2       | Implementado e testado        | `npm pack --dry-run`, `publint --strict`, attw                                                |
| Roteiro e workflow de publicação (`docs/release.md`, `release.yml` manual, a partir de tag)                                                                                              | P2.2       | Preparado                     | Trusted Publishing (OIDC, sem token); trava `private` removida; publicar depende de aprovação |
| Imagens do README com URL absoluta (aparecem no npm)                                                                                                                                     | P2.3       | Implementado                  | URLs `raw.githubusercontent.com/.../main/docs/assets/readme/*`                                |
| `pnpm test:package`: instala o `.tgz` num consumidor isolado e testa ESM, CJS, `package.json` e tipos (`nodenext` e `bundler`, strict); no CI                                            | P2.4       | Implementado e testado        | 6 etapas OK localmente; passo novo no `ci.yml` (roda no CI após o push)                       |
| Guia completo em inglês (`docs/en/README.md`) e links nos READMEs                                                                                                                        | P2.5       | Implementado                  |                                                                                               |
| OpenAPI 3.1 (`docs/openapi.json`) servida em `/v1/openapi.json`                                                                                                                          | P2.6       | Implementado, testado e no ar | Redocly: válida, 0 avisos; teste confere que toda rota do índice está documentada             |
| Templates de issue e PR                                                                                                                                                                  | P2.7       | Implementado                  | `.github/ISSUE_TEMPLATE/`, `pull_request_template.md`                                         |
| Compatibilidade e limitações documentadas                                                                                                                                                | P2.8       | Implementado                  | READMEs pt/en e guia em inglês                                                                |
| Entrada do usuário limitada a 20 caracteres nas mensagens de UF e data                                                                                                                   | P3.1       | Implementado, testado e no ar | Teste com UF de 500 caracteres                                                                |
| Versão da API derivada do `package.json`                                                                                                                                                 | P3.4       | Implementado, testado e no ar | Teste compara `info.version` da OpenAPI com o índice                                          |
| Cobertura (`pnpm test:coverage`)                                                                                                                                                         | P3.3       | Implementado (local)          | Ver seção 3                                                                                   |

## 3. Testes executados (2026-11-21, Windows 11, Node 24.16)

| Comando                               | Resultado                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm run check`                      | lint 83 arquivos sem avisos; typecheck OK; **238 testes** em 10 arquivos; build OK |
| `pnpm run test:package`               | 6 etapas OK (pack, install offline, ESM, CJS, tipos nodenext, tipos bundler)       |
| `pnpm test:coverage`                  | 96,00% instruções, 93,58% ramos, 96,11% funções, 98,20% linhas (`src/`)            |
| `npm pack --dry-run`                  | `brasil-dev-kit@0.1.0`, 11 arquivos, 91,8 kB compactado, 352,4 kB descompactado    |
| `publint --pack npm --strict`         | All good                                                                           |
| `@arethetypeswrong/cli --pack`        | No problems found                                                                  |
| `@redocly/cli lint docs/openapi.json` | válida, 0 avisos                                                                   |
| `pnpm audit`                          | nenhuma vulnerabilidade conhecida                                                  |

Não executado nesta etapa: testes de integração contra as APIs reais (última
execução OK em 20/11/2026; rodam no workflow semanal) e o CI no GitHub (depende
do push, que aguarda aprovação).

## 4. Problemas pendentes

- **Publicação no npm**: preparada, não executada (precisa de aprovação, conta
  npm com 2FA e publicador confiável configurado; ver `docs/release.md`).
- **P3.2**: `%00` no caminho segue recebendo 400 em HTML do Nginx. Aceito como
  limitação documentada em `docs/api.md`: a correção mexeria no bloco do servidor
  compartilhado, e o pedido já é bloqueado.
- Navegadores e runtimes além do Node não são testados (documentado).
- Cobertura não é publicada no CI (só local); sem badge de cobertura de propósito.

## 5. Decisões

- As funções novas de CNPJ são **adicionais**: nenhuma assinatura existente mudou.
- Publicação por Trusted Publishing (OIDC), sem token guardado; token temporário
  só se a primeira publicação exigir.
- Release só manual, a partir de tag, com simulação (`--dry-run`) como padrão.
- OpenAPI escrita à mão e testada contra o índice da API (sem gerador extra).

## 6. Próximos passos

1. Aprovar o push do branch e o PR (CI completo, inclusive `test:package`, no GitHub).
2. Aprovar o deploy da API/página (OpenAPI no ar).
3. Decidir a publicação no npm e seguir `docs/release.md`.

## 7. Bloqueios externos e riscos

- Conta e token do npm são do mantenedor (não ficam no repositório).
- Provedores de CEP são terceiros, sem SLA; a API pública também não tem SLA.
- Imagens absolutas no README dependem do caminho `main/docs/assets/readme/`.

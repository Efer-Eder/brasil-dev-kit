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

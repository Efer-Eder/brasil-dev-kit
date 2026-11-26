# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Bancos: `createBancosClient()` com `getByCodigo` (COMPE), `getByIspb` e `list`, a
  partir da lista oficial de participantes do STR do Banco Central (arquivo diário,
  ODbL). Lista em cache por 1 hora por padrão; `codigo: null` para participantes
  sem código de compensação. Também `normalizeCodigoBanco` e `normalizeIspb`.
- DDD: `getDdd`, `listDdds`, `getDddPorMunicipio`, `isDddValido` e `normalizeDdd`,
  com tabela embutida gerada do PGCN da Anatel (domínio público, arquivo de
  23/11/2026, 5571 municípios, 67 DDDs) e `PGCN_VERSAO`. Script `pnpm data:ddd`
  para regenerar a tabela.
- Fachada: `br.bancos` e `br.ddd`; opção `bancos` em `createBrasilDevKit`.
- Core: `HttpClient.getText` (mesmo timeout, retry, cache e erros do `getJson`)
  e leitor de CSV interno.
- API: `/v1/bancos`, `/v1/bancos/{codigo}`, `/v1/bancos/ispb/{ispb}`, `/v1/ddd`,
  `/v1/ddd/{ddd}` e `/v1/ddd/municipio/{codigoIbge}`, na especificação OpenAPI.

## [0.1.0] - 2026-11-21

Primeira versão publicada no npm.

### Adicionado

- CNPJ em etapas separadas: `validateCnpjSyntax` (sintaxe), `hasValidCnpjCheckDigits`
  (dígitos verificadores) e `formatCnpj(cnpj, { checkDigits: false })`; a fachada
  ganhou `checkSyntax` e `hasValidCheckDigits`. `validateCnpj` não mudou.
- `pnpm test:package`: instala o `.tgz` num projeto consumidor isolado e testa
  ESM, CommonJS, `package.json` exportado e tipos (`nodenext` e `bundler`); roda no CI.
- Export `brasil-dev-kit/package.json`, `CHANGELOG.md` dentro do pacote e
  `publishConfig` com acesso público e proveniência.
- `pnpm test:coverage` (Vitest + V8).
- API: especificação OpenAPI 3.1 em `docs/openapi.json`, servida em
  `/v1/openapi.json`; a versão da API passa a vir do `package.json`.
- Guia completo em inglês (`docs/en/README.md`), seção de compatibilidade e
  limitações nos READMEs e roteiro de publicação (`docs/release.md`).
- Templates de issue e de pull request.

### Corrigido

- Mensagens de validação de UF e de data limitam a entrada repetida a 20 caracteres.

### Base do projeto

- Estrutura inicial do projeto: TypeScript strict, tsup (ESM + CJS + tipos),
  Vitest e Biome.
- Cliente HTTP (`createHttpClient`) com timeout, `AbortSignal`, query string e
  mapeamento de status para erros tipados.
- Erros tipados: `ValidationError`, `NotFoundError`, `RateLimitError`,
  `TimeoutError`, `ProviderUnavailableError` e `HttpError`.
- Validação de CNPJ numérico e alfanumérico (`validateCnpj`, `isValidCnpj`,
  `formatCnpj`, `normalizeCnpj`, `computeCnpjCheckDigits`) conforme o manual
  oficial de cálculo do DV.
- CI no GitHub Actions (Windows e Ubuntu) e varredura de segredos.
- Consulta de CEP (`createCepClient().lookup`) com os provedores ViaCEP e
  BrasilAPI, fallback por indisponibilidade, `fallbackOnNotFound` opcional,
  endereço normalizado com procedência (`fonte`) e utilitários de formato
  (`isValidCepFormat`, `normalizeCep`, `formatCep`, `assertCep`).
- Testes de integração opcionais (`pnpm test:integration`) e workflow semanal.
- UFs e municípios pela API de Localidades do IBGE (`createIbgeClient`, com
  `listUfs` e `listMunicipios`), além de `resolveUf` e `UF_CODES`.
- API HTTP pública (`server/`) publicada em `https://efer.online/api/brasil-dev-kit/`:
  CEP, UFs, municípios e validação de CNPJ, com cache em memória, junção de
  consultas simultâneas, limites por provedor externo, timeouts encadeados e
  limite de 10 req/s por IP no Nginx. Deploy via Docker (`deploy/`).
- Feriados nacionais (`getFeriadosNacionais`, `isFeriadoNacional`, `buscarDataNacional`,
  `calcularPascoa`): leis federais e portarias federais de 2025 e 2026 com
  pontos facultativos; rota `/v1/feriados/{ano}` na API.
- Página do projeto em `https://efer.online/projeto/brasil-dev-kit/` (`site/`), com
  playground da API e widget do GitHub alimentado pela rota `/v1/projeto/github`
  (cache de 10 minutos, fallback para o último dado bom).
- Core HTTP: novas tentativas com backoff exponencial e jitter (`retry`), que
  respeitam `Retry-After` e o cancelamento, e cache TTL opcional em memória
  (`cache`, ou `cacheTtlMs` nos clientes de CEP e IBGE) com junção de pedidos
  simultâneos.
- Fachada `createBrasilDevKit()`: `cep`, `ibge`, `feriados` e `cnpj` num objeto só,
  com opções comuns (`timeoutMs`, `retry`, `cacheTtlMs`, `fetch`, `userAgent`) e
  sobrescrita por módulo.
- README pt-BR/en-US com GIFs animados gerados a partir de saídas reais
  (`scripts/readme-gifs/`).

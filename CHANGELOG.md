# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

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

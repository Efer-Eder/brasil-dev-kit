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

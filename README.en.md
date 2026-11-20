# Brasil Dev Kit

[![CI](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[🇧🇷 Português](README.md) · 🇺🇸 English

A **TypeScript-first** SDK to consume and normalize Brazilian public data
(postal codes/CEP, IBGE, holidays, CNPJ) with a typed API, predictable errors and
clear data provenance.

> ⚠️ **Work in progress.** Nothing is published on npm yet. This page only shows
> what already exists in the code; everything else is in the [ROADMAP](ROADMAP.md).
> The imports below use the provisional name `brasil-dev-kit`; the final npm
> package name is not decided yet. For now, use it from source.

## What works today

| Feature                                                     | Status                    |
| ----------------------------------------------------------- | ------------------------- |
| HTTP client with timeout, `AbortSignal` and typed errors    | ✅ implemented and tested |
| Numeric and **alphanumeric** CNPJ validation (check digits) | ✅ implemented and tested |
| CEP, IBGE municipalities/states, national holidays          | 🗓️ planned                |
| Retries with backoff and in-memory cache                    | 🗓️ planned                |

## CNPJ validation

CNPJ is the Brazilian company tax ID. Since IN RFB nº 2.229/2024 it may contain
uppercase letters in its first 12 characters. The implementation follows the
official check-digit manual published by Serpro/Receita Federal. Details and
sources (in Portuguese): [docs/cnpj.md](docs/cnpj.md).

```ts
import { validateCnpj, isValidCnpj, formatCnpj } from 'brasil-dev-kit';

validateCnpj('12.ABC.345/01DE-35');
// { valid: true, normalized: '12ABC34501DE35', formatted: '12.ABC.345/01DE-35', kind: 'alphanumeric' }

isValidCnpj('11.222.333/0001-81'); // true
formatCnpj('11222333000181'); // '11.222.333/0001-81'
```

> Validation checks **format and check digits only**. It does not prove that the
> CNPJ exists or is active/regular at Receita Federal.

## HTTP client

The foundation for the upcoming data adapters. Uses native `fetch`, no dependencies.

```ts
import { createHttpClient, TimeoutError } from 'brasil-dev-kit';

const http = createHttpClient({ baseUrl: 'https://example.test/api', timeoutMs: 5000 });
const data = await http.getJson('/resource', { query: { uf: 'SP' } }); // `unknown`: validate it
```

Errors: `ValidationError`, `NotFoundError`, `RateLimitError` (with `retryAfterMs`),
`TimeoutError`, `ProviderUnavailableError` and `HttpError`, all with a stable
`code` and extending `BrasilDevKitError`.

## Running locally (Windows, macOS or Linux)

Requires **Node.js ≥ 22.12**, Git and **pnpm 12** (pinned in `packageManager`;
install with `npm install -g pnpm@12.21.0`).

```powershell
git clone https://github.com/Efer-Eder/brasil-dev-kit.git
cd brasil-dev-kit
pnpm install
pnpm test
pnpm build
node examples/node/cnpj.mjs
```

Without a global pnpm, replace `pnpm` with `npx pnpm@12.21.0`.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Efer Eder

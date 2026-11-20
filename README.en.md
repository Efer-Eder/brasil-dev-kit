# Brasil Dev Kit

[![CI](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[🇧🇷 Português](README.md) · 🇺🇸 English

A **TypeScript-first** SDK to consume and normalize Brazilian public data
(postal codes/CEP, IBGE, holidays, CNPJ) with a typed API, predictable errors and
clear data provenance.

🌐 **Project page with a live API playground:** https://efer.online/projeto/brasil-dev-kit/

> ⚠️ **Work in progress.** Nothing is published on npm yet. This page only shows
> what already exists in the code; everything else is in the [ROADMAP](ROADMAP.md).
> The imports below use the provisional name `brasil-dev-kit`; the final npm
> package name is not decided yet. For now, use it from source.

## What works today

| Feature                                                      | Status                    |
| ------------------------------------------------------------ | ------------------------- |
| HTTP client with timeout, `AbortSignal` and typed errors     | ✅ implemented and tested |
| Numeric and **alphanumeric** CNPJ validation (check digits)  | ✅ implemented and tested |
| CEP lookup (ViaCEP and BrasilAPI, with fallback)             | ✅ implemented and tested |
| States and municipalities (IBGE Localidades API)             | ✅ implemented and tested |
| National holidays and federal optional days (laws + decrees) | ✅ implemented and tested |
| Retries with backoff and in-memory cache                     | 🗓️ planned                |

## Public API (nothing to install)

The same features are available over HTTP at
**`https://efer.online/api/brasil-dev-kit/`** — free, cached, limited to 10
requests/s per IP, with no availability guarantee. Details (in Portuguese):
[docs/api.md](docs/api.md).

```powershell
curl https://efer.online/api/brasil-dev-kit/v1/cep/01310-100
curl https://efer.online/api/brasil-dev-kit/v1/ibge/ufs/SP/municipios
curl https://efer.online/api/brasil-dev-kit/v1/cnpj/12ABC34501DE35
curl https://efer.online/api/brasil-dev-kit/v1/feriados/2026
```

## CEP lookup

CEP is the Brazilian postal code. Lookups use ViaCEP and fall back to BrasilAPI
when it is unavailable. The result is normalized (field names are in Portuguese)
and says which provider answered. Details (in Portuguese): [docs/cep.md](docs/cep.md).

```ts
import { createCepClient, NotFoundError } from 'brasil-dev-kit';

const cep = createCepClient({ timeoutMs: 8000 });

const endereco = await cep.lookup('01310-100');
// { cep: '01310100', uf: 'SP', municipio: 'São Paulo', bairro: 'Bela Vista',
//   logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par',
//   codigoIbgeMunicipio: '3550308', fonte: { provedor: 'viacep', servicoOrigem: null } }

await cep.lookup('00000-000'); // throws NotFoundError
```

> Lookups hit free third-party services with no availability guarantee. ViaCEP
> may block heavy users: do not use this to validate whole CEP databases.

## States and municipalities (IBGE)

Data from IBGE's official Localidades API. Details (in Portuguese): [docs/ibge.md](docs/ibge.md).

```ts
import { createIbgeClient } from 'brasil-dev-kit';

const ibge = createIbgeClient();
const ufs = await ibge.listUfs(); // 27 states with region, sorted by name
const municipios = await ibge.listMunicipios('RR'); // or by code: 14
```

## National holidays

Holidays from federal law and, when published and checked, the yearly federal
government decree (portaria) with optional days off (2025 and 2026 today). No
network calls. Details (in Portuguese): [docs/feriados.md](docs/feriados.md).

```ts
import { getFeriadosNacionais, isFeriadoNacional } from 'brasil-dev-kit';

getFeriadosNacionais(2026); // { origem: 'portaria', datas: [19 items], fontes, avisos }
isFeriadoNacional('2026-11-20'); // true
```

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

The foundation of the data adapters (used by the CEP module). Uses native `fetch`, no dependencies.

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
node examples/node/cep.mjs 01310-100
node examples/node/ibge.mjs RR
node examples/node/feriados.mjs 2026
```

Without a global pnpm, replace `pnpm` with `npx pnpm@12.21.0`.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Efer Eder

# Brasil Dev Kit guide (English)

The detailed module docs live in Portuguese (`docs/*.md`), because the data,
laws and sources are Brazilian. This page covers everything you need to use the
SDK and the public API in English.

## Install

The package is prepared for npm but **not published yet**. Until then, build it
from source:

```bash
git clone https://github.com/Efer-Eder/brasil-dev-kit.git
cd brasil-dev-kit
pnpm install
pnpm build
```

Once published, it will be `npm install brasil-dev-kit` (ESM and CommonJS, with
types). No runtime dependencies.

## Quickstart

```ts
import { createBrasilDevKit, NotFoundError } from 'brasil-dev-kit';

const br = createBrasilDevKit({ timeoutMs: 8000, cacheTtlMs: 60_000 });

const address = await br.cep.lookup('01310-100');
// { cep: '01310100', uf: 'SP', municipio: 'São Paulo', logradouro: 'Avenida Paulista',
//   fonte: { provedor: 'viacep', servicoOrigem: null }, ... }

await br.ibge.listUfs(); // 27 states
await br.ibge.listMunicipios('RR'); // municipalities of a state (abbreviation or IBGE code)

br.feriados.getNacionais(2026); // national holidays + federal optional days off
br.feriados.isFeriado('2026-11-20'); // true

br.cnpj.validate('12.ABC.345/01DE-35'); // { valid: true, kind: 'alphanumeric', ... }
```

Field names are Portuguese on purpose (`municipio`, `logradouro`, `bairro`,
`fonte`), matching the official sources.

## Modules

| Module     | Needs network | Source                                              |
| ---------- | ------------- | --------------------------------------------------- |
| `cep`      | yes           | ViaCEP, falling back to BrasilAPI                   |
| `ibge`     | yes           | IBGE Localidades API (official)                     |
| `feriados` | no            | Federal laws and yearly federal decrees (portarias) |
| `cnpj`     | no            | Official check-digit manual (IN RFB nº 2.229/2024)  |

### CNPJ, step by step

| Step            | Function                       | Checks                                                                              |
| --------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Normalize       | `normalizeCnpj`                | Strips `.`, `/`, `-`, spaces; uppercases. No validation.                            |
| Syntax          | `validateCnpjSyntax`           | 14 chars, first 12 `0-9`/`A-Z`, last 2 digits, not all equal. Ignores check digits. |
| Check digits    | `hasValidCnpjCheckDigits`      | Last 2 chars match the official algorithm.                                          |
| Full validation | `validateCnpj` / `isValidCnpj` | Syntax + check digits, with a failure reason.                                       |
| Format          | `formatCnpj`                   | `XX.XXX.XXX/XXXX-XX`; `{ checkDigits: false }` formats syntax-valid input.          |
| Registry lookup | **not provided**               | Only Receita Federal can tell whether a company exists or is active.                |

### Holidays

Years with an official federal decree in the dataset (2025 and 2026 today)
return the full calendar (`origem: 'portaria'`), including optional days off and
partial periods (`ate_14h`, `apos_13h`). Other years from 2024 to 2099 return only
the holidays set by law (`origem: 'lei'`) and a warning. State and municipal
holidays are not included.

## Errors

Every error extends `BrasilDevKitError` and has a stable `code`:

| Class                      | `code`                 | When                                                      |
| -------------------------- | ---------------------- | --------------------------------------------------------- |
| `ValidationError`          | `VALIDATION_ERROR`     | Invalid input; no request is made                         |
| `NotFoundError`            | `NOT_FOUND`            | The provider has no such record                           |
| `RateLimitError`           | `RATE_LIMIT`           | The provider rate limited you (`retryAfterMs` when known) |
| `TimeoutError`             | `TIMEOUT`              | An attempt exceeded `timeoutMs`                           |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | Network failure, 5xx, or malformed response               |
| `HttpError`                | `HTTP_ERROR`           | Any other unexpected HTTP status                          |

Cancel any call with an `AbortSignal`: `br.cep.lookup('01310100', { signal })`.

## Timeouts, retries and cache

- `timeoutMs` (default 8000) applies to each attempt.
- `retry` (default `{ retries: 2, baseDelayMs: 200, maxDelayMs: 2000,
  maxRetryAfterMs: 5000 }`) retries only transient failures: network, 5xx,
  timeout and 429. Never 404, other 4xx, malformed JSON or caller cancellation.
  Delays use exponential backoff with full jitter; a 429 `Retry-After` up to 5 s
  is honored. CEP with more than one provider defaults to no retries per
  provider, because falling back to the next provider is faster.
- `cacheTtlMs` turns on an in-memory cache of successful responses (LRU,
  `cacheMaxEntries`, default 500). Results are copies; concurrent identical
  requests share one network call. Errors are never cached.
- Shared options apply to every module; `cep: {...}` and `ibge: {...}` override
  a single module.

## Compatibility

- Tested on **Node.js 22 and 24**, on Linux and Windows (CI on every change).
- Uses standard APIs: `fetch`, `AbortController`, `AbortSignal.any` and
  `structuredClone`. Browsers and other runtimes that provide them may work,
  but they are **not tested**. In browsers, network modules also depend on each
  provider's CORS policy.
- ESM and CommonJS builds with type definitions (checked with `publint` and
  `@arethetypeswrong/cli`).

## Public HTTP API

`https://efer.online/api/brasil-dev-kit/` exposes the same features over HTTP:
free, no sign-up, 10 requests/s per IP, **no availability guarantee**. The
OpenAPI 3.1 description is in [`docs/openapi.json`](../openapi.json). For heavy
or critical use, run the SDK in your own service.

## Limitations

- CNPJ validation checks format and check digits only.
- CEP data comes from third-party services (ViaCEP, BrasilAPI); their databases
  can differ, and they may rate limit or block heavy use.
- Holidays: only national holidays and federal optional days off.
- Not on npm yet; the API has no SLA.

## FAQ

**Is it production ready?** The SDK is tested and typed, but it is version 0.x
and not published yet. Pin the version and check the changelog when upgrading.

**Do you store what I query?** The SDK keeps nothing except the optional
in-memory cache. The public API logs only aggregated counters, no IPs or queries.

**Can I add a provider?** Open an issue first; every integration must cite its
official documentation and ship with tests against recorded real responses.

## Contributing and license

See [CONTRIBUTING](../../CONTRIBUTING.md) (Portuguese). MIT licensed.

# Brasil Dev Kit

[![CI](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

🇧🇷 Português · [🇺🇸 English](README.en.md)

SDK **TypeScript-first** para consumir e padronizar dados públicos brasileiros
(CEP, IBGE, feriados, CNPJ) com API tipada, erros previsíveis e procedência clara.

> ⚠️ **Em desenvolvimento.** Ainda não há versão publicada no npm. Esta página
> mostra apenas o que já existe no código; o restante está no [ROADMAP](ROADMAP.md).
> Os `import` abaixo usam o nome provisório `brasil-dev-kit`; o nome final do
> pacote no npm ainda será definido. Por enquanto, use a partir do código-fonte.

## O que já funciona

| Recurso                                                               | Estado                    |
| --------------------------------------------------------------------- | ------------------------- |
| Cliente HTTP com timeout, `AbortSignal` e erros tipados               | ✅ implementado e testado |
| Validação de CNPJ numérico e **alfanumérico** (dígitos verificadores) | ✅ implementado e testado |
| Consulta de CEP (ViaCEP e BrasilAPI, com fallback)                    | ✅ implementado e testado |
| Municípios/UFs (IBGE), feriados nacionais                             | 🗓️ planejado              |
| Retries com backoff e cache em memória                                | 🗓️ planejado              |

## Consulta de CEP

Usa o ViaCEP e, se ele estiver indisponível, o BrasilAPI. O resultado é
normalizado e informa de qual provedor veio. Detalhes em [docs/cep.md](docs/cep.md).

```ts
import { createCepClient, NotFoundError } from 'brasil-dev-kit';

const cep = createCepClient({ timeoutMs: 8000 });

const endereco = await cep.lookup('01310-100');
// { cep: '01310100', uf: 'SP', municipio: 'São Paulo', bairro: 'Bela Vista',
//   logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par',
//   codigoIbgeMunicipio: '3550308', fonte: { provedor: 'viacep', servicoOrigem: null } }

await cep.lookup('00000-000'); // lança NotFoundError
```

> As consultas vão para serviços públicos de terceiros, sem garantia de
> disponibilidade. O ViaCEP pode bloquear quem faz uso massivo: não use para
> validar bases inteiras de CEPs.

## Validação de CNPJ

Segue o manual oficial de cálculo do DV do CNPJ alfanumérico (Serpro/Receita
Federal, IN RFB nº 2.229/2024). Detalhes e fontes em [docs/cnpj.md](docs/cnpj.md).

```ts
import { validateCnpj, isValidCnpj, formatCnpj } from 'brasil-dev-kit';

validateCnpj('12.ABC.345/01DE-35');
// { valid: true, normalized: '12ABC34501DE35', formatted: '12.ABC.345/01DE-35', kind: 'alphanumeric' }

validateCnpj('11222333000182');
// { valid: false, reason: 'invalid_check_digits', message: 'Dígitos verificadores não conferem.' }

isValidCnpj('11.222.333/0001-81'); // true
formatCnpj('11222333000181'); // '11.222.333/0001-81'
```

> A validação confere **apenas formato e dígitos verificadores**. Ela não atesta
> que o CNPJ existe, está ativo ou regular na Receita Federal.

## Cliente HTTP

Base dos adaptadores de dados (usado pelo módulo de CEP). Usa o `fetch` nativo, sem dependências.

```ts
import { createHttpClient, TimeoutError, NotFoundError } from 'brasil-dev-kit';

const http = createHttpClient({ baseUrl: 'https://exemplo.test/api', timeoutMs: 5000 });

try {
  const data = await http.getJson('/recurso', { query: { uf: 'SP' } });
  // `data` é `unknown`: valide antes de usar.
} catch (error) {
  if (error instanceof TimeoutError) console.error('Demorou demais', error.timeoutMs);
  if (error instanceof NotFoundError) console.error('Não encontrado');
}
```

Erros disponíveis: `ValidationError`, `NotFoundError`, `RateLimitError`
(com `retryAfterMs`), `TimeoutError`, `ProviderUnavailableError` e `HttpError`,
todos com `code` estável e herdando de `BrasilDevKitError`.

## Rodando localmente (Windows, macOS ou Linux)

Requisitos: **Node.js ≥ 22.12**, Git e **pnpm 12** (versão fixada em
`packageManager`; instale com `npm install -g pnpm@12.21.0`).

```powershell
git clone https://github.com/Efer-Eder/brasil-dev-kit.git
cd brasil-dev-kit
pnpm install
pnpm test
pnpm build
node examples/node/cnpj.mjs
node examples/node/cep.mjs 01310-100
```

Sem instalar o pnpm globalmente, troque `pnpm` por `npx pnpm@12.21.0`.
Scripts disponíveis: `build`, `lint`, `lint:fix`, `typecheck`, `test`,
`check` (roda tudo).

## Documentação

- [Arquitetura](docs/architecture.md)
- [Regras de CNPJ e fontes oficiais](docs/cnpj.md)
- [Consulta de CEP: provedores, fallback e limites](docs/cep.md)
- [Decisões técnicas (ADRs)](docs/adr/)
- [Progresso](PROGRESS.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

## Contribuindo

Contribuições são bem-vindas! Leia o [CONTRIBUTING.md](CONTRIBUTING.md) e o
[Código de Conduta](CODE_OF_CONDUCT.md). Para vulnerabilidades, veja [SECURITY.md](SECURITY.md).

## Licença

[MIT](LICENSE) © Efer Eder

# Consulta de CEP

`createCepClient()` consulta um CEP em provedores públicos e devolve um
`Endereco` normalizado, sempre com a procedência em `fonte`.

```ts
import { createCepClient } from 'brasil-dev-kit';

const cep = createCepClient({ timeoutMs: 8000 });
const endereco = await cep.lookup('01310-100');
// {
//   cep: '01310100', uf: 'SP', municipio: 'São Paulo', bairro: 'Bela Vista',
//   logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par',
//   codigoIbgeMunicipio: '3550308',
//   fonte: { provedor: 'viacep', servicoOrigem: null }
// }
```

Também há utilitários que **não** fazem requisições: `isValidCepFormat`,
`normalizeCep`, `formatCep` (`'01310100'` → `'01310-100'`) e `assertCep`.

## Provedores

| Id          | Endpoint                                        | Documentação consultada (20/11/2026)                                                                             |
| ----------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `viacep`    | `GET https://viacep.com.br/ws/{cep}/json/`      | <https://viacep.com.br/> (a página inicial é a documentação)                                                     |
| `brasilapi` | `GET https://brasilapi.com.br/api/cep/v1/{cep}` | OpenAPI no repositório oficial (MIT): <https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/docs/doc/cep.json> |

Ambos são gratuitos e não exigem chave. Nenhum dos dois garante
disponibilidade; este SDK também não.

### Comportamentos verificados

- **ViaCEP:** formato inválido → HTTP 400 (página HTML). CEP inexistente →
  HTTP 200 com `{"erro": "true"}` (string na gravação de 20/11/2026; o SDK aceita
  também o booleano). A documentação avisa que **uso massivo para validar bases
  locais pode bloquear o acesso** — não use este SDK para varrer listas de CEPs.
- **BrasilAPI:** agrega várias fontes (OpenCep como principal) e informa qual
  respondeu no campo `service`, exposto como `fonte.servicoOrigem`. CEP não
  encontrado → HTTP 404 — o mesmo status de quando **todas** as fontes falham,
  então um 404 não prova que o CEP não existe. Não fornece `complemento`
  (sempre `null`).
- As bases divergem: em 20/11/2026, `99999-999` era "não encontrado" no ViaCEP
  e encontrado no BrasilAPI.

## Fallback

Os provedores são tentados na ordem de `providers` (padrão
`['viacep', 'brasilapi']`). O próximo só é consultado quando o anterior falha
por **indisponibilidade**: rede, 5xx, timeout, limite de taxa (429), status HTTP
inesperado ou resposta em formato inesperado.

"CEP não encontrado" encerra a busca, a menos que `fallbackOnNotFound: true`
seja usado.

| Situação                               | Erro lançado                                                             |
| -------------------------------------- | ------------------------------------------------------------------------ |
| CEP sem 8 dígitos                      | `ValidationError` (nenhuma requisição é feita)                           |
| Não encontrado                         | `NotFoundError`                                                          |
| Um só provedor configurado e ele falha | o erro original (`TimeoutError`, `RateLimitError`…)                      |
| Todos os provedores falham             | `ProviderUnavailableError` com `cause: AggregateError` (um por provedor) |
| Cancelamento via `signal`              | o motivo do cancelamento; nenhum outro provedor é tentado                |

## Opções

```ts
createCepClient({
  providers: ['brasilapi'], // ordem e quais usar
  fallbackOnNotFound: false,
  timeoutMs: 8000, // por provedor
  fetch, // fetch customizado
  userAgent: 'meu-app/1.0', // opcional; navegadores ignoram
});
```

## Testes

- Unitários (`tests/unit/modules/cep.test.ts`) usam respostas **reais gravadas**
  em `tests/fixtures/cep/` (origem e data no README da pasta).
- Integração (`pnpm test:integration`) consulta as APIs reais. Não roda no CI
  obrigatório; há um workflow semanal/manual para detectar mudança de contrato.

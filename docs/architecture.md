# Arquitetura

> Estado em 20/11/2026: existem `core` (HTTP + erros) e os módulos `cnpj`, `cep` e `ibge`.
> As demais pastas estão reservadas para os próximos passos (ver `ROADMAP.md`).

```text
src/
  core/        # cliente HTTP: timeout, retries com backoff, cache TTL e erros tipados
  providers/   # clientes por fonte de dados: viacep, brasilapi (CEP), ibge
  modules/     # API pública por domínio: cnpj, cep, ibge (prontos); feriados (planejado)
  index.ts     # ponto de entrada público
server/src/    # API HTTP pública (usa a biblioteca; sem dependências)
deploy/        # Docker, Nginx e scripts de deploy para efer.online
tests/
  unit/        # testes sem rede (fetch falso e fixtures)
  integration/ # testes opcionais contra fontes reais (não bloqueiam o CI)
  fixtures/    # dados gravados/sintéticos, sempre com origem documentada
examples/
  node/        # exemplos executáveis
docs/
  adr/         # decisões técnicas
```

## Princípios

- **Sem dependências de runtime** por enquanto: só `fetch` nativo (Node.js ≥ 22).
- **Dados externos são `unknown`** até serem validados pelo módulo que os consome.
- **Erros tipados** com `code` estável: `ValidationError`, `NotFoundError`,
  `RateLimitError`, `TimeoutError`, `ProviderUnavailableError` e `HttpError`.
- **Procedência explícita:** erros carregam o `provider`; os resultados dos
  módulos de dados vão indicar a fonte usada.
- **Nada de telemetria** nem envio de dados a terceiros além da requisição
  que o próprio usuário pediu.

## Cliente HTTP (`src/core/http.ts`)

- `createHttpClient({ baseUrl, timeoutMs, fetch, headers, userAgent, provider })`
- `client.getJson(path, { signal, timeoutMs, query, headers })` → `Promise<unknown>`
- Timeout próprio (padrão 8000 ms) combinado com o `AbortSignal` do chamador via
  `AbortSignal.any`. Cancelamento pelo chamador propaga o motivo original;
  expiração do tempo gera `TimeoutError`.
- Mapeamento de status: 404 → `NotFoundError`; 429 → `RateLimitError` (com
  `Retry-After` em ms); 5xx, falha de rede ou JSON inválido →
  `ProviderUnavailableError`; outros não-2xx → `HttpError`.
- O corpo de respostas de erro é descartado e não entra na mensagem, para não
  vazar conteúdo inesperado em logs.

### Novas tentativas (`retry`)

- Padrão: `{ retries: 2, baseDelayMs: 200, maxDelayMs: 2000, maxRetryAfterMs: 5000 }`;
  `retry: false` desliga. O `timeoutMs` vale para cada tentativa.
- Repete só o que costuma ser passageiro: falha de rede, 5xx, timeout e 429.
  Nunca repete 404, outros 4xx, JSON inválido ou cancelamento do chamador.
- Espera: backoff exponencial com "full jitter" (valor aleatório entre 0 e
  `min(maxDelayMs, baseDelayMs × 2^n)`), para clientes não voltarem todos juntos.
- 429 com `Retry-After`: espera exatamente o pedido, se for até
  `maxRetryAfterMs`; acima disso lança `RateLimitError` na hora.
- O `AbortSignal` do chamador também interrompe a espera entre tentativas.
- Clientes: o IBGE usa o padrão; o CEP com mais de um provedor usa `retry: false`
  por padrão (o fallback para o próximo provedor já é a nova tentativa). A API
  pública desliga as novas tentativas: fila, ritmo, fallback e cache já cobrem.

### Cache (`cache` / `cacheTtlMs`)

- Desligado por padrão. `createHttpClient({ cache: { ttlMs, maxEntries } })`, ou
  `cacheTtlMs`/`cacheMaxEntries` nos clientes de CEP e IBGE.
- Guarda só respostas de sucesso (o JSON já interpretado), por URL completa,
  com TTL e limite de entradas (sai a menos usada; padrão 500).
- Devolve cópias (`structuredClone`): alterar o resultado não altera o cache.
- Pedidos simultâneos da mesma URL compartilham uma única ida à rede; cancelar
  um deles não cancela os outros.

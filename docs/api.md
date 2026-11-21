# API pública

> **Em desenvolvimento.** Serviço gratuito, sem garantia de disponibilidade (sem SLA).
> Para uso intenso ou crítico, use a biblioteca diretamente na sua aplicação.

Base: **`https://efer.online/api/brasil-dev-kit/`**

| Método | Rota                           | O que faz                                                   |
| ------ | ------------------------------ | ----------------------------------------------------------- |
| GET    | `/`                            | Índice com as rotas e o link desta documentação             |
| GET    | `/v1/health`                   | Saúde da API                                                |
| GET    | `/v1/cep/{cep}`                | Endereço do CEP (`01310100` ou `01310-100`)                 |
| GET    | `/v1/ibge/ufs`                 | 27 UFs com região, ordenadas por nome                       |
| GET    | `/v1/ibge/ufs/{uf}/municipios` | Municípios da UF (sigla `SP` ou código `35`), por nome      |
| GET    | `/v1/cnpj/{cnpj}`              | Validação de formato e dígitos verificadores (sem consulta) |
| GET    | `/v1/feriados/{ano}`           | Feriados nacionais e pontos facultativos federais do ano    |
| GET    | `/v1/projeto/github`           | Resumo do repositório (estrelas, issues, PRs, commits, CI)  |

Exemplos:

```powershell
curl https://efer.online/api/brasil-dev-kit/v1/cep/01310-100
curl https://efer.online/api/brasil-dev-kit/v1/ibge/ufs/RR/municipios
curl https://efer.online/api/brasil-dev-kit/v1/cnpj/12ABC34501DE35
curl https://efer.online/api/brasil-dev-kit/v1/feriados/2026
```

```ts
const res = await fetch('https://efer.online/api/brasil-dev-kit/v1/cep/01310100');
const endereco = await res.json();
// { cep: '01310100', uf: 'SP', municipio: 'São Paulo', bairro: 'Bela Vista',
//   logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par',
//   codigoIbgeMunicipio: '3550308', fonte: { provedor: 'viacep', servicoOrigem: null } }
```

Os formatos de resposta são os mesmos da biblioteca (`Endereco`, `Uf`,
`Municipio`, `CnpjValidationResult`). CNPJ formatado com `/` deve ir sem a barra
(ex.: `12ABC34501DE35` ou `12.ABC.34501DE-35`), porque `/` separa a rota.

## Erros

Sempre JSON no formato `{ "erro": { "codigo": "...", "mensagem": "..." } }`.

| Status | `codigo`               | Quando                                                        |
| ------ | ---------------------- | ------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`     | CEP sem 8 dígitos, UF inexistente, URL malformada             |
| 404    | `NOT_FOUND`            | CEP não encontrado ou rota inexistente                        |
| 405    | `METHOD_NOT_ALLOWED`   | Método diferente de GET/HEAD/OPTIONS                          |
| 429    | `RATE_LIMIT`           | Mais de 10 req/s do mesmo IP (rajada de 30). `Retry-After: 1` |
| 502    | `PROVIDER_UNAVAILABLE` | Provedores de dados fora do ar. `Retry-After: 30`             |
| 503    | `BUSY`                 | Limite de consultas novas aos provedores. `Retry-After: 5`    |
| 503    | `SERVICE_UNAVAILABLE`  | A API em si está fora do ar (resposta do Nginx)               |
| 504    | `TIMEOUT`              | Todos os provedores excederam o tempo limite                  |

Exceção conhecida: um caminho com byte nulo (`%00`) é recusado pelo próprio
Nginx, antes de chegar na API, com 400 em HTML. A regra que trocaria essa página
por JSON ficaria no bloco do servidor compartilhado com outros sites, então ficou
de fora; o pedido é bloqueado do mesmo jeito.

## Cache

- Cabeçalho `X-Cache: HIT|MISS` nas rotas de CEP e IBGE.
- CEP encontrado: 7 dias no servidor; `Cache-Control: public, max-age=86400`.
- CEP inexistente: 6 horas no servidor (evita martelar os provedores com CEPs
  inválidos); `max-age=3600`.
- UFs e municípios: 24 horas.
- Erros de provedor **não** são cacheados.
- Pedidos simultâneos do mesmo CEP viram uma única consulta externa.

## Resumo do GitHub (`/v1/projeto/github`)

Alimenta o widget da [página do projeto](https://efer.online/projeto/brasil-dev-kit/).
Consulta a API pública do GitHub sem token (60 req/h por IP): cada atualização faz
5 chamadas e o resultado fica 10 minutos em cache (30 chamadas/h no máximo). Se o
GitHub falhar, a API devolve o último resumo bom com `desatualizado: true` e
`X-Cache: STALE`. A lista de issues do GitHub inclui PRs; aqui eles vêm separados.

## Procedência e privacidade

- CEP: ViaCEP e, em falha, BrasilAPI (ver [cep.md](cep.md)). UFs/municípios:
  API de Localidades do IBGE (ver [ibge.md](ibge.md)). CNPJ: cálculo local.
- Os logs da aplicação têm só contadores agregados a cada 5 minutos — sem IPs,
  sem CEPs consultados. O Nginx da VPS mantém o log de acesso padrão.
- CORS liberado (`Access-Control-Allow-Origin: *`), sem cookies nem autenticação.

## Capacidade (as contas)

Medições de 20/11/2026. VPS: 2 vCPUs, 3,9 GB de RAM, compartilhada com outros
serviços (cerca de 1,9 GB livres antes da API).

### Recursos do container

| Recurso      | Limite     | Por quê                                                              |
| ------------ | ---------- | -------------------------------------------------------------------- |
| CPU          | 0,5 vCPU   | ¼ da máquina; o resto continua para os outros serviços               |
| Memória      | 256 MB     | Uso medido: 81 MB parado, 83 MB após carga; folga para o cache cheio |
| Heap do Node | 160 MB     | Abaixo do limite do container, para o GC agir antes do OOM           |
| Processos    | 64         | Contém fork bombs                                                    |
| Disco        | só leitura | `/tmp` em memória com 8 MB                                           |
| Logs         | 15 MB × 3  | Mesmo padrão dos outros containers da VPS                            |

### Memória do cache

- Medido: **~406 bytes por CEP** em cache (Node 24).
- Teto: **50.000 CEPs** → ~20 MB (estimativa pessimista de 1 KB/CEP: ~50 MB).
- IBGE: 27 listas de municípios cabem em poucos MB (a maior, SP, tem 198 KB em JSON).
- Total esperado com o cache cheio: ~80 MB de base + até ~55 MB de cache ≈ 135 MB < 256 MB.

### Vazão

| Cenário (cache quente)          | Medido                                             |
| ------------------------------- | -------------------------------------------------- |
| Local, 1 núcleo de desktop      | ~16.000 req/s (p99 4 ms)                           |
| **VPS, container com 0,5 vCPU** | **~880 req/s** CEP, ~900 CNPJ, ~715 UFs (p50 6 ms) |

A carga na VPS rodou 5 s pelo loopback, com o gerador também limitado a 0,5 vCPU;
a load average subiu para 0,72 e nenhum erro ocorreu.

Com **10 req/s por IP**, ~88 clientes no limite máximo simultâneo saturariam a
CPU reservada. Uso real (consultas pontuais em formulários) fica muito abaixo.

### Provedores externos

O ViaCEP avisa que uso massivo pode bloquear o acesso — e a API consulta a
partir de **um único IP**. Por isso cada provedor (por host) tem um porteiro:

| Parâmetro            | Valor   | Conta                                                               |
| -------------------- | ------- | ------------------------------------------------------------------- |
| Ritmo sustentado     | 4 req/s | ≤ 345.600 consultas novas/dia por provedor no pior caso             |
| Rajada               | 8       | Absorve picos curtos sem fila                                       |
| Concorrência         | 4       | Latência média medida ~0,4 s → 4 conexões dão ~10 req/s de folga    |
| Fila                 | 16      | = ritmo × timeout (4 × 4 s): além disso, esperaria só para estourar |
| Timeout por provedor | 4 s     | Inclui o tempo na fila                                              |

Fila cheia → `503 BUSY` na hora (e a API tenta o próximo provedor de CEP antes).
Com o cache de 7 dias, CEPs repetidos não contam para esses limites.

### Prazos (do mais interno ao mais externo)

| Camada                         | Prazo | Relação                                                     |
| ------------------------------ | ----- | ----------------------------------------------------------- |
| Provedor (cada um)             | 4 s   | CEP com fallback: até 2 × 4 = 8 s                           |
| Nginx → API (`proxy_read`)     | 12 s  | > 8 s, para a API sempre conseguir responder o próprio erro |
| Node `requestTimeout`          | 15 s  | Rede de segurança para conexões lentas                      |
| Node `headersTimeout`          | 10 s  | Contém clientes que enviam cabeçalhos devagar               |
| Keep-alive Nginx → Node        | 4 s   | < 5 s do Node, para o Nginx não reutilizar conexão fechada  |
| Requisições simultâneas na API | 256   | Acima disso, `503` imediato em vez de enfileirar            |

### IP real atrás do Cloudflare

O Nginx só aceita o cabeçalho `CF-Connecting-IP` quando a conexão vem das faixas
oficiais do Cloudflare (<https://www.cloudflare.com/ips/>); fora delas usa o IP da
conexão. Assim o limite é por visitante, e não por servidor do Cloudflare, e o
cabeçalho não pode ser falsificado por quem acessa a origem direto. **As faixas
precisam ser revisadas se o Cloudflare mudar a lista.**

## Rodando localmente

```powershell
pnpm build
node dist-server/server.js   # http://127.0.0.1:8795
```

Variáveis de ambiente (todas opcionais): `HOST`, `PORT`, `MAX_IN_FLIGHT`,
`REQUEST_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`, `KEEP_ALIVE_TIMEOUT_MS`,
`UPSTREAM_TIMEOUT_MS`, `CEP_CACHE_MAX_ENTRIES`, `CEP_CACHE_TTL_FOUND_MS`,
`CEP_CACHE_TTL_NOT_FOUND_MS`, `IBGE_CACHE_TTL_MS`, `UPSTREAM_MAX_CONCURRENT`,
`UPSTREAM_MAX_QUEUE`, `UPSTREAM_RATE_PER_SECOND`, `UPSTREAM_BURST`.

Deploy: ver [deploy.md](deploy.md).

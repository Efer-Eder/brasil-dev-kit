<div align="center">

<a href="https://efer.online/projeto/brasil-dev-kit/">
  <img src="https://raw.githubusercontent.com/Efer-Eder/brasil-dev-kit/main/docs/assets/readme/hero-pt.gif" width="880" alt="Brasil Dev Kit: dados públicos brasileiros com tipos, fonte e erros previsíveis">
</a>

<br><br>

[![CI](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Efer-Eder/brasil-dev-kit/actions/workflows/ci.yml)
[![API](https://img.shields.io/website?url=https%3A%2F%2Fefer.online%2Fapi%2Fbrasil-dev-kit%2Fv1%2Fhealth&label=API&up_message=online&down_message=offline&style=flat-square)](https://efer.online/api/brasil-dev-kit/)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-7377F0?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.12-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](package.json)
[![Estrelas](https://img.shields.io/github/stars/Efer-Eder/brasil-dev-kit?style=flat-square&color=7377F0)](https://github.com/Efer-Eder/brasil-dev-kit/stargazers)

**[Página do projeto](https://efer.online/projeto/brasil-dev-kit/)** ·
**[Testar a API](https://efer.online/projeto/brasil-dev-kit/#api)** ·
[Documentação](docs/) ·
[Roadmap](ROADMAP.md) ·
[English](README.en.md)

</div>

---

CEP, UFs e municípios do IBGE, bancos (código COMPE e ISPB), DDD, feriados
nacionais e validação de CNPJ (inclusive o **alfanumérico**) num **SDK TypeScript**
e numa **API HTTP pública**. Cada
resposta diz de onde veio o dado, todo erro tem um código estável e nada depende
de chave paga.

> [!NOTE]
> **v0.1.0 no npm** (`npm install brasil-dev-kit`), com CEP, IBGE, feriados e CNPJ.
> Bancos e DDD já estão na API pública e no código, e entram no pacote na **0.2.0**;
> até lá, use a partir do código. A API é gratuita, sem garantia de disponibilidade.
> Este README só mostra o que já existe; o resto está no [ROADMAP](ROADMAP.md).

## Experimente agora

Sem instalar nada, direto do terminal:

<a href="https://raw.githubusercontent.com/Efer-Eder/brasil-dev-kit/main/docs/assets/readme/terminal-pt.gif"><img src="https://raw.githubusercontent.com/Efer-Eder/brasil-dev-kit/main/docs/assets/readme/terminal-pt.gif" width="880" alt="Terminal consultando a API pública: CEP, feriados de 2026 e CNPJ alfanumérico"></a>

```powershell
curl https://efer.online/api/brasil-dev-kit/v1/cep/01310-100
curl https://efer.online/api/brasil-dev-kit/v1/feriados/2026
curl https://efer.online/api/brasil-dev-kit/v1/ibge/ufs/SP/municipios
curl https://efer.online/api/brasil-dev-kit/v1/cnpj/12ABC34501DE35
curl https://efer.online/api/brasil-dev-kit/v1/bancos/260
curl https://efer.online/api/brasil-dev-kit/v1/ddd/61
```

Prefere clicar? A [página do projeto](https://efer.online/projeto/brasil-dev-kit/)
tem um playground que chama a API ao vivo.

## O que tem aqui

| Módulo        | O que faz                                                              | De onde vem o dado                                  | Rede? |
| ------------- | ---------------------------------------------------------------------- | --------------------------------------------------- | ----- |
| **CEP**       | Endereço normalizado, com o provedor que respondeu                     | ViaCEP, com fallback para BrasilAPI                 | sim   |
| **IBGE**      | 27 UFs e os municípios de cada uma, com divisões regionais             | API de Localidades do IBGE                          | sim   |
| **Bancos**    | Instituição pelo código COMPE ou ISPB, e a lista completa              | Participantes do STR, Banco Central (diária)        | sim   |
| **DDD**       | Municípios e UFs de cada DDD, e o DDD de cada município                | PGCN da Anatel (tabela embutida)                    | não   |
| **Feriados**  | Feriados nacionais e pontos facultativos federais do ano               | Leis federais e portarias anuais do governo federal | não   |
| **CNPJ**      | Formato e dígitos verificadores, numérico e alfanumérico               | Manual oficial de DV (IN RFB nº 2.229/2024)         | não   |
| **Core HTTP** | Timeout, `AbortSignal`, retries com backoff, cache TTL e erros tipados |                                                     |       |

Detalhes e fontes de cada módulo: [CEP](docs/cep.md) · [IBGE](docs/ibge.md) ·
[Bancos](docs/bancos.md) · [DDD](docs/ddd.md) · [Feriados](docs/feriados.md) ·
[CNPJ](docs/cnpj.md).

## No seu código

<a href="https://raw.githubusercontent.com/Efer-Eder/brasil-dev-kit/main/docs/assets/readme/sdk-pt.gif"><img src="https://raw.githubusercontent.com/Efer-Eder/brasil-dev-kit/main/docs/assets/readme/sdk-pt.gif" width="880" alt="Editor com exemplo em TypeScript e a saída real ao lado"></a>

```powershell
npm install brasil-dev-kit
```

Para bancos e DDD antes da 0.2.0, use a partir do código: `git clone`, `pnpm install`
e `pnpm build`.

```ts
import { createBrasilDevKit, NotFoundError } from 'brasil-dev-kit';

// Opções comuns valem para todos os módulos; cada um pode sobrescrever as suas.
const br = createBrasilDevKit({ timeoutMs: 8000, cacheTtlMs: 60_000 });

try {
  const endereco = await br.cep.lookup('01310-100');
  // { uf: 'SP', municipio: 'São Paulo', logradouro: 'Avenida Paulista', fonte: { provedor: 'viacep' }, ... }
} catch (error) {
  if (error instanceof NotFoundError) console.log('CEP não existe');
}

await br.ibge.listMunicipios('RR'); // 15 municípios, ordenados por nome
br.feriados.getNacionais(2026).origem; // 'portaria': feriados + pontos facultativos oficiais
br.feriados.isFeriado('2026-11-20'); // true
br.cnpj.validate('12.ABC.345/01DE-35').kind; // 'alphanumeric'
(await br.bancos.getByCodigo('260'))?.nomeReduzido; // 'NU PAGAMENTOS - IP'
br.ddd.get('61')?.ufs; // ['DF', 'GO']
```

Falha passageira (rede, 5xx, timeout, 429) é repetida com backoff exponencial e
jitter. Ajuste por módulo, por exemplo
`createBrasilDevKit({ retry: { retries: 3 }, cep: { providers: ['brasilapi'] } })`.
Cada módulo também pode ser usado sozinho (`createCepClient`, `createIbgeClient`,
`createBancosClient`, `getDdd`, `getFeriadosNacionais`, `validateCnpj`…).

> [!IMPORTANT]
> A validação de CNPJ confere **apenas formato e dígitos verificadores**. Ela não
> diz se a empresa existe ou está regular na Receita Federal.

## API pública

Base: **`https://efer.online/api/brasil-dev-kit/`**

| Rota                               | Devolve                            |
| ---------------------------------- | ---------------------------------- |
| `GET /v1/cep/{cep}`                | Endereço normalizado               |
| `GET /v1/ibge/ufs`                 | UFs com região                     |
| `GET /v1/ibge/ufs/{uf}/municipios` | Municípios da UF (sigla ou código) |
| `GET /v1/feriados/{ano}`           | Feriados e pontos facultativos     |
| `GET /v1/cnpj/{cnpj}`              | Validação de CNPJ                  |
| `GET /v1/bancos/{codigo}`          | Banco pelo código COMPE            |
| `GET /v1/bancos/ispb/{ispb}`       | Banco pelo ISPB                    |
| `GET /v1/ddd/{ddd}`                | Municípios e UFs do DDD            |
| `GET /v1/health`                   | Saúde da API                       |

| Limite               | Valor                                                     |
| -------------------- | --------------------------------------------------------- |
| Requisições por IP   | 10/s, rajada de 30 (acima disso: `429` com `Retry-After`) |
| Cache de CEP         | 7 dias (inexistente: 6 h)                                 |
| Timeout por provedor | 4 s                                                       |
| Vazão medida         | ~880 req/s com cache quente, em meia CPU                  |

Erros sempre em JSON: `{ "erro": { "codigo": "NOT_FOUND", "mensagem": "..." } }`.
Rotas, códigos de erro e as contas de capacidade em [docs/api.md](docs/api.md).

## Erros tipados

| Classe                     | `code`                 | Quando                                        |
| -------------------------- | ---------------------- | --------------------------------------------- |
| `ValidationError`          | `VALIDATION_ERROR`     | Entrada inválida (nenhuma requisição é feita) |
| `NotFoundError`            | `NOT_FOUND`            | O dado não existe no provedor                 |
| `RateLimitError`           | `RATE_LIMIT`           | Provedor limitou (traz `retryAfterMs`)        |
| `TimeoutError`             | `TIMEOUT`              | Passou do tempo limite                        |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | Rede, 5xx ou resposta fora do formato         |
| `HttpError`                | `HTTP_ERROR`           | Outro status HTTP inesperado                  |

Todos herdam de `BrasilDevKitError`.

## Compatibilidade e limitações

- **Testado em Node.js 22 e 24**, em Linux e Windows (CI a cada mudança). Usa `fetch`,
  `AbortSignal.any` e `structuredClone`; navegadores e outros runtimes com essas APIs
  podem funcionar, mas **não são testados** (no navegador, CEP e IBGE também dependem
  do CORS de cada provedor).
- Pacote ESM + CommonJS com tipos, sem dependências de runtime, publicado no npm com
  proveniência (v0.1.0; bancos e DDD entram na 0.2.0).
- CNPJ: só formato e dígitos verificadores, sem consulta cadastral.
- CEP: dados do ViaCEP e da BrasilAPI, que podem divergir e limitar uso massivo.
- Feriados: só nacionais e pontos facultativos federais; estaduais e municipais não.
- Bancos: só os participantes do STR; a lista do Pix não tem fonte estável e ficou de fora.
- DDD: tabela embutida com a versão do PGCN de 23/11/2026 (`PGCN_VERSAO`); mudanças
  da Anatel entram numa nova versão do pacote.
- API pública: gratuita e sem SLA. Para uso intenso, rode o SDK no seu serviço.

## Rodando localmente

Requisitos: **Node.js ≥ 22.12**, Git e **pnpm 12** (sem pnpm global, use
`npx pnpm@12.21.0`).

```powershell
pnpm install
pnpm run check               # lint + typecheck + testes + build
pnpm test:integration        # opcional: testa contra as APIs reais
pnpm test:package            # instala o .tgz num projeto consumidor isolado
node dist-server/server.js   # API local em http://127.0.0.1:8795
node examples/node/cep.mjs 01310-100
```

Os GIFs deste README são gerados por [`scripts/readme-gifs/make_gifs.py`](scripts/readme-gifs/make_gifs.py)
com saídas reais da API e do SDK.

## Documentação

- [API pública: rotas, erros e capacidade](docs/api.md) · [OpenAPI](docs/openapi.json) · [Deploy](docs/deploy.md)
- [Como publicar no npm](docs/release.md) · [Guide in English](docs/en/README.md)
- [CEP](docs/cep.md) · [IBGE](docs/ibge.md) · [Bancos](docs/bancos.md) · [DDD](docs/ddd.md) · [Feriados](docs/feriados.md) · [CNPJ](docs/cnpj.md)
- [Arquitetura](docs/architecture.md) · [Decisões (ADRs)](docs/adr/)
- [Progresso](PROGRESS.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

## Contribuindo

Issues e pull requests são bem-vindos. Leia o [CONTRIBUTING](CONTRIBUTING.md): toda
integração cita a documentação oficial e vem com testes contra respostas reais.
Vulnerabilidades: [SECURITY](SECURITY.md).

---

<div align="center">

[MIT](LICENSE) © Efer Eder · feito em [efer.online](https://efer.online)

</div>

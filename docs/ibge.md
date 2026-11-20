# UFs e municípios (IBGE)

`createIbgeClient()` consulta a **API de Localidades do IBGE** (fonte oficial)
e devolve UFs e municípios normalizados.

```ts
import { createIbgeClient } from 'brasil-dev-kit';

const ibge = createIbgeClient({ timeoutMs: 10_000 });

const ufs = await ibge.listUfs();
// [{ codigoIbge: '12', sigla: 'AC', nome: 'Acre',
//    regiao: { codigoIbge: '1', sigla: 'N', nome: 'Norte' } }, …] (27 itens, por nome)

const municipios = await ibge.listMunicipios('RR'); // ou listMunicipios(14)
// [{ codigoIbge: '1400050', nome: 'Alto Alegre', uf: 'RR',
//    microrregiao: { codigoIbge: '14001', nome: 'Boa Vista' },
//    mesorregiao: { codigoIbge: '1401', nome: 'Norte de Roraima' },
//    regiaoImediata: { codigoIbge: '140001', nome: 'Boa Vista' },
//    regiaoIntermediaria: { codigoIbge: '1401', nome: 'Boa Vista' } }, …]
```

`resolveUf('sp')` → `{ sigla: 'SP', codigoIbge: '35' }` e `UF_CODES` funcionam
sem requisições.

## Fonte

- Documentação oficial: <https://servicodados.ibge.gov.br/api/docs/localidades>
  (consultada em 20/11/2026).
- Endpoints usados (v1):
  - `GET https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome`
  - `GET https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios?orderBy=nome`
- A documentação não informa limites de uso nem termos específicos na página
  da API. Use com moderação e prefira guardar em cache dados que mudam pouco
  (a lista de municípios muda raramente).

## Comportamentos e decisões

- **UF por código:** os exemplos da documentação usam o código numérico da UF.
  O SDK aceita sigla ou código, valida com uma tabela fixa das 27 UFs e chama a
  API com o código. Um teste confere a tabela contra a resposta real de
  `/estados`.
- **UF inexistente:** a API devolve HTTP 200 com lista vazia (verificado; não
  documentado). O SDK rejeita a UF antes com `ValidationError`, sem requisição.
  Se uma UF válida vier vazia, o SDK lança `ProviderUnavailableError`.
- **Códigos como texto:** `codigoIbge` é `string` (ex.: `'3550308'`), igual ao
  campo `codigoIbgeMunicipio` do módulo de CEP, para comparar direto.
- **Microrregião pode ser `null`:** em 20/11/2026, "Boa Esperança do Norte"
  (MT, 5101837) vinha sem microrregião/mesorregião — divisões de 1989 que não
  incluem municípios criados depois. `regiaoImediata` e `regiaoIntermediaria`
  (divisão vigente desde 2017) vieram preenchidas para todos os 5571 municípios.
- **Consistência:** o SDK confere que cada município pertence à UF pedida (os 2
  primeiros dígitos do código são a UF, o que valeu para os 5571 municípios).
- A visão `view=nivelado` da API não é usada.

## Testes

- Unitários (`tests/unit/modules/ibge.test.ts`) com respostas reais gravadas em
  `tests/fixtures/ibge/` (RR, MT, DF, lista de UFs e UF inexistente).
- Integração (`pnpm test:integration`) contra a API real, fora do CI obrigatório.

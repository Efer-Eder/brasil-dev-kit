# DDD (Códigos Nacionais da Anatel)

Municípios e UFs de cada DDD, e o DDD de cada município, a partir do Plano Geral
de Códigos Nacionais (PGCN) publicado pela Anatel. **Não usa a rede:** a tabela vem
embutida no pacote.

```ts
import { getDdd, getDddPorMunicipio, isDddValido, listDdds } from 'brasil-dev-kit';

getDdd('61');
// { ddd: '61', ufs: ['DF', 'GO'], municipios: [{ codigoIbge: '5300108', nome: 'Brasília', uf: 'DF' }, ...],
//   fonte: { provedor: 'anatel', servicoOrigem: 'pgcn', atualizadoEm: '2026-11-23', url: '...' } }
getDdd('(011)'); // aceita parênteses e o zero de discagem
getDdd('29'); // null: formato válido, sem uso
getDddPorMunicipio('3550308'); // { ddd: '11', municipio: { nome: 'São Paulo', ... } }
listDdds({ uf: 'SC' }); // 42, 47, 48 e 49 (42, 47 e 49 também atendem PR)
isDddValido('52'); // false
```

Formato inválido (fora de 2 dígitos de 1 a 9, ou código IBGE sem 7 dígitos) lança
`ValidationError`.

## Fonte

- Conjunto oficial: "Plano Geral de Códigos Nacionais (PGCN)" no dados.gov.br:
  <https://dados.gov.br/dados/conjuntos-dados/codigos-nacionais-cn>.
- Arquivo: <https://www.anatel.gov.br/dadosabertos/paineis_de_dados/areastarifarias/pgcn.zip>
  (um CSV, `Codigos_Nacionais.csv`).
- **Licença:** "Other (Public Domain)", conforme o dados.gov.br.
- Base regulatória: Resolução Anatel nº 749/2022 (Regulamento de Numeração). O PGCN
  foi republicado pelo Despacho Decisório nº 12/2022/PRRE/SPR; mudanças posteriores
  saem por despacho, registrado em cada linha do arquivo.
- Versão embutida: arquivo de **23/11/2026**, 5571 municípios (o mesmo total da API
  de Localidades do IBGE) e 67 DDDs. A versão fica em `PGCN_VERSAO` (data e sha256).

## Comportamentos e decisões

- **Tabela embutida em vez de consulta:** o arquivo oficial é um ZIP de 62 kB que
  muda poucas vezes por ano; baixar e descompactar a cada uso não compensa. A tabela
  (`src/modules/ddd/dados.ts`) é gerada pelo script `pnpm data:ddd`, que baixa o
  arquivo oficial, valida cada linha e regrava a tabela e a fixture.
- **Tamanho:** a tabela tem ~119 kB de texto (nomes dos 5571 municípios) e fez o
  pacote npm passar de ~93 kB para ~320 kB compactado (ESM, CJS e source maps).
  Ela só entra no bundle de quem importa DDD (`sideEffects: false`): medido com
  esbuild, um bundle só com `validateCnpj` tem 6,4 kB e um só com `getDdd`, 130 kB.
- **Só o vigente:** o arquivo também traz 14 linhas históricas (`VIGENTE=Não`), que
  ficam de fora.
- **DDD que cruza a divisa:** 42, 47 e 49 atendem PR e SC; 61 atende DF e GO. Por
  isso `ufs` é uma lista.
- **Desatualização:** o teste de integração compara a tabela com o arquivo publicado
  no dia e falha se algum município mudou de DDD.

## Testes

- Unitários (`tests/unit/modules/ddd.test.ts`): a tabela embutida bate, município a
  município, com o ZIP oficial gravado em `tests/fixtures/ddd/`.
- Integração (`pnpm test:integration`) contra o arquivo publicado pela Anatel.

# Fixtures de DDD

Arquivo **real** da Anatel, gravado em 26/11/2026 com `curl`, sem alterações.

| Arquivo           | Origem                                                                             |
| ----------------- | ---------------------------------------------------------------------------------- |
| `anatel/pgcn.zip` | <https://www.anatel.gov.br/dadosabertos/paineis_de_dados/areastarifarias/pgcn.zip> |

- `Last-Modified: Mon, 23 Nov 2026 11:30:05 GMT`, 62770 bytes, sha256
  `25892b568d9e8ec642f966729acb95bd6b55d9fef11c7e82a9ba3451da1681c8`.
- Contém só `Codigos_Nacionais.csv` (555081 bytes): UTF-8 com BOM, separador `;`,
  quebra CRLF. Colunas: `CO_MUNICIPIO;SG_UF;NO_UF;NO_MUNICIPIO;CN;DT_INICIO_VIGENCIA;DT_FIM_VIGENCIA;DE_ALTERACAO_REGULAMENTAR;VIGENTE`.
- 5585 linhas: 5571 vigentes (um por município, mesmo total da API de Localidades do
  IBGE) e 14 históricas (`VIGENTE=Não`, com data de fim).

Conjunto oficial: "Plano Geral de Códigos Nacionais (PGCN)" no dados.gov.br
(<https://dados.gov.br/dados/conjuntos-dados/codigos-nacionais-cn>), licença
**Other (Public Domain)**. Base regulatória: Resolução Anatel nº 749/2022
(Regulamento de Numeração); o PGCN foi republicado pelo Despacho Decisório
nº 12/2022/PRRE/SPR e as mudanças posteriores saem por despacho (a coluna
`DE_ALTERACAO_REGULAMENTAR` diz qual).

A tabela `src/modules/ddd/dados.ts` é gerada deste arquivo por `pnpm data:ddd`
(ou `node scripts/ddd/generate.mjs --zip tests/fixtures/ddd/anatel/pgcn.zip`).

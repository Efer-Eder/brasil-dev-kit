# Fixtures de bancos

Arquivo **real** do Banco Central do Brasil, gravado em 26/11/2026 com `curl`, sem
alterações (`Last-Modified: Thu, 26 Nov 2026 09:00:37 GMT`, 46578 bytes).

| Arquivo                    | Origem                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| `bcb/ParticipantesSTR.csv` | <https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv> |

Conjunto oficial: "Lista de Participantes do STR"
(<https://dadosabertos.bcb.gov.br/dataset/lista-de-participantes-do-str>), publicado
pelo BCB/Deban e atualizado diariamente. Dicionário de dados:
<https://www.bcb.gov.br/conteudo/dadosabertos/BCBDeban/Metadados_participantes.pdf>.

**Licença dos dados:** Open Data Commons Open Database License (ODbL), indicada no
portal de dados abertos do Banco Central. Este arquivo é uma cópia da base para
testes e continua sob ODbL, separado da licença MIT do código. Fonte: Banco Central
do Brasil. Ele não vai no pacote npm.

Observações verificadas nesta data:

- UTF-8 com BOM, separador vírgula, quebra `\n`, campos com vírgula entre aspas.
- 473 participantes; ISPB sempre com 8 dígitos (Banco do Brasil = `00000000`).
- `Número_Código` vem `n/a` em 7 linhas (Selic, Bacen, CIP, CERC, CSDBR) e `0` em
  3 (sistemas da B3): o SDK devolve `codigo: null` nos dois casos.

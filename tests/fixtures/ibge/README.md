# Fixtures do IBGE

Respostas **reais** da API de Localidades do IBGE (v1), gravadas em 20/11/2026
com `curl`, sem alterações. Documentação:
<https://servicodados.ibge.gov.br/api/docs/localidades>.

| Arquivo                               | Requisição (`https://servicodados.ibge.gov.br/api/v1/localidades/…`) | Itens |
| ------------------------------------- | -------------------------------------------------------------------- | ----- |
| `api/estados-orderby-nome.json`       | `estados?orderBy=nome`                                               | 27    |
| `api/municipios-14-orderby-nome.json` | `estados/14/municipios?orderBy=nome` (RR)                            | 15    |
| `api/municipios-51-orderby-nome.json` | `estados/51/municipios?orderBy=nome` (MT)                            | 142   |
| `api/municipios-53-orderby-nome.json` | `estados/53/municipios?orderBy=nome` (DF)                            | 1     |
| `api/municipios-99-vazio.json`        | `estados/99/municipios?orderBy=nome` (UF inexistente)                | 0     |

Observações verificadas nesta data:

- UF inexistente devolve **HTTP 200 com lista vazia**, não 404.
- Em MT, o município "Boa Esperança do Norte" (5101837) vem com
  `"microrregiao": null`; foi o único caso entre os 5571 municípios do país.
- Em todos os 5571 municípios, os 2 primeiros dígitos do código são o código da UF.

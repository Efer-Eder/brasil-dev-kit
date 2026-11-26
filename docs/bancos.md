# Bancos (participantes do STR)

Consulta de instituições pelo **código de compensação** (COMPE, 3 dígitos) e pelo
**ISPB** (8 dígitos), a partir da lista oficial de participantes do STR publicada
pelo Banco Central.

```ts
import { createBancosClient } from 'brasil-dev-kit';

const bancos = createBancosClient(); // cache de 1 hora por padrão

await bancos.getByCodigo('260');
// {
//   ispb: '18236120', codigo: '260', nomeReduzido: 'NU PAGAMENTOS - IP',
//   nome: 'NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO', participaCompe: false,
//   acessoPrincipal: 'RSFN', inicioOperacao: '2017-10-10',
//   fonte: { provedor: 'bcb', servicoOrigem: 'participantes-str', url: '...' }
// }
await bancos.getByIspb('0'); // Banco do Brasil (zeros à esquerda podem faltar)
await bancos.getByCodigo(1); // mesmo resultado: '1', 1 e '001' são o mesmo código
await bancos.list(); // os 473 participantes (em 26/11/2026)
```

Código ou ISPB com formato inválido lança `ValidationError` antes de usar a rede;
formato válido que não está na lista devolve `null`.

## Fonte

- Conjunto oficial: "Lista de Participantes do STR", BCB/Deban, no portal de dados
  abertos: <https://dadosabertos.bcb.gov.br/dataset/lista-de-participantes-do-str>.
- Arquivo lido: <https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv>.
- Dicionário de dados: <https://www.bcb.gov.br/conteudo/dadosabertos/BCBDeban/Metadados_participantes.pdf>
  (a lista é "atualizada diariamente").
- **Licença dos dados:** ODbL (Open Data Commons Open Database License), indicada no
  portal. O SDK baixa o arquivo em tempo de execução; a cópia usada nos testes fica
  em `tests/fixtures/bancos/` com a atribuição e não vai no pacote npm.

## Comportamentos e decisões

- **Arquivo inteiro, uma leitura:** não existe consulta por código; a lista vem num
  CSV só (46 kB). O cliente guarda a lista em memória por 1 hora
  (`cacheTtlMs`, `0` desliga) e as buscas por código e ISPB reaproveitam a leitura.
- **Sem código:** participantes como Selic, Bacen, CIP e sistemas da B3 aparecem
  com `n/a` ou `0` no arquivo; o SDK devolve `codigo: null`.
- **Validação estrita:** cabeçalho diferente, linha com colunas a mais ou a menos,
  ISPB fora de 8 dígitos ou data fora do formato viram `ProviderUnavailableError`
  (o SDK prefere falhar a devolver dado errado se o formato mudar).
- **Formato verificado em 26/11/2026:** UTF-8 com BOM, separador vírgula, campos com
  vírgula entre aspas, datas `DD/MM/AAAA` (o SDK devolve `AAAA-MM-DD`).
- **Participantes do Pix ficaram de fora:** o Banco Central publica a lista do Pix
  num CSV com a data no nome do arquivo (só o do dia fica no ar) e sem entrada no
  portal de dados abertos. Sem URL estável e documentada, não entra (ver ROADMAP).

## Testes

- Unitários (`tests/unit/modules/bancos.test.ts`) com o arquivo real gravado.
- Integração (`pnpm test:integration`) contra o arquivo do Banco Central.

# Feriados nacionais

Calendário de feriados nacionais e pontos facultativos federais, a partir das
leis federais e das portarias anuais do governo federal. Funciona offline: não
faz requisições.

```ts
import { getFeriadosNacionais, isFeriadoNacional, buscarDataNacional } from 'brasil-dev-kit';

const cal = getFeriadosNacionais(2026);
// { ano: 2026, origem: 'portaria', fontes: [{ descricao: 'Portaria MGI nº 11.460/2025…', url }],
//   datas: [{ data: '2026-01-01', nome: 'Confraternização Universal', tipo: 'feriado_nacional',
//             periodo: 'dia_inteiro', baseLegal: 'Portaria MGI nº 11.460/2025', observacao: null }, …],
//   avisos: […] }

isFeriadoNacional('2026-11-20'); // true
isFeriadoNacional('2026-02-16'); // false — Carnaval é ponto facultativo
buscarDataNacional('2026-02-18'); // { nome: 'Quarta-Feira de Cinzas', tipo: 'ponto_facultativo', periodo: 'ate_14h', … }
```

Pela API pública: `GET https://efer.online/api/brasil-dev-kit/v1/feriados/2026`.

## Duas origens, sempre indicadas em `origem`

| `origem`   | Anos               | O que contém                                                                 |
| ---------- | ------------------ | ---------------------------------------------------------------------------- |
| `portaria` | 2025 e 2026        | Calendário oficial completo: feriados nacionais e pontos facultativos        |
| `lei`      | 2024 e 2027 a 2099 | Só os feriados nacionais previstos em lei, com aviso de que falta a portaria |

Quando a portaria de um ano for publicada e conferida, ela entra na base e o ano
passa a `portaria`.

## Fontes (consultadas em 20/11/2026)

Leis (texto compilado no Planalto):

- [Lei nº 662/1949](https://www.planalto.gov.br/ccivil_03/leis/l0662.htm), art. 1º
  com redação da Lei nº 10.607/2002: 1/1, 21/4, 1/5, 7/9, 2/11, 15/11 e 25/12.
- [Lei nº 6.802/1980](https://www.planalto.gov.br/ccivil_03/leis/l6802.htm): 12/10.
- [Lei nº 14.759/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm)
  (DOU de 22/12/2023): 20/11, Dia Nacional de Zumbi e da Consciência Negra.
- [Lei nº 9.093/1995](https://www.planalto.gov.br/ccivil_03/leis/l9093.htm), art. 2º:
  feriados religiosos são declarados em lei municipal, até quatro, contando a
  Sexta-Feira da Paixão.

Portarias do Ministério da Gestão e da Inovação em Serviços Públicos (MGI):

- 2025: Portaria MGI nº 9.783, de 27/12/2024 (DOU de 30/12/2024) —
  [divulgação oficial](https://www.gov.br/gestao/pt-br/assuntos/noticias/2024/dezembro/gestao-divulga-calendario-de-feriados-e-pontos-facultativos-em-2025).
- 2026: Portaria MGI nº 11.460, de 29/12/2025 (DOU de 30/12/2025) —
  [divulgação oficial](https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026).

## Pontos de atenção

- **Paixão de Cristo:** as portarias federais a listam como feriado nacional,
  mas a Lei nº 9.093/1995 a trata como feriado religioso municipal. O SDK segue
  a portaria (`feriado_nacional`) e explica a diferença em `observacao`. Nos anos
  `lei`, a data é calculada pela Páscoa.
- **Pontos facultativos** valem para a administração pública federal. Empresas e
  outros entes podem adotar regras próprias.
- **Períodos parciais:** `ate_14h` (Quarta-Feira de Cinzas) e `apos_13h`
  (vésperas de Natal e Ano Novo).
- **2025:** a portaria fixa o Dia do Servidor em 28/10, "a ser comemorado dia 27";
  a base usa 27/10 e registra isso em `observacao`.
- **Fora do escopo:** feriados estaduais (data magna) e municipais.
- Anos aceitos: 2024 (primeiro com o 20/11 nacional) a 2099.

## Verificações automáticas

`tests/unit/modules/feriados.test.ts` confere, para cada portaria transcrita:

- que todos os feriados de data fixa da lei aparecem como `feriado_nacional`;
- que Carnaval, Quarta-Feira de Cinzas, Paixão de Cristo e Corpus Christi batem
  com a Páscoa calculada (Páscoa − 48/−47, −46, −2 e +60 dias);
- quantidades, ordem e ausência de datas repetidas.

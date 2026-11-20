# Validação de CNPJ

> A validação é **estrutural**: confere formato e dígitos verificadores.
> Ela **não** atesta que o CNPJ existe, está ativo ou regular na Receita Federal.

## Fontes

- Instrução Normativa RFB nº 2.229, de 15/10/2024 — institui o CNPJ alfanumérico.
- Serpro/Receita Federal — manual "Cálculo dos dígitos verificadores de CNPJ
  alfanumérico", publicado na página de documentos técnicos do CNPJ:
  <https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj>
- Receita Federal — página do programa CNPJ alfanumérico:
  <https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico>
- Serpro — notícia de 21/10/2024 sobre a mudança:
  <https://www.serpro.gov.br/menu/noticias/noticias-2024/cnpj-alfanumerico>

Consultado em 20/11/2026.

## Regras implementadas (conforme o manual)

1. O CNPJ tem 14 caracteres: os **12 primeiros** podem ser dígitos `0-9` ou
   letras maiúsculas `A-Z`; os **2 últimos** (dígitos verificadores) são sempre
   numéricos.
2. Cada caractere vale o seu código ASCII menos 48: `0`→0 … `9`→9, `A`→17,
   `B`→18 … `Z`→42.
3. Pesos de 2 a 9 são distribuídos da direita para a esquerda, recomeçando em 2
   depois do 9.
4. Soma-se valor × peso. Se o resto da divisão por 11 for 0 ou 1, o DV é 0;
   senão, é 11 − resto.
5. O segundo DV repete o cálculo com os 13 caracteres (base + primeiro DV).

Exemplo oficial do manual: base `12ABC34501DE` → DVs `35` → `12.ABC.345/01DE-35`.
Esse exemplo é um teste automatizado em `tests/unit/modules/cnpj.test.ts`.

CNPJs numéricos existentes continuam válidos e seguem o mesmo cálculo (para
dígitos, ASCII − 48 é o próprio dígito). Um teste compara a implementação com o
cálculo numérico tradicional em 2000 bases.

## Decisões desta biblioteca (não vêm do manual)

- **Normalização:** pontos, barras, hífens e espaços são removidos e letras
  minúsculas são convertidas para maiúsculas antes de validar.
- **Caracteres repetidos:** valores com os 14 caracteres iguais
  (ex.: `00000000000000`) passam no cálculo do DV, mas são rejeitados com o
  motivo `repeated_characters`, por serem tipicamente valores de preenchimento.

## API

```ts
import { validateCnpj, isValidCnpj, formatCnpj, computeCnpjCheckDigits } from 'brasil-dev-kit';

validateCnpj('12.ABC.345/01DE-35');
// { valid: true, normalized: '12ABC34501DE35', formatted: '12.ABC.345/01DE-35', kind: 'alphanumeric' }

validateCnpj('12ABC34501DE36');
// { valid: false, reason: 'invalid_check_digits', message: 'Dígitos verificadores não conferem.' }

isValidCnpj('11222333000181'); // true
formatCnpj('11222333000181'); // '11.222.333/0001-81' (lança ValidationError se inválido)
computeCnpjCheckDigits('12ABC34501DE'); // '35'
```

Motivos de falha: `empty`, `invalid_length`, `invalid_characters`,
`repeated_characters`, `invalid_check_digits`.

# ADR 0001 — Biome para lint e formatação

- **Status:** aceito
- **Data:** 2026-11-20

## Contexto

O projeto precisa de lint e formatação consistentes, rodando igual no Windows
(máquina principal do mantenedor) e no CI (`windows-latest` e `ubuntu-latest`).
As opções avaliadas foram ESLint + Prettier e Biome.

## Decisão

Usar **Biome** (versão fixada em `package.json`) como linter e formatador únicos.

## Motivos

- **Uma ferramenta, um arquivo de configuração** (`biome.json`) em vez de ESLint,
  Prettier, `typescript-eslint` e plugins de integração entre eles.
- **Menos dependências** no `node_modules`, o que reduz superfície de cadeia de
  suprimentos para uma biblioteca pequena.
- **Rápido e multiplataforma**: binário nativo, sem diferenças de comportamento
  entre Windows e Linux; finais de linha forçados para LF (`.editorconfig`,
  `.gitattributes` e `biome.json`).
- As regras recomendadas cobrem o que importa aqui (ex.: `noExplicitAny`,
  imports não usados, organização de imports).

## Consequências

- Regras de lint com checagem de tipos (como as do `typescript-eslint` com
  `parserOptions.project`) não estão disponíveis; compensamos com `tsc --noEmit`
  em modo `strict` (script `typecheck`) no CI.
- O script `lint` usa `--error-on-warnings`, então avisos também quebram o CI.
- Se no futuro alguma regra essencial só existir no ESLint, esta decisão será
  revista em um novo ADR.

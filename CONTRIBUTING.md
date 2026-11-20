# Contribuindo com o Brasil Dev Kit

Obrigado pelo interesse! Este guia explica como preparar o ambiente e enviar mudanças.

## Ambiente

- Node.js ≥ 22.12 e Git.
- pnpm 12, na versão fixada em `package.json` (`packageManager`). Sem
  instalação global, use `npx pnpm@12.21.0 <comando>`.
- O pnpm 12 recusa pacotes publicados há menos de 1 dia (`minimumReleaseAge`)
  e só roda scripts de instalação aprovados em `pnpm-workspace.yaml`
  (`allowBuilds`). Não desative essas proteções sem discutir em uma issue.

```powershell
pnpm install
pnpm run check   # lint + typecheck + testes + build
```

## Fluxo

1. Abra uma _issue_ descrevendo o problema ou a proposta antes de mudanças grandes.
2. Crie um branch a partir de `main`.
3. Escreva testes junto com o código. Testes unitários **não acessam a rede**:
   use `fetch` falso e fixtures em `tests/fixtures/`, sempre com a origem dos
   dados documentada.
4. Rode `pnpm run check` antes de abrir o _pull request_.
5. Use mensagens no padrão [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`…).

## Regras do projeto

- **Não invente contratos de API.** Integrações devem citar a documentação
  oficial consultada (link e data) e ter testes de contrato com fixtures reais.
- **Sem segredos** nem dados pessoais reais em código, testes ou fixtures.
- **Sem telemetria** nem envio de dados a terceiros além do que o usuário pediu.
- Dados externos entram como `unknown` e são validados antes do uso.
- O README só descreve o que já existe; planos vão para o `ROADMAP.md`.
- Mudanças visíveis ao usuário entram no `CHANGELOG.md` (seção _Unreleased_).

## Estilo

Formatação e lint são feitos pelo Biome (`pnpm run lint:fix`). TypeScript em
modo `strict`, sem `any` explícito.

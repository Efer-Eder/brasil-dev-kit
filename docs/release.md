# Como publicar uma versão no npm

> Nada aqui roda sozinho. A publicação só acontece quando o mantenedor dispara o
> workflow `Release (npm)` à mão, a partir de uma tag.

## Estado atual

- Versão preparada: `0.1.0` (ver [CHANGELOG](../CHANGELOG.md)).
- `"private": true` no `package.json` funciona como trava: o `npm publish` recusa
  publicar enquanto ela existir.
- Nome no npm: `brasil-dev-kit` (livre no registro em 2026-11-21).

## Checklist antes de publicar

```powershell
pnpm install
pnpm run check           # lint + typecheck + testes + build
pnpm run test:package    # instala o .tgz num projeto consumidor isolado
npm pack --dry-run       # confere os arquivos que vão no pacote
```

Conferir no `npm pack --dry-run`: só `dist/`, `README*`, `LICENSE`,
`CHANGELOG.md` e `package.json`; nenhum arquivo de teste, fixture ou segredo.

## Publicar

1. Conta no npm com 2FA ligado e um token de automação (granular, só para este
   pacote, com permissão de publicação).
2. No GitHub: _Settings → Secrets and variables → Actions_ → segredo `NPM_TOKEN`.
3. Num PR: remover `"private": true` do `package.json` e trocar
   `## [0.1.0] - ainda não publicada` pela data no `CHANGELOG.md`.
4. Depois do merge, criar a tag na `main`:

   ```powershell
   git switch main
   git pull
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. Em _Actions → Release (npm) → Run workflow_, escolher a tag `v0.1.0`:
   primeiro com `dry_run` marcado (simulação); depois, desmarcado.
6. Conferir em `https://www.npmjs.com/package/brasil-dev-kit` e testar
   `npm install brasil-dev-kit` num projeto limpo.

O workflow confere se a versão do `package.json` bate com a tag, roda a checagem
completa e a validação do pacote antes de publicar, e publica com proveniência
(o npm mostra que o pacote foi gerado por este repositório).

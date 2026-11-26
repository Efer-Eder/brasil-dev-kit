# Como publicar uma versão no npm

> Nada aqui roda sozinho. A publicação só acontece quando o mantenedor dispara o
> workflow `Release (npm)` à mão, a partir de uma tag.

## Como funciona

O workflow publica por **Trusted Publishing** do npm: o GitHub Actions se
identifica no npm por OIDC, sem token guardado no repositório. O pacote sai com
**proveniência** (o npm mostra que ele foi gerado por este repositório, a partir
deste workflow). Requisitos do npm: CLI 11.5.1 ou mais nova (o workflow confere),
Node 22.14 ou mais novo, runner hospedado pelo GitHub e `repository.url` do
`package.json` igual ao repositório.

## Histórico

- **0.1.0 (2026-11-26):** publicada pelo workflow na tag `v0.1.0` com o token
  temporário (`NPM_BOOTSTRAP_TOKEN`), porque o nome ainda não existia no npm.
  O npm aplicou publicação em etapas: primeiro apareceu só o marcador
  `0.0.0-stage` e a 0.1.0 entrou minutos depois. Proveniência SLSA v1 do commit
  `cfcd43f`; `npm audit signatures` confere 1 attestation.
- Depois da 0.1.0 falta: apagar o segredo `NPM_BOOTSTRAP_TOKEN`, revogar o token no
  npm e configurar o publicador confiável (seção abaixo). A 0.2.0 já deve sair sem
  token.
- A página do pacote no site do npm mostrou "This package does not have a README"
  logo depois da 0.1.0, embora o README vá no pacote e o registro já o tenha no
  documento do pacote (campos `readme` e `readmeFilename`). O site monta a página a
  partir da primeira publicação (o marcador `0.0.0-stage`, que não tem README) e
  só atualiza num evento novo do pacote; a expectativa é que a 0.2.0 resolva.

## Checklist antes de publicar

```powershell
pnpm install
pnpm run check           # lint + typecheck + testes + build
pnpm run test:package    # instala o .tgz num projeto consumidor isolado
npm pack --dry-run       # confere os arquivos que vão no pacote
```

Conferir no `npm pack --dry-run`: só `dist/`, `README*`, `LICENSE`,
`CHANGELOG.md` e `package.json`; nenhum arquivo de teste, fixture ou segredo.

## Configurar o publicador confiável (uma vez)

1. Conta no npm com 2FA ligado.
2. Em _npmjs.com → pacote `brasil-dev-kit` → Settings → Trusted Publisher_,
   escolher **GitHub Actions** e preencher (tudo diferencia maiúsculas):
   - Organization or user: `Efer-Eder`
   - Repository: `brasil-dev-kit`
   - Workflow filename: `release.yml`
   - Environment: vazio
   - Permitir **publish**.
3. A configuração nova precisa de uma publicação bem-sucedida em até 2 dias;
   o npm só valida na hora de publicar (erro `ENEEDAUTH` se algo não bater).

### Primeira publicação

A página de configuração fica nas settings do pacote, então o pacote pode
precisar existir antes. Se o npm não mostrar a opção para um nome ainda não
publicado, a 0.1.0 sai com um token temporário:

1. Criar um token granular no npm, só com permissão de publicação, com validade
   curta.
2. No GitHub: _Settings → Secrets and variables → Actions_ → segredo
   `NPM_BOOTSTRAP_TOKEN`. O workflow usa o token só se o segredo existir.
3. Publicar (seção abaixo). A proveniência sai igual, porque roda no Actions.
4. Logo depois: apagar o segredo no GitHub, revogar o token no npm e configurar o
   publicador confiável. Da 0.1.1 em diante, sem token.

## Publicar

1. A versão do `package.json` e a seção do `CHANGELOG.md` já estão prontas na
   `main` (PR revisado e mesclado).
2. Criar a tag na `main`:

   ```powershell
   git switch main
   git pull
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. Em _Actions → Release (npm) → Run workflow_, escolher a tag `v0.1.0`:
   primeiro com `dry_run` marcado (simulação); depois, desmarcado.
4. Conferir em `https://www.npmjs.com/package/brasil-dev-kit` (selo de
   proveniência) e testar `npm install brasil-dev-kit` num projeto limpo.
5. Opcional, depois de tudo certo: nas settings do pacote, exigir 2FA e
   desautorizar tokens para publicação, deixando só o Trusted Publishing.

O workflow confere se a versão do `package.json` bate com a tag e roda a
checagem completa e a validação do pacote antes de publicar.

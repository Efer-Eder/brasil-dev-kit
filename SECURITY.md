# Política de segurança

## Versões suportadas

O projeto ainda não tem versão publicada. Correções de segurança são aplicadas
no branch `main`.

## Como relatar uma vulnerabilidade

**Não abra uma issue pública.** Use o recurso
[_Report a vulnerability_](https://github.com/Efer-Eder/brasil-dev-kit/security/advisories/new)
(GitHub Private Vulnerability Reporting) deste repositório.

Inclua, se possível: descrição, impacto, passos para reproduzir e versão/commit
afetado. A intenção é responder em até 7 dias e combinar a divulgação após a
correção.

## Princípios do projeto

- Nenhuma credencial no repositório; o CI roda varredura de segredos (gitleaks).
- Sem telemetria e sem envio de dados a terceiros além das requisições pedidas
  explicitamente pelo usuário da biblioteca.
- Respostas de provedores externos são tratadas como dados não confiáveis e
  validadas antes do uso; corpos de respostas de erro não são incluídos nas
  mensagens de erro.

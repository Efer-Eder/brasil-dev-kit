# Roadmap

Itens planejados **não estão implementados**. A ordem pode mudar conforme a
verificação das fontes oficiais.

## v0.1.0 (MVP)

- [x] Core HTTP: timeout, `AbortSignal`, erros tipados
- [x] CNPJ: validação estrutural e dígitos verificadores (numérico e alfanumérico)
- [ ] Core: retries com backoff limitado (respeitando `Retry-After`)
- [ ] Core: cache TTL opcional em memória
- [x] CEP: ViaCEP + BrasilAPI com fallback, fixtures gravadas e normalização
      do endereço
- [ ] IBGE: UFs e municípios pela API oficial de localidades
- [ ] Feriados nacionais: provedor verificado ou dataset próprio com
      origem/licença, distinguindo feriados oficiais de pontos facultativos
- [ ] Fachada `createBrasilDevKit()` reunindo os módulos
- [x] Testes de integração opcionais contra fontes reais (fora do CI obrigatório) — CEP
- [ ] Testes de integração para IBGE e feriados
- [ ] Exemplos Node.js e demo web mínima (CEP, municípios, feriados)
- [ ] Definir nome do pacote no npm e configurar changesets
- [ ] Critérios de aceite da v0.1.0 cumpridos antes de qualquer publicação

## Depois do MVP

Bancos (COMPE/ISPB), DDD, normalização de telefone, CPF (revisar finalidade e
tratamento de dados), CNPJ cadastral via fontes autorizadas, CLI, pacote MCP,
múltiplos provedores com fallback e comparação de disponibilidade.

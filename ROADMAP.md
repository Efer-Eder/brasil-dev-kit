# Roadmap

Itens planejados **não estão implementados**. A ordem pode mudar conforme a
verificação das fontes oficiais.

## v0.1.0 (MVP)

- [x] Core HTTP: timeout, `AbortSignal`, erros tipados
- [x] CNPJ: validação estrutural e dígitos verificadores (numérico e alfanumérico)
- [x] Core: retries com backoff limitado (respeitando `Retry-After`)
- [x] Core: cache TTL opcional em memória
- [x] CEP: ViaCEP + BrasilAPI com fallback, fixtures gravadas e normalização
      do endereço
- [x] IBGE: UFs e municípios pela API oficial de localidades
- [x] Feriados nacionais: leis federais + portarias federais 2025/2026,
      distinguindo feriados de pontos facultativos
- [x] API HTTP pública em efer.online (CEP, IBGE, CNPJ) com cache e limites
- [x] Fachada `createBrasilDevKit()` reunindo os módulos
- [x] Testes de integração opcionais contra fontes reais (fora do CI obrigatório) — CEP
- [x] Testes de integração para IBGE
- [ ] Incluir a portaria de 2027 quando for publicada
- [ ] Exemplos Node.js e demo web mínima (CEP, municípios, feriados)
- [x] Nome do pacote no npm (`brasil-dev-kit`) e publicação da v0.1.0 com
      proveniência (2026-11-26)
- [x] Critérios de aceite da v0.1.0 cumpridos antes da publicação
- [ ] Changesets ou outro fluxo de versão (hoje a versão sobe à mão, via PR)

## v0.2.0

- [ ] Publicar bancos e DDD no npm (já estão na API pública e na `main`)
- [ ] Publicação sem token (Trusted Publishing configurado)

## Depois do MVP

- [x] Bancos (COMPE/ISPB) pela lista de participantes do STR do Banco Central
- [x] DDD pelo PGCN da Anatel (tabela embutida)
- [ ] Participantes do Pix: **bloqueado**. O Banco Central publica a lista num CSV
      com a data no nome (só o do dia fica no ar), sem entrada no portal de dados
      abertos; só dá para achar o arquivo por APIs internas do site, sem
      documentação. Entra quando houver URL estável e documentada.

Normalização de telefone, CPF (revisar finalidade e
tratamento de dados), CNPJ cadastral via fontes autorizadas, CLI, pacote MCP,
múltiplos provedores com fallback e comparação de disponibilidade.

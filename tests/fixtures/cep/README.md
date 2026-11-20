# Fixtures de CEP

Respostas **reais** gravadas em 20/11/2026 com `curl`, sem alterações.
O CEP usado (01310-100, Avenida Paulista, São Paulo/SP) é um logradouro público;
não há dados pessoais.

| Arquivo                                   | Requisição                                         | Status |
| ----------------------------------------- | -------------------------------------------------- | ------ |
| `viacep/01310100.json`                    | `GET https://viacep.com.br/ws/01310100/json/`      | 200    |
| `viacep/99999999-nao-encontrado.json`     | `GET https://viacep.com.br/ws/99999999/json/`      | 200    |
| `viacep/0131010-formato-invalido.html`    | `GET https://viacep.com.br/ws/0131010/json/`       | 400    |
| `brasilapi/01310100.json`                 | `GET https://brasilapi.com.br/api/cep/v1/01310100` | 200    |
| `brasilapi/00000000-nao-encontrado.json`  | `GET https://brasilapi.com.br/api/cep/v1/00000000` | 404    |
| `brasilapi/0131010-formato-invalido.json` | `GET https://brasilapi.com.br/api/cep/v1/0131010`  | 400    |

Observação: na mesma data, `99999999` foi "não encontrado" no ViaCEP, mas
encontrado no BrasilAPI (fonte `open-cep`). As bases dos provedores divergem.

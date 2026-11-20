// Exemplo: validação estrutural de CNPJ (não consulta a Receita Federal).
// Rode após `pnpm build`:  node examples/node/cnpj.mjs
import { formatCnpj, validateCnpj } from '../../dist/index.js';

for (const input of ['12.ABC.345/01DE-35', '11222333000181', '11222333000182']) {
  const result = validateCnpj(input);
  if (result.valid) {
    console.log(`${input} -> válido (${result.kind}): ${result.formatted}`);
  } else {
    console.log(`${input} -> inválido: ${result.reason} — ${result.message}`);
  }
}

console.log(formatCnpj('12abc34501de35'));

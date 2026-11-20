// Exemplo: feriados nacionais e pontos facultativos federais (sem requisições).
// Rode após `pnpm build`:  node examples/node/feriados.mjs 2026
import { getFeriadosNacionais } from '../../dist/index.js';

const ano = Number(process.argv[2] ?? new Date().getFullYear());
const cal = getFeriadosNacionais(ano);

console.log(`${ano} — origem: ${cal.origem} (${cal.fontes.map((f) => f.descricao).join('; ')})`);
for (const d of cal.datas) {
  const periodo = d.periodo === 'dia_inteiro' ? '' : ` [${d.periodo}]`;
  console.log(`  ${d.data}  ${d.tipo.padEnd(17)}  ${d.nome}${periodo}`);
}
for (const aviso of cal.avisos) console.log(`\nAviso: ${aviso}`);

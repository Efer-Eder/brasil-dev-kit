// Exemplo: UFs e municípios pela API de Localidades do IBGE (requisições reais).
// Rode após `pnpm build`:  node examples/node/ibge.mjs RR
import { createIbgeClient, ValidationError } from '../../dist/index.js';

const uf = process.argv[2] ?? 'RR';
const ibge = createIbgeClient({ timeoutMs: 10_000 });

try {
  const ufs = await ibge.listUfs();
  console.log(`${ufs.length} UFs:`, ufs.map((u) => u.sigla).join(', '));

  const municipios = await ibge.listMunicipios(uf);
  console.log(`\n${municipios.length} municípios em ${uf.toUpperCase()}:`);
  for (const m of municipios) console.log(`  ${m.codigoIbge}  ${m.nome}`);
} catch (error) {
  if (error instanceof ValidationError) console.error(error.message);
  else console.error('Falha ao consultar o IBGE:', error);
  process.exitCode = 1;
}

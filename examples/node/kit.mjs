// Exemplo: a fachada com todos os módulos (CEP e IBGE fazem requisições reais).
// Rode após `pnpm build`:  node examples/node/kit.mjs
import { createBrasilDevKit } from '../../dist/index.js';

const br = createBrasilDevKit({ timeoutMs: 8000, cacheTtlMs: 60_000 });

const endereco = await br.cep.lookup('01310-100');
console.log(
  'CEP:',
  endereco.logradouro,
  '·',
  endereco.municipio,
  '/',
  endereco.uf,
  `(fonte: ${endereco.fonte.provedor})`,
);

const municipios = await br.ibge.listMunicipios('RR');
console.log('IBGE:', municipios.length, 'municípios em RR');

const feriados = br.feriados.getNacionais(2026);
console.log('Feriados 2026:', feriados.datas.length, 'datas, origem', feriados.origem);
console.log('2026-11-20 é feriado?', br.feriados.isFeriado('2026-11-20'));

console.log('CNPJ:', br.cnpj.validate('12.ABC.345/01DE-35'));

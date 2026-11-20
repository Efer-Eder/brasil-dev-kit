// Exemplo: consulta de CEP (faz requisições reais ao ViaCEP e, se preciso, ao BrasilAPI).
// Rode após `pnpm build`:  node examples/node/cep.mjs 01310-100
import { createCepClient, NotFoundError, ValidationError } from '../../dist/index.js';

const input = process.argv[2] ?? '01310-100';
const cep = createCepClient({ timeoutMs: 8000 });

try {
  const endereco = await cep.lookup(input);
  console.log(endereco);
} catch (error) {
  if (error instanceof ValidationError) console.error('Formato inválido:', error.message);
  else if (error instanceof NotFoundError) console.error('CEP não encontrado:', input);
  else console.error('Falha ao consultar:', error);
  process.exitCode = 1;
}

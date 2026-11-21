// Valida o pacote como um usuário real o instalaria.
//
// 1. `npm pack` gera o .tgz a partir do build atual (rode `pnpm build` antes).
// 2. Um projeto consumidor isolado é criado numa pasta temporária.
// 3. O .tgz é instalado lá (sem acessar a rede: o pacote não tem dependências).
// 4. Testa import ESM, require CommonJS, `package.json` exportado e os tipos
//    (tsc em modo strict com resolução `nodenext` e `bundler`).
// 5. Apaga a pasta temporária.
//
// Uso: node scripts/check-package.mjs

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'bdk-consumer-'));
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

function run(cmd, args, cwd) {
  // No Windows, `npm` é um .cmd e precisa do shell: o comando vai citado numa string só.
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r =
    process.platform === 'win32'
      ? spawnSync([cmd, ...args].map(quote).join(' '), { cwd, encoding: 'utf8', shell: true })
      : spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} falhou (${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

const steps = [];
function step(name, fn) {
  fn();
  steps.push(name);
  console.log(`  ok  ${name}`);
}

try {
  console.log(`Projeto consumidor em ${work}`);
  step('npm pack', () => run('npm', ['pack', '--pack-destination', work, '--silent'], root));
  const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack não gerou o .tgz');

  const app = join(work, 'app');
  mkdirSync(app);
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
  );
  step('npm install do .tgz', () =>
    run('npm', ['install', join(work, tgz), '--no-audit', '--no-fund', '--offline'], app),
  );

  writeFileSync(
    join(app, 'esm.mjs'),
    `import assert from 'node:assert/strict';
import { createBrasilDevKit, validateCnpj, validateCnpjSyntax, isFeriadoNacional, ValidationError, createHttpClient } from 'brasil-dev-kit';
const br = createBrasilDevKit({ fetch: async () => new Response('{}') });
assert.equal(validateCnpj('12.ABC.345/01DE-35').valid, true);
assert.equal(validateCnpjSyntax('12ABC34501DE36').valid, true);
assert.equal(br.cnpj.hasValidCheckDigits('12ABC34501DE36'), false);
assert.equal(isFeriadoNacional('2026-11-20'), true);
assert.equal(br.feriados.getNacionais(2026).origem, 'portaria');
assert.equal(typeof createHttpClient, 'function');
await assert.rejects(br.cep.lookup('123'), ValidationError);
console.log('esm ok');
`,
  );
  step('import ESM', () => run('node', ['esm.mjs'], app));

  writeFileSync(
    join(app, 'cjs.cjs'),
    `const assert = require('node:assert/strict');
const kit = require('brasil-dev-kit');
assert.equal(kit.isValidCnpj('11222333000181'), true);
assert.equal(kit.formatCnpj('12abc34501de36', { checkDigits: false }), '12.ABC.345/01DE-36');
assert.equal(typeof kit.createBrasilDevKit, 'function');
assert.match(require('brasil-dev-kit/package.json').version, /^\\d+\\.\\d+\\.\\d+/);
console.log('cjs ok');
`,
  );
  step('require CommonJS e package.json', () => run('node', ['cjs.cjs'], app));

  writeFileSync(
    join(app, 'types.ts'),
    `import { createBrasilDevKit, type Endereco, type CnpjValidationResult, type BrasilDevKitOptions, NotFoundError } from 'brasil-dev-kit';
const options: BrasilDevKitOptions = { timeoutMs: 5000, retry: { retries: 1 }, cacheTtlMs: 1000, cep: { providers: ['viacep'] } };
const br = createBrasilDevKit(options);
const r: CnpjValidationResult = br.cnpj.validate('11222333000181');
if (r.valid) { const k: 'numeric' | 'alphanumeric' = r.kind; void k; }
async function f(): Promise<string> { const e: Endereco = await br.cep.lookup('01310100'); return e.fonte.provedor; }
void f; void NotFoundError;
// @ts-expect-error provedor inexistente deve ser rejeitado pelos tipos
createBrasilDevKit({ cep: { providers: ['correios'] } });
`,
  );
  for (const resolution of ['nodenext', 'bundler']) {
    const moduleKind = resolution === 'nodenext' ? 'nodenext' : 'esnext';
    step(`tipos (moduleResolution ${resolution})`, () =>
      run(
        'node',
        [
          tsc,
          'types.ts',
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          'false',
          '--target',
          'es2022',
          '--lib',
          'es2022,dom',
          '--module',
          moduleKind,
          '--moduleResolution',
          resolution,
          '--types',
          'node',
          '--typeRoots',
          join(root, 'node_modules', '@types'),
        ],
        app,
      ),
    );
  }

  console.log(`\nPacote validado num consumidor isolado (${steps.length} etapas).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

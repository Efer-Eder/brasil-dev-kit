// Gera src/modules/ddd/dados.ts a partir do PGCN oficial da Anatel.
//
//   node scripts/ddd/generate.mjs                 # baixa o ZIP oficial
//   node scripts/ddd/generate.mjs --zip <arquivo> # usa um ZIP já baixado
//
// Grava também a cópia do ZIP em tests/fixtures/ddd/anatel/pgcn.zip quando baixa.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGCN_CSV_NAME, PGCN_ZIP_URL, parsePgcnCsv, unzipEntry } from './pgcn.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const zipArg = process.argv.indexOf('--zip');

let zip;
let atualizadoEm;
if (zipArg > 0) {
  zip = readFileSync(process.argv[zipArg + 1]);
} else {
  const res = await fetch(PGCN_ZIP_URL, { headers: { 'user-agent': 'brasil-dev-kit-data' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${PGCN_ZIP_URL}`);
  zip = Buffer.from(await res.arrayBuffer());
  const lastModified = res.headers.get('last-modified');
  if (lastModified) atualizadoEm = new Date(lastModified).toISOString().slice(0, 10);
  writeFileSync(`${root}tests/fixtures/ddd/anatel/pgcn.zip`, zip);
}

const csv = unzipEntry(zip, PGCN_CSV_NAME);
const vigentes = parsePgcnCsv(csv.toString('utf8'));
// Sem Last-Modified (ZIP local), usa a data do arquivo dentro do ZIP.
atualizadoEm ??= zipEntryDate(zip);

const porDdd = new Map();
for (const v of vigentes) {
  if (!porDdd.has(v.ddd)) porDdd.set(v.ddd, []);
  porDdd.get(v.ddd).push(v);
}
const ddds = [...porDdd.keys()].sort();
const sha256 = createHash('sha256').update(zip).digest('hex');

const linhas = ddds.map((ddd) => {
  const itens = porDdd
    .get(ddd)
    .sort((a, b) => a.codigoIbge.localeCompare(b.codigoIbge))
    .map((v) => `${v.codigoIbge}:${v.municipio}`)
    .join(';');
  return `  '${ddd}': ${JSON.stringify(itens).replace(/'/g, "\\'").replace(/^"|"$/g, "'")},`;
});

const out = `// Arquivo gerado por scripts/ddd/generate.mjs. Não editar à mão.
// Fonte: Anatel, Plano Geral de Códigos Nacionais (PGCN), domínio público.
// ${PGCN_ZIP_URL}

/** Versão do PGCN usada nesta tabela. */
export const PGCN_VERSAO = {
  url: '${PGCN_ZIP_URL}',
  arquivo: '${PGCN_CSV_NAME}',
  atualizadoEm: '${atualizadoEm}',
  sha256: '${sha256}',
  municipios: ${vigentes.length},
} as const;

/** DDD → municípios vigentes, \`codigoIbge:nome\` separados por \`;\` (ordem do código IBGE). */
export const DDD_MUNICIPIOS: Readonly<Record<string, string>> = {
${linhas.join('\n')}
};
`;

writeFileSync(`${root}src/modules/ddd/dados.ts`, out);
console.log(
  `PGCN ${atualizadoEm}: ${vigentes.length} municípios, ${ddds.length} DDDs, sha256 ${sha256}`,
);

function zipEntryDate(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const p = buf.readUInt32LE(i + 16);
    const date = buf.readUInt16LE(p + 14);
    const y = 1980 + (date >> 9);
    const m = String((date >> 5) & 15).padStart(2, '0');
    const d = String(date & 31).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  throw new Error('ZIP inválido');
}

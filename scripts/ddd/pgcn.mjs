// Leitura do PGCN (Plano Geral de Códigos Nacionais) publicado pela Anatel.
// Fonte: https://dados.gov.br/dados/conjuntos-dados/codigos-nacionais-cn
// Arquivo: ZIP com um CSV (UTF-8 com BOM, separador ";", CRLF). Licença do
// conjunto no dados.gov.br: "Other (Public Domain)".
// Sem dependências: o ZIP é lido pelo diretório central e descompactado com zlib.

import { inflateRawSync } from 'node:zlib';

export const PGCN_ZIP_URL =
  'https://www.anatel.gov.br/dadosabertos/paineis_de_dados/areastarifarias/pgcn.zip';
export const PGCN_CSV_NAME = 'Codigos_Nacionais.csv';

const HEADER = [
  'CO_MUNICIPIO',
  'SG_UF',
  'NO_UF',
  'NO_MUNICIPIO',
  'CN',
  'DT_INICIO_VIGENCIA',
  'DT_FIM_VIGENCIA',
  'DE_ALTERACAO_REGULAMENTAR',
  'VIGENTE',
];

/** Extrai um arquivo de um ZIP (métodos 0 e 8). */
export function unzipEntry(zip, name) {
  const buf = Buffer.from(zip);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP inválido: fim do diretório central não encontrado');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP inválido: diretório central');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP inválido: cabeçalho local');
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compressed);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`ZIP: método de compressão ${method} não suportado`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP: arquivo ${name} não encontrado`);
}

/** CSV do PGCN → linhas vigentes `{ codigoIbge, uf, municipio, ddd }`, validadas. */
export function parsePgcnCsv(text) {
  const semBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = semBom.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = splitLine(lines[0] ?? '');
  if (HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(`cabeçalho do PGCN mudou: ${header.join(';')}`);
  }
  const vigentes = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const cols = splitLine(line);
    if (cols.length !== HEADER.length) throw new Error(`linha ${i + 2}: ${cols.length} colunas`);
    const [codigoIbge, uf, , municipio, cn, , , , vigente] = cols;
    if (vigente !== 'Sim' && vigente !== 'Não') throw new Error(`linha ${i + 2}: VIGENTE`);
    if (vigente === 'Não') continue;
    if (!/^\d{7}$/.test(codigoIbge)) throw new Error(`linha ${i + 2}: código IBGE`);
    if (!/^[A-Z]{2}$/.test(uf)) throw new Error(`linha ${i + 2}: UF`);
    if (!/^[1-9][1-9]$/.test(cn)) throw new Error(`linha ${i + 2}: CN`);
    if (municipio.trim() === '') throw new Error(`linha ${i + 2}: município vazio`);
    vigentes.push({ codigoIbge, uf, municipio: municipio.trim(), ddd: cn });
  }
  const codigos = new Set(vigentes.map((v) => v.codigoIbge));
  if (codigos.size !== vigentes.length) throw new Error('município com mais de um CN vigente');
  return vigentes;
}

// CSV com ";" e aspas só quando necessário (ex.: "Alta Floresta D'Oeste").
function splitLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ';') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

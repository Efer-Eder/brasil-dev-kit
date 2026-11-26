/**
 * Leitor de CSV mínimo (RFC 4180): separador configurável, campos entre aspas,
 * aspas duplicadas (`""`) dentro de campo e quebras `\n` ou `\r\n`.
 * Devolve as linhas como listas de texto; linhas totalmente vazias são ignoradas.
 *
 * @throws Error se uma aspa abrir e não fechar (o chamador converte no erro do provedor).
 */
export function parseCsv(text: string, separator = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }

    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === separator) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i++;
    } else {
      field += ch;
    }
    i++;
  }

  if (quoted) throw new Error('aspas sem fechamento no CSV');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

// Position lookup and hover text. No vscode imports.
import type { ParsedDoc, Row } from './parser.ts';

export interface Located {
  row: Row;
  /** index of the argument under the position; undefined on the macro name or in between */
  arg?: number;
}

export function locate(doc: ParsedDoc, line: number, ch: number): Located | undefined {
  const row = doc.rows.find(r => r.line === line && ch >= r.macroStart && ch <= r.end);
  if (!row) return;
  const arg = row.args.findIndex(a => ch >= a.start && ch <= a.end);
  return { row, arg: arg < 0 ? undefined : arg };
}

/** Markdown hover text. The column name is the header-comment word at the same position, if any. */
export function describe({ row, arg }: Located): string {
  const m = `\`${row.macro}\``;
  if (arg !== undefined) return `argument ${arg + 1} of ${m}` + (row.header?.[arg] ? `: \`${row.header[arg].text}\`` : '');
  const cols = row.header ? `(${row.header.map(w => w.text).join(', ')}) ` : '';
  return `${m} ${cols}- ${row.args.length} argument${row.args.length === 1 ? '' : 's'}`;
}

// Position lookup (hover) and outline. No vscode imports.
import { toNumber } from './parser.ts';
import type { Arg, ParsedDoc, Row } from './parser.ts';
import { scanFormat } from './format.ts';
import type { Placeholder } from './format.ts';

export interface Located {
  row: Row;
  /** set when the position is inside an argument */
  arg?: Arg;
  /** column name of arg (undefined for unknown macros) */
  column?: string;
  /** set when the position is inside a {n} placeholder of a format string; offsets are line offsets */
  placeholder?: Placeholder;
}

/** Row, argument, column and format placeholder at a (line, character) position. */
export function locate(doc: ParsedDoc, line: number, ch: number): Located | undefined {
  const row = doc.rows.find(r => r.line === line && ch >= r.macroStart && ch <= r.end);
  if (!row) return;
  const arg = row.args.find(a => ch >= a.start && ch <= a.end);
  if (!arg) return { row };
  const res: Located = { row, arg, column: arg.column };
  if (arg.column && row.spec?.columns[arg.column]?.format) {
    const p = scanFormat(arg.text).placeholders
      .map(p => ({ index: p.index, start: arg.start + p.start, end: arg.start + p.end }))
      .find(p => ch >= p.start && ch < p.end);
    if (p) res.placeholder = p;
  }
  return res;
}

export interface OutlineNode { label: string; row: Row; children: OutlineNode[] }

/** Groups as parents, rows as children; CONFIG_OPTION rows hang under their CONFIG_ENUM. */
export function outline(doc: ParsedDoc): OutlineNode[] {
  const col = (r: Row, c?: string) => r.args.find(a => a.column === c);
  const nodes = doc.rows.map(row => ({
    label: `${(col(row, row.spec?.label) ?? row.args[0])?.text ?? ''}`.trim() || row.macro,
    row, children: [] as OutlineNode[],
  }));
  // lookup of defining rows: "kind|id|number" / "kind|name|text"
  const defs = new Map<string, OutlineNode>();
  for (const n of nodes) {
    for (const d of n.row.spec?.defines ?? []) {
      const id = col(n.row, d.id), name = col(n.row, d.name);
      if (id && toNumber(id.text) !== undefined) defs.set(`${d.kind}|id|${toNumber(id.text)}`, n);
      if (name) defs.set(`${d.kind}|name|${name.text}`, n);
    }
  }
  const roots: OutlineNode[] = [];
  for (const n of nodes) {
    const p = n.row.spec?.parent;
    let parent: OutlineNode | undefined;
    if (p && n.row.mapped) {
      if (p.highByteOf) {
        const v = toNumber(col(n.row, p.highByteOf)?.text ?? '');
        if (v !== undefined) parent = defs.get(`${p.kind}|id|${v >> 8}`);
      } else {
        const a = col(n.row, p.column);
        if (a) parent = defs.get(`${p.kind}|${p.by}|${p.by === 'id' ? toNumber(a.text) : a.text}`);
      }
    }
    (parent && parent !== n ? parent.children : roots).push(n);
  }
  return roots;
}

/** Markdown hover text for a located position. */
export function describe(l: Located): string {
  const { row } = l;
  if (l.arg) {
    let t = l.column ? `column \`${l.column}\` of \`${row.macro}\`` : `argument of \`${row.macro}\``;
    if (l.placeholder) t += `

placeholder: argument ${l.placeholder.index}`;
    return t;
  }
  const layouts = row.spec?.layouts.map(c => c.join(', ')).join(' | ');
  return layouts ? `\`${row.macro}(${layouts})\`` : `\`${row.macro}\`: unknown macro`;
}

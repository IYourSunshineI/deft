// Diagnostics for parsed .def tables. No vscode imports.
import { dirname, basename, resolve } from 'node:path';
import { parse, toNumber } from './parser.ts';
import type { Arg, ColumnSpec, ParsedDoc, Row } from './parser.ts';
import { scanFormat } from './format.ts';

export interface Diagnostic {
  line: number;
  start: number;
  end: number;
  severity: 'error' | 'warning';
  message: string;
}
export type ReadFile = (resolvedPath: string) => string | undefined;
export interface CheckOptions {
  /** path of the checked document; needed to resolve #include */
  filePath?: string;
  /** returns the content of a file, or undefined when it cannot be read */
  readFile?: ReadFile;
}

/** Everything a row defines: [kind, 'id'|'name', key, arg, unique]. */
function* definitions(rows: Row[]) {
  for (const r of rows) {
    if (!r.mapped) continue;
    for (const d of r.spec?.defines ?? []) {
      for (const f of ['id', 'name'] as const) {
        const col = d[f];
        const arg = col && r.args.find(a => a.column === col);
        if (!arg || !arg.text) continue;
        const key = f === 'id' ? toNumber(arg.text) : arg.text;
        if (key !== undefined) yield { slot: `${d.kind}|${f}|${key}`, f, key, arg, row: r, unique: d.unique !== false };
      }
    }
  }
}

function checkType(a: Arg, c: ColumnSpec): string | undefined {
  const t = a.text;
  if (!t) return 'Empty argument';
  switch (c.type) {
    case 'dec': return /^\d+$/.test(t) ? undefined : 'Expected a decimal number';
    case 'number': return toNumber(t) === undefined ? 'Expected a number' : undefined;
    case 'u16': {
      const n = toNumber(t);
      if (n === undefined || n > 0xFFFF) return 'Expected a 16 bit number';
      if (c.range && (n < c.range[0] || n > c.range[1])) return `Value must be in 0x${c.range[0].toString(16).toUpperCase()} to 0x${c.range[1].toString(16).toUpperCase()}`;
      return;
    }
    case 'ident': return /^[A-Za-z_]\w*$/.test(t) ? undefined : 'Expected an identifier';
    case 'string': return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? undefined : 'Expected a string in double quotes';
    case 'tuple': return t.startsWith('(') && t.endsWith(')') ? undefined : 'Expected a tuple in parentheses';
    case 'oneOf': return c.values?.includes(t) ? undefined : `Expected one of ${c.values?.join(', ')}`;
  }
}

export function check(doc: ParsedDoc, opts: CheckOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (line: number, start: number, end: number, message: string, severity: Diagnostic['severity'] = 'error') =>
    out.push({ line, start, end, severity, message });
  for (const e of doc.errors) add(e.line, e.start, e.end, e.message);

  // Known definitions, seeded with the rows of the included files (one level only).
  const known = new Map<string, string>(); // slot -> where
  let complete = true;
  for (const inc of doc.includes) {
    const text = opts.filePath && opts.readFile ? opts.readFile(resolve(dirname(opts.filePath), inc.path)) : undefined;
    if (text === undefined) {
      complete = false;
      if (opts.readFile) add(inc.line, inc.start, inc.end, `Cannot read include "${inc.path}"`, 'warning');
      continue;
    }
    const where = basename(inc.path);
    for (const d of definitions(parse(text, doc.schema).rows)) {
      if (!known.has(d.slot)) known.set(d.slot, `${where} line ${d.row.line + 1}`);
    }
  }
  for (const d of definitions(doc.rows)) {
    const prev = known.get(d.slot);
    if (prev && d.unique) {
      add(d.row.line, d.arg.start, d.arg.end, `Duplicate ${d.f} ${d.arg.text}: also defined at ${prev}`);
    }
    if (!prev) known.set(d.slot, `line ${d.row.line + 1}`);
  }

  for (const r of doc.rows) {
    if (!r.spec) continue;
    if (!r.mapped) {
      const counts = r.spec.layouts.map(l => l.length).join(' or ');
      add(r.line, r.macroStart, r.end, `${r.macro} expects ${counts} arguments, found ${r.args.length}`);
      continue;
    }
    for (const a of r.args) {
      const c = r.spec.columns[a.column!];
      if (!c) continue;
      const typeErr = checkType(a, c);
      if (typeErr) { add(r.line, a.start, a.end, `${a.column}: ${typeErr}`); continue; }
      if (c.format) {
        const f = scanFormat(a.text);
        for (const e of f.errors) add(r.line, a.start + e.start, a.start + e.end, e.message);
        for (const p of f.placeholders) {
          if (p.index > (c.maxPlaceholder ?? Infinity)) {
            add(r.line, a.start + p.start, a.start + p.end, `Placeholder {${p.index}} out of range: only {0} to {${c.maxPlaceholder}} are available`);
          }
        }
      }
      if (c.ref && complete) {
        const [kind, by] = c.ref.split(':');
        const key = by === 'id' ? toNumber(a.text) : a.text;
        if (!known.has(`${kind}|${by}|${key}`)) add(r.line, a.start, a.end, `Unknown ${kind.split('.')[1]} ${by === 'id' ? 'id ' : ''}${a.text}`);
      }
    }
  }
  return out.sort((x, y) => x.line - y.line || x.start - y.start);
}

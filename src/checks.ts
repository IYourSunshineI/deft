// Diagnostics for parsed tables. No vscode imports.
import { dirname, basename, resolve } from 'node:path';
import { parse, toNumber } from './parser.ts';
import type { Arg, ParsedDoc, Row } from './parser.ts';

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

// 0x10 and 16 are the same id
const idKey = (a: Arg) => String(toNumber(a.text) ?? a.text);

export function check(doc: ParsedDoc, opts: CheckOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = doc.errors.map(e => ({ ...e, severity: 'error' }));
  const add = (line: number, a: { start: number; end: number }, severity: Diagnostic['severity'], message: string) =>
    out.push({ line, start: a.start, end: a.end, severity, message });

  // Rows seen so far per `macro|id|number` / `macro|name|owner|text`, seeded with the included files (one level only).
  // A numeric first argument is an id (unique per macro); any other one is an owner, and names are unique per owner.
  const seen = new Map<string, string>(); // -> where
  const note = (r: Row, where: string, report: boolean) => {
    const numeric = r.id && toNumber(r.id.text) !== undefined;
    for (const [kind, a] of [['id', numeric ? r.id : undefined], ['name', r.name]] as const) {
      if (!a) continue;
      const slot = kind === 'id' ? `${r.macro}|id|${idKey(a)}` : `${r.macro}|name|${numeric || !r.id ? '' : r.id.text}|${a.text}`;
      const prev = seen.get(slot);
      if (prev && report) add(r.line, a, kind === 'id' ? 'error' : 'warning', `Duplicate ${kind} ${a.text}: also defined at ${prev}`);
      if (!prev) seen.set(slot, `${where}line ${r.line + 1}`);
    }
  };
  for (const inc of doc.includes) {
    const text = opts.filePath && opts.readFile ? opts.readFile(resolve(dirname(opts.filePath), inc.path)) : undefined;
    if (text === undefined) { if (opts.readFile) add(inc.line, inc, 'warning', `Cannot read include "${inc.path}"`); continue; }
    for (const r of parse(text).rows) note(r, basename(inc.path) + ' ', false);
  }
  for (const r of doc.rows) note(r, '', true);

  // rows of one macro should agree on the argument count: the minority is flagged
  const counts = new Map<string, Map<number, number>>();
  for (const r of doc.rows) {
    const c = counts.get(r.macro) ?? counts.set(r.macro, new Map()).get(r.macro)!;
    c.set(r.args.length, (c.get(r.args.length) ?? 0) + 1);
  }
  for (const r of doc.rows) {
    const c = counts.get(r.macro)!;
    if (c.size < 2) continue;
    const usual = [...c].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    if (r.args.length !== usual) add(r.line, { start: r.macroStart, end: r.end }, 'warning', `${r.macro} usually has ${usual} arguments, found ${r.args.length}`);
  }
  return out.sort((x, y) => x.line - y.line || x.start - y.start);
}

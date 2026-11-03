// Cross-file lookup of table rows (definitions and uses). No vscode imports.
import { toNumber } from './parser.ts';
import type { Arg, ParsedDoc, Row } from './parser.ts';

export interface TableFile { uri: string; doc: ParsedDoc }
export interface Loc { uri: string; line: number; start: number; end: number }

const loc = (uri: string, row: Row, a: Arg): Loc => ({ uri, line: row.line, start: a.start, end: a.end });

/** Name -> rows' name arguments. The name is the row's label column when that is an identifier. */
export function nameIndex(files: TableFile[]): Map<string, Loc[]> {
  const idx = new Map<string, Loc[]>();
  for (const f of files) {
    for (const r of f.doc.rows) {
      const col = r.mapped ? r.spec?.label : undefined;
      const a = col && r.spec?.columns[col]?.type === 'ident' ? r.args.find(x => x.column === col) : undefined;
      if (a?.text) idx.set(a.text, [...(idx.get(a.text) ?? []), loc(f.uri, r, a)]);
    }
  }
  return idx;
}

/**
 * Rows for an identifier from C/C++. Exact match first; otherwise the longest
 * `_`-delimited suffix, because includers typically add a prefix (`PREFIX_Name`).
 */
export function lookupName(idx: Map<string, Loc[]>, word: string): Loc[] {
  const parts = word.split('_');
  for (let i = 0; i < parts.length; i++) {
    const hit = idx.get(parts.slice(i).join('_'));
    if (hit) return hit;
  }
  return [];
}

/** Ranges of a name in text: whole word, optionally behind a `prefix_`. */
export function findUses(text: string, name: string): { line: number; start: number; end: number }[] {
  const re = new RegExp(String.raw`\b(?:\w*_)?${name}\b`, 'g');
  const out: { line: number; start: number; end: number }[] = [];
  text.split(/\r?\n/).forEach((l, line) => {
    for (const m of l.matchAll(re)) out.push({ line, start: m.index, end: m.index + m[0].length });
  });
  return out;
}

const key = (by: string, text: string) => (by === 'id' ? toNumber(text) : text);

/** Defining rows of the value of a `ref` column (e.g. group id -> group row). */
export function resolveRef(files: TableFile[], row: Row, arg: Arg): Loc[] {
  const ref = arg.column && row.spec?.columns[arg.column]?.ref;
  if (!ref) return [];
  const [kind, by] = ref.split(':');
  const want = key(by, arg.text);
  const out: Loc[] = [];
  for (const f of files) {
    for (const r of f.doc.rows) {
      for (const d of r.mapped ? r.spec?.defines ?? [] : []) {
        const a = d.kind === kind && r.args.find(x => x.column === d[by as 'id' | 'name']);
        if (a && want !== undefined && key(by, a.text) === want) out.push(loc(f.uri, r, a));
      }
    }
  }
  return out;
}

/** Arguments in any table that reference what `row` defines. */
export function refsToRow(files: TableFile[], row: Row): Loc[] {
  const out: Loc[] = [];
  const defs = row.mapped ? row.spec?.defines ?? [] : [];
  for (const f of files) {
    for (const r of f.doc.rows) {
      if (!r.mapped) continue;
      for (const a of r.args) {
        const ref = a.column && r.spec?.columns[a.column]?.ref;
        if (!ref) continue;
        const [kind, by] = ref.split(':');
        for (const d of defs) {
          const c = d.kind === kind && d[by as 'id' | 'name'];
          const mine = c && row.args.find(x => x.column === c);
          if (mine && key(by, mine.text) !== undefined && key(by, mine.text) === key(by, a.text)) out.push(loc(f.uri, r, a));
        }
      }
    }
  }
  return out;
}

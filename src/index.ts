// Cross-file lookup of table rows (definitions and uses). No vscode imports.
import type { ParsedDoc } from './parser.ts';

export interface TableFile { uri: string; doc: ParsedDoc }
export interface Loc { uri: string; line: number; start: number; end: number }

/** Name -> the rows' name arguments. */
export function nameIndex(files: TableFile[]): Map<string, Loc[]> {
  const idx = new Map<string, Loc[]>();
  for (const f of files) {
    for (const r of f.doc.rows) {
      if (r.name) idx.set(r.name.text, [...(idx.get(r.name.text) ?? []), { uri: f.uri, line: r.line, start: r.name.start, end: r.name.end }]);
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

/** Ranges of every identifier in text that names a table row (exact or `_`-suffix match). */
export function findNames(text: string, idx: Map<string, Loc[]>): { line: number; start: number; end: number }[] {
  const out: { line: number; start: number; end: number }[] = [];
  text.split(/\r?\n/).forEach((l, line) => {
    for (const m of l.matchAll(/\b[A-Za-z_]\w*/g)) if (lookupName(idx, m[0]).length) out.push({ line, start: m.index, end: m.index + m[0].length });
  });
  return out;
}

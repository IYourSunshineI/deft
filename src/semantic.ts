// Semantic token roles derived from the schema (defines / ref / format / oneOf). No vscode imports.
import type { ParsedDoc } from './parser.ts';
import { scanFormat } from './format.ts';

export const legend = {
  types: ['macro', 'number', 'variable', 'type', 'enumMember', 'string', 'parameter'],
  modifiers: ['declaration', 'readonly'],
};
export interface SemToken { line: number; start: number; length: number; type: string; modifiers: string[] }

export function semanticTokens(doc: ParsedDoc): SemToken[] {
  const out: SemToken[] = [];
  for (const r of doc.rows) {
    if (!r.spec) continue;
    const tok = (start: number, length: number, type: string, modifiers: string[] = []) =>
      length > 0 && out.push({ line: r.line, start, length, type, modifiers });
    tok(r.macroStart, r.macroEnd - r.macroStart, 'macro');
    if (!r.mapped) continue; // no clear columns: leave the arguments to the grammar
    for (const a of r.args) {
      const col = r.spec.columns[a.column!];
      const defs = r.spec.defines ?? [];
      if (defs.some(d => d.id === a.column)) tok(a.start, a.text.length, 'number', ['declaration']);
      else if (defs.some(d => d.name === a.column)) tok(a.start, a.text.length, 'variable', ['declaration', 'readonly']);
      else if (col?.ref) tok(a.start, a.text.length, 'type');
      else if (col?.type === 'oneOf') tok(a.start, a.text.length, 'enumMember');
      else if (col?.format && a.text.startsWith('"')) {
        let p = 0;
        for (const ph of scanFormat(a.text).placeholders) {
          tok(a.start + p, ph.start - p, 'string');
          tok(a.start + ph.start, ph.end - ph.start, 'parameter');
          p = ph.end;
        }
        tok(a.start + p, a.text.length - p, 'string');
      }
    }
  }
  return out;
}

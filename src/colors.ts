// Character ranges per colour role, for the deft.colors.* settings. No vscode imports.
import { toNumber } from './parser.ts';
import type { ParsedDoc } from './parser.ts';

export const roles = ['macro', 'id', 'name', 'number', 'string', 'placeholder'] as const;
export type Role = (typeof roles)[number];
export interface Colored { role: Role; line: number; start: number; end: number }

export function colorRanges(doc: ParsedDoc): Colored[] {
  const out: Colored[] = [];
  for (const r of doc.rows) {
    const add = (role: Role, start: number, end: number) => { if (end > start) out.push({ role, line: r.line, start, end }); };
    add('macro', r.macroStart, r.macroEnd);
    for (const a of r.args) {
      if (a === r.id) add('id', a.start, a.end);
      else if (a === r.name) add('name', a.start, a.end);
      else if (toNumber(a.text) !== undefined) add('number', a.start, a.end);
      else if (a.text.startsWith('(')) {
        for (const m of a.text.matchAll(/(?<![\w.])(?:0[xX][0-9A-Fa-f]+|\d+)\b/g)) add('number', a.start + m.index, a.start + m.index + m[0].length);
      } else if (a.text.startsWith('"')) {
        let from = a.start; // the string without its {n} placeholders
        for (const m of a.text.matchAll(/\{\{|\}\}|(\{\d+(?:,-?\d+)?(?::[^{}"]*)?\})/g)) {
          if (!m[1]) continue;
          add('string', from, a.start + m.index);
          add('placeholder', a.start + m.index, from = a.start + m.index + m[0].length);
        }
        add('string', from, a.end);
      }
    }
  }
  return out;
}

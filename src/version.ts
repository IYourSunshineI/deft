// Version-bump reminder. No vscode imports.
import { parse } from './parser.ts';
import type { Schema } from './parser.ts';
import type { Diagnostic } from './checks.ts';

const rows = (t: string, s: Schema) => parse(t, s).rows.map(r => `${r.macro}(${r.args.map(a => a.text).join(',')})`);

/** Warns on the `*_VERSION` define when rows differ from `oldText` but the version value is unchanged. */
export function versionReminder(oldText: string, newText: string, schema: Schema): Diagnostic | undefined {
  const cur = parse(newText, schema);
  const def = cur.defines.find(d => /_VERSION$/.test(d.name));
  if (!def) return;
  const old = parse(oldText, schema).defines.find(d => d.name === def.name);
  if (!old || old.value !== def.value) return;
  const a = rows(oldText, schema), b = rows(newText, schema);
  if (a.length === b.length && a.every((x, i) => x === b[i])) return;
  return {
    line: def.line, start: def.start, end: def.end, severity: 'warning',
    message: `Rows changed since HEAD but ${def.name} is still ${def.value} - bump it?`,
  };
}

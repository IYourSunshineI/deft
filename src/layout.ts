// Column alignment of table rows. No vscode imports. Only whitespace between tokens changes.
//
// Unit: a block of consecutive row lines (a blank, comment or directive line ends it).
// If the nearest line above the block (skipping blanks and rows) is a one-line header comment naming the columns
// (`/*  id   name   label */`, valid across blank lines and further rows), every argument starts under its column's word in that header
// (looked up by column name, so rows with different layouts share one grid; missing columns stay blank)
// and "(" sits one column before the first one. Rows the header does not cover, and blocks without
// header, are aligned by themselves: macro names padded to the longest, each argument column as wide as
// its widest cell. Trailing comments of a run line up. Rows with parse errors are skipped.
import { parse } from './parser.ts';
import type { Row, Schema } from './parser.ts';

/** Changed lines (index into text.split(/\r?\n/)) with their new content. */
export function formatEdits(text: string, schema: Schema): { line: number; text: string }[] {
  const doc = parse(text, schema);
  const lines = text.split(/\r?\n/);
  const bad = new Set(doc.errors.map(e => e.line));
  const rowLines = new Set(doc.rows.map(r => r.line));
  const blocks: Row[][] = [];
  for (const r of doc.rows) {
    if (bad.has(r.line)) continue;
    const b = blocks[blocks.length - 1];
    if (b && b[b.length - 1].line === r.line - 1) b.push(r); else blocks.push([r]);
  }
  const edits: { line: number; text: string }[] = [];
  const emit = (rows: Row[], bodies: string[]) => {
    const tails = rows.map(r => lines[r.line].slice(r.end).trim());
    const width = Math.max(0, ...bodies.map((s, i) => tails[i] ? s.length : 0));
    rows.forEach((r, i) => {
      const next = bodies[i] + (tails[i] ? ' '.repeat(width - bodies[i].length + 1) + tails[i] : '');
      if (next !== lines[r.line]) edits.push({ line: r.line, text: next });
    });
  };
  for (const b of blocks) {
    let p = b[0].line - 1; // the header stays valid across blank lines and other rows
    while (p >= 0 && (rowLines.has(p) || !lines[p].trim())) p--;
    const hm = /^\s*\/\*(.*)\*\/\s*$/.exec(lines[p] ?? '');
    const cols = new Map<string, number>(); // column name -> start offset in the header line
    if (hm) for (const w of hm[1].matchAll(/\S+/g)) cols.set(w[0], w.index + lines[p].indexOf('/*') + 2);
    const covered = (r: Row) => r.args.length > 0 && r.args.every(a => a.column !== undefined && cols.has(a.column));
    for (let i = 0; i < b.length;) {
      let j = i;
      while (j < b.length && covered(b[j]) === covered(b[i])) j++;
      const run = b.slice(i, j);
      i = j;
      const head = (r: Row) => lines[r.line].slice(0, r.macroStart);
      if (covered(run[0])) {
        emit(run, run.map(r => {
          let s = head(r) + r.macro;
          s = s.padEnd(cols.get(r.args[0].column!)! - 1) + '(';
          r.args.forEach((a, k) => {
            if (k) s = (s + ' ').padEnd(cols.get(a.column!)!);
            s += a.text + (k < r.args.length - 1 ? ',' : '');
          });
          return s + ')';
        }));
      } else {
        const macroW = Math.max(...run.map(r => r.macroEnd - r.macroStart));
        const w: number[] = []; // last argument of a row is not padded
        for (const r of run) r.args.slice(0, -1).forEach((a, k) => { w[k] = Math.max(w[k] ?? 0, a.text.length); });
        emit(run, run.map(r => head(r) + r.macro.padEnd(macroW) + '(' +
          r.args.map((a, k) => k < r.args.length - 1 ? (a.text + ',').padEnd(w[k] + 2) : a.text).join('') + ')'));
      }
    }
  }
  return edits;
}

export function formatText(text: string, schema: Schema): string {
  const lines = text.split(/(\r?\n)/); // separators kept at odd indexes
  for (const e of formatEdits(text, schema)) lines[e.line * 2] = e.text;
  return lines.join('');
}

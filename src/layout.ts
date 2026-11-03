// Column alignment of table rows. No vscode imports. Only whitespace between tokens changes.
//
// Unit: a run of consecutive row lines (a blank, comment or directive line ends it).
// A row follows the nearest header comment above it (`/*  id   name   label */`, see Row.header) when it has
// as many arguments as the header has words (argument k goes under word k), or when every argument already
// starts exactly under some word (a hand-aligned row with blank columns stays put). Each argument then
// starts under its word and "(" sits one column before the first one.
// Other rows are aligned among their consecutive neighbours: macro names padded to the longest, each
// argument column as wide as its widest cell. Trailing comments of a run line up.
import { parse } from './parser.ts';
import type { Row } from './parser.ts';

/** Header word index of every argument, or undefined when the row does not follow its header. */
function slots(r: Row): number[] | undefined {
  const words = r.header;
  if (!words || !r.args.length || r.args.length > words.length) return;
  const idx = r.args.map((a, k) => (r.args.length === words.length ? k : words.findIndex(w => w.start === a.start)));
  return idx.includes(-1) ? undefined : idx;
}

/** Changed lines (index into the text split at line ends) with their new content. */
export function formatEdits(text: string): { line: number; text: string }[] {
  const lines = text.split(/\r?\n/);
  const rows = parse(text).rows;
  const covered = (r: Row) => !!slots(r);
  const edits: { line: number; text: string }[] = [];
  const emit = (run: Row[], bodies: string[]) => {
    const tails = run.map(r => lines[r.line].slice(r.end).trim());
    const width = Math.max(0, ...bodies.map((s, i) => tails[i] ? s.length : 0));
    run.forEach((r, i) => {
      const next = bodies[i] + (tails[i] ? ' '.repeat(width - bodies[i].length + 1) + tails[i] : '');
      if (next !== lines[r.line]) edits.push({ line: r.line, text: next });
    });
  };
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && rows[j].line === rows[j - 1].line + 1 && covered(rows[j]) === covered(rows[i])) j++;
    const run = rows.slice(i, j);
    i = j;
    const head = (r: Row) => lines[r.line].slice(0, r.macroStart);
    if (covered(run[0])) {
      emit(run, run.map(r => {
        const col = slots(r)!.map(i => r.header![i].start);
        let s = (head(r) + r.macro).padEnd(col[0] - 1) + '(';
        r.args.forEach((a, k) => {
          if (k) s = (s + ' ').padEnd(col[k]);
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
  return edits;
}

export function formatText(text: string): string {
  const lines = text.split(/(\r?\n)/); // separators kept at odd indexes
  for (const e of formatEdits(text)) lines[e.line * 2] = e.text;
  return lines.join('');
}
/** Changed lines (index into text.split(/?
/)) with their new content. */
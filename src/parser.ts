// Pure row parser for X-macro tables. No vscode imports.
//
// A row is a line `MACRO(arg, arg, ...)`. Everything else (comments, directives, any other text) is ignored.

export interface Arg {
  text: string;
  /** character offsets within the line, trimmed, end exclusive */
  start: number;
  end: number;
}
export interface Word { text: string; start: number }
export interface Row {
  line: number;
  macro: string;
  macroStart: number;
  macroEnd: number;
  /** offset of "(" and the end (exclusive) of the closing ")" */
  open: number;
  end: number;
  args: Arg[];
  /** first argument */
  id?: Arg;
  /** the argument under a header word `name` if that is an identifier, else the first identifier after the id */
  name?: Arg;
  /** words of the nearest single-line header comment above the row (blank lines and rows in between are fine) */
  header?: Word[];
}
export interface ParseError { line: number; start: number; end: number; message: string }
export interface Include { line: number; path: string; start: number; end: number }
export interface ParsedDoc { rows: Row[]; includes: Include[]; errors: ParseError[] }

/** Value of an argument as number (decimal or 0x hex), or undefined. */
export function toNumber(text: string): number | undefined {
  return /^(?:0[xX][0-9A-Fa-f]+|\d+)$/.test(text) ? Number(text) : undefined;
}

const ident = /^[A-Za-z_]\w*$/;

export function parse(text: string): ParsedDoc {
  const doc: ParsedDoc = { rows: [], includes: [], errors: [] };
  let inBlock = false;
  let header: Word[] | undefined;
  text.split(/\r?\n/).forEach((line, ln) => {
    const err = (start: number, end: number, message: string) => doc.errors.push({ line: ln, start, end, message });
    let i = 0;
    // skip blanks and comments; returns false when the rest of the line is empty
    const skip = (): boolean => {
      for (;;) {
        if (inBlock) {
          const e = line.indexOf('*/', i);
          if (e < 0) return false;
          i = e + 2; inBlock = false;
        }
        while (i < line.length && /\s/.test(line[i])) i++;
        if (line.startsWith('/*', i)) { inBlock = true; i += 2; continue; }
        return i < line.length && !line.startsWith('//', i);
      }
    };
    const wasBlock = inBlock;
    // a non-row, non-blank line replaces the header: the line itself if it is `/* word word */` of identifier-like words, else none
    const other = () => {
      const h = wasBlock ? null : /^\s*\/\*(.*)\*\/\s*$/.exec(line);
      const words = h ? [...h[1].matchAll(/\S+/g)] : [];
      header = words.length && words.every(w => ident.test(w[0]))
        ? words.map(w => ({ text: w[0], start: w.index + line.indexOf('/*') + 2 })) : undefined;
    };
    if (!skip()) { if (line.trim()) other(); return; }
    let m: RegExpExecArray | null;
    const rest = line.slice(i);
    if (rest[0] === '#') {
      if ((m = /^#\s*include\s*"([^"]*)"/.exec(rest))) {
        const start = i + m[0].length - 1 - m[1].length;
        doc.includes.push({ line: ln, path: m[1], start, end: start + m[1].length });
      }
      return other();
    }
    if (!(m = /^([A-Za-z_]\w*)\s*\(/.exec(rest))) return other();
    const macro = m[1], macroStart = i, macroEnd = i + macro.length, open = i + m[0].length - 1;
    // split arguments at top-level commas, respecting strings (with escapes) and nested parens
    const args: Arg[] = [];
    let depth = 0, argStart = open + 1, close = -1;
    const push = (to: number) => {
      let s = argStart, e = to;
      while (s < e && /\s/.test(line[s])) s++;
      while (e > s && /\s/.test(line[e - 1])) e--;
      args.push({ text: line.slice(s, e), start: s, end: e });
    };
    for (let p = open + 1; p < line.length; p++) {
      const c = line[p];
      if (c === '"') {
        const q = p;
        for (p++; p < line.length && line[p] !== '"'; p++) if (line[p] === '\\') p++;
        if (p >= line.length) { err(q, line.length, 'Unterminated string'); return other(); }
      } else if (c === '(') depth++;
      else if (c === ')') {
        if (depth-- === 0) { close = p; break; }
      } else if (c === ',' && depth === 0) { push(p); argStart = p + 1; }
    }
    if (close < 0) { err(open, line.length, 'Unterminated row: missing ")" (a row must be on one line)'); return other(); }
    push(close);
    if (args.length === 1 && args[0].text === '') args.length = 0;
    const id = args[0]?.text ? args[0] : undefined;
    const byHeader = args[header?.findIndex(w => /^name$/i.test(w.text)) ?? -1];
    const name = byHeader && ident.test(byHeader.text) ? byHeader : args.slice(1).find(a => ident.test(a.text));
    doc.rows.push({ line: ln, macro, macroStart, macroEnd, open, end: close + 1, args, id, name, header });
  });
  return doc;
}

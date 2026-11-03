// Pure row parser for X-macro .def tables. No vscode imports.

export interface ColumnSpec {
  type?: 'dec' | 'u16' | 'number' | 'ident' | 'string' | 'tuple' | 'oneOf';
  range?: [number, number];
  values?: string[];
  /** "kind:id" or "kind:name": the value must be defined by a row of that kind */
  ref?: string;
  /** string is a C# composite format string */
  format?: boolean;
  maxPlaceholder?: number;
}
export interface DefineSpec { kind: string; id?: string; name?: string; unique?: boolean }
export interface ParentSpec { kind: string; column?: string; by?: 'id' | 'name'; highByteOf?: string }
export interface MacroSpec {
  /** accepted column layouts; the one matching the argument count is used */
  layouts: string[][];
  columns: Record<string, ColumnSpec>;
  defines?: DefineSpec[];
  parent?: ParentSpec;
  /** column used as outline label */
  label?: string;
}
export type Schema = Record<string, MacroSpec>;

export interface Arg {
  text: string;
  /** character offsets within the line, trimmed, end exclusive */
  start: number;
  end: number;
  /** column name; undefined for unknown macros or an argument-count mismatch */
  column?: string;
}
export interface Row {
  line: number;
  macro: string;
  macroStart: number;
  macroEnd: number;
  /** offset of "(" and of the closing ")" (exclusive end) */
  open: number;
  end: number;
  args: Arg[];
  spec?: MacroSpec;
  /** true when the argument count matches one of the spec's layouts */
  mapped: boolean;
}
export interface ParseError { line: number; start: number; end: number; message: string }
export interface Include { line: number; path: string; start: number; end: number }
export interface Define { line: number; name: string; value: string; start: number; end: number }
export interface ParsedDoc {
  rows: Row[];
  includes: Include[];
  defines: Define[];
  errors: ParseError[];
  schema: Schema;
}

/** Value of an argument as number (decimal or 0x hex), or undefined. */
export function toNumber(text: string): number | undefined {
  return /^(?:0[xX][0-9A-Fa-f]+|\d+)$/.test(text) ? Number(text) : undefined;
}

export function parse(text: string, schema: Schema): ParsedDoc {
  const doc: ParsedDoc = { rows: [], includes: [], defines: [], errors: [], schema };
  let inBlock = false;
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
    if (!skip()) return;
    let m: RegExpExecArray | null;
    const rest = line.slice(i);
    if (rest[0] === '#') {
      if ((m = /^#\s*include\s*"([^"]*)"/.exec(rest))) {
        const start = i + m[0].length - 1 - m[1].length;
        doc.includes.push({ line: ln, path: m[1], start, end: start + m[1].length });
      } else if ((m = /^#\s*define\s+(\w+)\b(.*)$/.exec(rest))) {
        const value = m[2].replace(/\/\*.*?\*\/|\/\/.*$/g, '').trim();
        const start = i + rest.indexOf(m[1], rest.indexOf('define'));
        doc.defines.push({ line: ln, name: m[1], value, start, end: start + m[1].length });
      }
      return;
    }
    if (!(m = /^([A-Za-z_]\w*)\s*\(/.exec(rest))) {
      err(i, line.length, 'Unexpected text: expected a table row, directive or comment');
      return;
    }
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
        if (p >= line.length) { err(q, line.length, 'Unterminated string'); return; }
      } else if (c === '(') depth++;
      else if (c === ')') {
        if (depth-- === 0) { close = p; break; }
      } else if (c === ',' && depth === 0) { push(p); argStart = p + 1; }
    }
    if (close < 0) {
      err(open, line.length, 'Unterminated row: missing ")" (a row must be on one line)');
      return;
    }
    push(close);
    if (args.length === 1 && args[0].text === '') args.length = 0;
    i = close + 1;
    if (skip()) err(i, line.length, 'Unexpected text after the closing ")"');

    const spec = schema[macro];
    const layout = spec?.layouts.find(l => l.length === args.length);
    layout?.forEach((c, k) => { args[k].column = c; });
    doc.rows.push({ line: ln, macro, macroStart, macroEnd, open, end: close + 1, args, spec, mapped: !!layout });
  });
  return doc;
}

// C# composite format string scanning. `raw` is the string literal including quotes.
export interface Placeholder { index: number; start: number; end: number }
export interface FormatError { start: number; end: number; message: string }

/** Offsets are relative to `raw`; end exclusive. */
export function scanFormat(raw: string): { placeholders: Placeholder[]; errors: FormatError[] } {
  const placeholders: Placeholder[] = [], errors: FormatError[] = [];
  const re = /\{(\d+)(?:,-?\d+)?(?::[^{}]*)?\}/y;
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c === '\\') i++;
    else if (c === '{' || c === '}') {
      if (raw[i + 1] === c) { i++; continue; }
      re.lastIndex = i;
      const m = c === '{' ? re.exec(raw) : null;
      if (m) { placeholders.push({ index: Number(m[1]), start: i, end: i + m[0].length }); i += m[0].length - 1; }
      else errors.push({ start: i, end: i + 1, message: c === '{' ? "Unbalanced or malformed '{' in format string (literal brace is '{{')" : "Unbalanced '}' in format string (literal brace is '}}')" });
    }
  }
  return { placeholders, errors };
}
